/**
 * Operator sweep: execute every paid capability's known_answer fixture and
 * check it against its declared assertions.
 *
 *   npx tsx scripts/sweep-paid-fixtures.ts
 *
 * Run this after changing a paid capability, and periodically. It is the only
 * way a paid capability's fixture gets verified against live output.
 *
 * WHY THIS EXISTS: guardedExecute's ALLOW_MATRIX refuses paid_prepaid /
 * paid_subscription from internal_test, ci and health_probe contexts. Both
 * onboard.ts --discover and smoke-test.ts invoke exclusively through
 * internal_test, so no paid capability has ever had its fixture verified
 * against live output. This calls the executor directly, deliberately, once
 * per capability, under operator supervision.
 *
 * COSTS REAL MONEY. Each run makes one live call per capability — mostly
 * Claude Haiku and Serper, so cents in total. Vendors that are metered or
 * genuinely expensive are on DENYLIST below and are reported as skipped
 * rather than called; extend that list rather than removing it.
 *
 * First run (2026-08-09) swept 85 of 92 and found: eu-trademark-search's
 * known_answer input was a SQL-injection probe string rather than a real
 * trademark, and product-reviews-extract returned status=completed with every
 * review field null while still billing the caller.
 *
 * Nothing here writes test_results or capability_health — direct getExecutor
 * calls bypass the test runner entirely.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
// guarded-executor-exempt: deliberate operator-supervised paid sweep. The
// ALLOW_MATRIX correctly refuses paid execution from internal_test/ci/
// health_probe; this script IS the sanctioned manual bypass (see file header:
// run by an operator, one call per capability, DENYLIST for metered vendors).
// Routing through guardedExecute would defeat its purpose.
import { getExecutor } from "../src/capabilities/index.js";

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

// Metered or expensive vendors — deliberately NOT swept. Reported as skipped.
// Shared with sweep-prod-catalog.ts via lib/sweep-denylist.ts.
import { SWEEP_DENYLIST as DENYLIST } from "./lib/sweep-denylist.js";

const PER_CAP_TIMEOUT_MS = 45_000;
const CONCURRENCY = 4;

type Outcome = "PASS" | "FIXTURE_FAIL" | "ENV_BLOCKED" | "UPSTREAM_ERROR" | "NO_EXECUTOR" | "SKIPPED";

interface Row {
  slug: string;
  outcome: Outcome;
  detail: string;
  failedChecks?: string[];
  ms?: number;
}

function getPath(o: any, p: string): any {
  return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
}

function classifyError(msg: string): Outcome {
  const m = msg.toLowerCase();
  if (/is required|not set|missing.*key|no api key|browserless_token|api key/.test(m)) return "ENV_BLOCKED";
  return "UPSTREAM_ERROR";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(t!)) as Promise<T>;
}

await autoRegisterCapabilities();

const caps = await sql<{ slug: string; input: any; validation_rules: any }[]>`
  SELECT DISTINCT ON (c.slug) c.slug, ts.input, ts.validation_rules
  FROM capabilities c
  JOIN test_suites ts ON ts.capability_slug = c.slug
  WHERE c.cost_class IN ('paid_prepaid','paid_subscription')
    AND c.is_active = true
    AND ts.test_type = 'known_answer' AND ts.active = true
  ORDER BY c.slug, ts.id`;

console.log(`sweeping ${caps.length} paid capabilities (${DENYLIST.size} denylisted)\n`);

const results: Row[] = [];
let cursor = 0;

async function worker(): Promise<void> {
  while (true) {
    const i = cursor++;
    if (i >= caps.length) return;
    const { slug, input, validation_rules } = caps[i];

    if (DENYLIST.has(slug)) {
      results.push({ slug, outcome: "SKIPPED", detail: DENYLIST.get(slug)! });
      continue;
    }
    const fn = getExecutor(slug);
    if (!fn) {
      results.push({ slug, outcome: "NO_EXECUTOR", detail: "not registered (deactivated?)" });
      continue;
    }

    const t0 = Date.now();
    try {
      const r: any = await withTimeout(fn(input as any), PER_CAP_TIMEOUT_MS);
      const ms = Date.now() - t0;
      const out = r?.output ?? {};
      const checks: any[] = validation_rules?.checks ?? validation_rules?.expected_fields ?? [];
      const failed: string[] = [];
      for (const c of checks) {
        const field = c.field ?? c.name;
        const op = c.operator ?? "not_null";
        const v = getPath(out, field);
        let ok: boolean;
        if (op === "not_null") ok = v !== null && v !== undefined;
        else if (op === "type") {
          ok = c.value === "array" ? Array.isArray(v)
            : c.value === "object" ? typeof v === "object" && v !== null && !Array.isArray(v)
            : typeof v === c.value;
        } else if (op === "equals") ok = JSON.stringify(v) === JSON.stringify(c.value);
        else if (op === "contains") {
          ok = typeof v === "string" ? v.toLowerCase().includes(String(c.value).toLowerCase())
            : Array.isArray(v) ? v.some((x) => JSON.stringify(x).toLowerCase().includes(String(c.value).toLowerCase()))
            : false;
        } else ok = v !== null && v !== undefined;
        if (!ok) failed.push(`${field}[${op}${c.value !== undefined ? "=" + JSON.stringify(c.value) : ""}] got ${JSON.stringify(v)?.slice(0, 60)}`);
      }
      results.push(
        failed.length
          ? { slug, outcome: "FIXTURE_FAIL", detail: `${checks.length - failed.length}/${checks.length} checks passed`, failedChecks: failed, ms }
          : { slug, outcome: "PASS", detail: `${checks.length}/${checks.length} checks passed`, ms },
      );
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      results.push({ slug, outcome: classifyError(msg), detail: msg.slice(0, 150), ms: Date.now() - t0 });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
results.sort((a, b) => a.slug.localeCompare(b.slug));

const order: Outcome[] = ["FIXTURE_FAIL", "UPSTREAM_ERROR", "ENV_BLOCKED", "NO_EXECUTOR", "SKIPPED", "PASS"];
const counts: Record<string, number> = {};
for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;

console.log("=== SUMMARY ===");
for (const o of order) if (counts[o]) console.log(`${o.padEnd(15)} ${counts[o]}`);

for (const o of order) {
  const rows = results.filter((r) => r.outcome === o);
  if (!rows.length) continue;
  console.log(`\n=== ${o} (${rows.length}) ===`);
  for (const r of rows) {
    console.log(`${r.slug} — ${r.detail}${r.ms ? ` (${r.ms}ms)` : ""}`);
    for (const f of r.failedChecks ?? []) console.log(`    ✗ ${f}`);
  }
}

await sql.end();
process.exit(0);
