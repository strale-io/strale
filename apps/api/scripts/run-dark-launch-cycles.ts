/**
 * Trigger 5 test run cycles for all dark-launched capabilities.
 *
 * Collects caps where visible=false AND lifecycle_state IN (draft, validating, probation),
 * runs 5 cycles with 90s pauses between cycles (so DATE_TRUNC minute windows differ),
 * 2-3s delay between capabilities within a cycle.
 *
 * Special handling:
 *   - Nominatim-based caps (address-validate, address-geocode): +1.5s extra delay
 *   - opensanctions-based caps: 5 req/day limit → only 5 total calls across all cycles
 *
 * Usage:
 *   npx tsx scripts/run-dark-launch-cycles.ts [--dry-run]
 *   PROD=1 npx tsx scripts/run-dark-launch-cycles.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
// Root .env has DATABASE_URL; apps/api/.env (UTF-16) has ADMIN_SECRET.
// Load root first; then inject ADMIN_SECRET manually since dotenv can't parse UTF-16.
config({ path: resolve(import.meta.dirname, "../../../.env") });

// If ADMIN_SECRET not set by dotenv (UTF-16 .env), allow override via shell env
// (caller can set ADMIN_SECRET=xxx npx tsx ...)
// No further action needed — process.env.ADMIN_SECRET will be checked below.

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const PROD_URL = "https://api.strale.io";

const BASE_URL = process.env.API_BASE_URL ?? PROD_URL;
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const DRY_RUN = process.argv.includes("--dry-run");

const CYCLES = 5;
const CYCLE_PAUSE_MS = 92_000; // 92s > 60s to ensure different DATE_TRUNC minute windows
const BETWEEN_CAP_MS = 2_500;  // 2.5s between capabilities in a cycle
const NOMINATIM_EXTRA_MS = 1_500;

// Caps that use Nominatim (need extra rate-limit delay)
const NOMINATIM_CAPS = new Set(["address-validate", "address-geocode"]);

// Caps that use OpenSanctions (5 req/day free tier — skip after first cycle)
const OPENSANCTIONS_CAPS = new Set(["pep-check", "adverse-media-check", "aml-risk-score"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runTest(slug: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${BASE_URL}/v1/internal/tests/run?slug=${encodeURIComponent(slug)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ADMIN_SECRET}`,
      "Content-Type": "application/json",
    },
  });
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = await resp.text().catch(() => "(no body)");
  }
  return { ok: resp.ok, status: resp.status, body };
}

async function triggerHealthSweep(): Promise<unknown> {
  const url = `${BASE_URL}/v1/internal/health-sweep`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
  }).catch(() => null);
  if (!resp) return null;
  return resp.json().catch(() => null);
}

async function getQuality(slug: string): Promise<unknown> {
  const url = `${BASE_URL}/v1/quality/${encodeURIComponent(slug)}`;
  const resp = await fetch(url).catch(() => null);
  if (!resp) return null;
  return resp.json().catch(() => null);
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

const db = getDb();

const allCaps = await db
  .select({ slug: capabilities.slug, name: capabilities.name })
  .from(capabilities)
  .where(
    and(
      eq(capabilities.visible, false),
      inArray(capabilities.lifecycleState, ["draft", "validating", "probation"])
    )
  )
  .orderBy(capabilities.slug);

const slugs: string[] = allCaps.map((r) => r.slug);

if (slugs.length === 0) {
  console.log("No dark-launched capabilities found.");
  process.exit(0);
}

console.log(`Found ${slugs.length} dark-launched capabilities:`);
slugs.forEach((s) => console.log(`  ${s}`));
console.log();

if (DRY_RUN) {
  console.log("[DRY RUN] Would run 5 cycles for the above slugs. Exiting.");
  process.exit(0);
}

if (!ADMIN_SECRET) {
  console.error("ADMIN_SECRET not set — cannot proceed.");
  process.exit(1);
}

console.log(`Target: ${BASE_URL}`);
console.log(`Running ${CYCLES} cycles with ${CYCLE_PAUSE_MS / 1000}s pauses between cycles`);
console.log();

// Track results: slug → cycle → pass|fail
type CycleResult = { pass: boolean; detail: string };
const results: Record<string, CycleResult[]> = {};
for (const slug of slugs) results[slug] = [];

// OpenSanctions: only run in cycle 1 (5 calls total across 24 caps is fine, but they share the day quota)
// We'll allow them in all cycles up to 5 calls total — that's exactly 5 if we keep 1 cycle
// Actually: 3 OAS caps × 5 cycles = 15 calls > 5/day limit
// Strategy: run OAS caps only in cycle 1
const oasSlugs = slugs.filter((s) => OPENSANCTIONS_CAPS.has(s));
const regularSlugs = slugs.filter((s) => !OPENSANCTIONS_CAPS.has(s));

console.log(`OpenSanctions caps (cycle 1 only): ${oasSlugs.join(", ") || "none"}`);
console.log(`Regular caps (all 5 cycles): ${regularSlugs.length}`);
console.log();

for (let cycle = 1; cycle <= CYCLES; cycle++) {
  const cycleStart = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`CYCLE ${cycle}/${CYCLES}  [${new Date().toISOString()}]`);
  console.log("=".repeat(60));

  // Determine which slugs to run this cycle
  const toRun = cycle === 1 ? slugs : regularSlugs;

  let pass = 0;
  let fail = 0;

  for (const slug of toRun) {
    process.stdout.write(`  ${slug.padEnd(40)} `);

    const t0 = Date.now();
    const result = await runTest(slug);
    const elapsed = Date.now() - t0;

    const ok = result.ok;
    const detail = ok
      ? `OK (${elapsed}ms)`
      : `FAIL ${result.status}: ${JSON.stringify(result.body).slice(0, 80)}`;

    results[slug].push({ pass: ok, detail });
    console.log(ok ? `✓ ${detail}` : `✗ ${detail}`);
    ok ? pass++ : fail++;

    // Rate limit delays
    const delay = NOMINATIM_CAPS.has(slug)
      ? BETWEEN_CAP_MS + NOMINATIM_EXTRA_MS
      : BETWEEN_CAP_MS;
    await sleep(delay);
  }

  // For cycles 2-5, mark OAS caps as skipped
  if (cycle > 1) {
    for (const slug of oasSlugs) {
      results[slug].push({ pass: false, detail: "SKIPPED (OpenSanctions quota)" });
    }
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  console.log(`\nCycle ${cycle} summary: ${pass} passed, ${fail} failed (${elapsed}s)`);

  if (cycle < CYCLES) {
    console.log(`\nWaiting ${CYCLE_PAUSE_MS / 1000}s before next cycle...`);
    await sleep(CYCLE_PAUSE_MS);
  }
}

// ────────────────────────────────────────────────────────────────────
// Summary table
// ────────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log("FINAL SUMMARY");
console.log("=".repeat(60));
console.log(`${"Capability".padEnd(42)} C1  C2  C3  C4  C5  Total`);
console.log("-".repeat(60));

for (const slug of slugs) {
  const cycleResults = results[slug];
  const cols = cycleResults.map((r) => (r.pass ? "✓" : r.detail.startsWith("SKIP") ? "-" : "✗"));
  while (cols.length < 5) cols.push("-");
  const totalPass = cycleResults.filter((r) => r.pass).length;
  console.log(`${slug.padEnd(42)} ${cols.join("   ")}  ${totalPass}/5`);
}

// ────────────────────────────────────────────────────────────────────
// Lifecycle evaluation (health sweep)
// ────────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log("TRIGGERING LIFECYCLE SWEEP");
console.log("=".repeat(60));
process.stdout.write("  Running health-sweep... ");
const sweepResult = await triggerHealthSweep();
console.log("done");
if (sweepResult && typeof sweepResult === "object") {
  const r = sweepResult as any;
  if (r.transitions?.length) {
    console.log(`  Transitions: ${r.transitions.length}`);
    for (const t of r.transitions) {
      console.log(`    ${t.slug}: ${t.from} → ${t.to} — ${t.reason ?? ""}`);
    }
  } else {
    console.log("  No transitions triggered.");
  }
}

// ────────────────────────────────────────────────────────────────────
// SQS check
// ────────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log("SQS SCORES");
console.log("=".repeat(60));
console.log(`${"Capability".padEnd(42)} SQS   Status      Lifecycle`);
console.log("-".repeat(70));

for (const slug of slugs) {
  await sleep(200);
  const q = await getQuality(slug) as any;
  if (!q) {
    console.log(`${slug.padEnd(42)} (fetch error)`);
    continue;
  }
  const sqs = q.sqs != null ? String(q.sqs).padStart(5) : "  N/A";
  const status = (q.qualification_status ?? q.status ?? "").padEnd(12);
  const lifecycle = q.lifecycle_state ?? "";
  console.log(`${slug.padEnd(42)} ${sqs}  ${status} ${lifecycle}`);
}

console.log("\nDone.");
process.exit(0);
