/**
 * Groups the fixture-drift actionable set by cause.
 *
 * `fixture-drift.ts` (PR #674) answers "is a suite's stored input stale
 * relative to its manifest, and does it never pass" -- the actionable-set
 * conjunction its own doc comment explains. It does not say why a suite
 * never passes, which matters for deciding what to do about each one: a
 * stale registry identifier is fixable by resyncing the input; a
 * paid_prepaid capability's `ALLOW_MATRIX` context refusal is not fixable
 * by any input at all, since the refusal fires before the executor ever
 * sees the input (`apps/api/src/capabilities/guarded-executor.ts`,
 * `assertGuardedAllow`); an ambiguous name-match refusal needs a
 * disambiguating identifier, not just any input; a `free_quota` budget
 * exhaustion is a scheduling question, not a data one.
 *
 * Re-uses `findFixtureDrift` (no second implementation of the drift
 * comparison) and classifies each finding's `sampleFailure` text plus its
 * manifest's `cost_class`/`quota_cap`/`quota_window` into one of:
 * `stale_identifier`, `ambiguous_match`, `policy_refusal`, `quota_refusal`,
 * `other`. Read-only, production; prints JSON to stdout for a receipt.
 *
 * Usage: npx tsx scripts/fixture-drift-groups.ts > /tmp/out.json
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { load as loadYaml } from "js-yaml";

import { findFixtureDrift, type ManifestFixture, type SuiteRow } from "../src/lib/fixture-drift.js";
import { openOperatorDrizzle } from "../src/lib/operator-db.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
config({ path: resolve(REPO_ROOT, ".env") });

const MANIFEST_DIR = resolve(REPO_ROOT, "manifests");
const days = 30;
const testType = "dependency_health";

function readManifests(): {
  fixtures: ManifestFixture[];
  costClass: Map<string, unknown>;
  quotaCap: Map<string, unknown>;
  quotaWindow: Map<string, unknown>;
} {
  const fixtures: ManifestFixture[] = [];
  const costClass = new Map<string, unknown>();
  const quotaCap = new Map<string, unknown>();
  const quotaWindow = new Map<string, unknown>();
  for (const file of readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".yaml"))) {
    let parsed: unknown;
    try {
      parsed = loadYaml(readFileSync(resolve(MANIFEST_DIR, file), "utf8"));
    } catch {
      continue;
    }
    const manifest = parsed as {
      slug?: string;
      cost_class?: unknown;
      quota_cap?: unknown;
      quota_window?: unknown;
      test_fixtures?: { health_check_input?: unknown };
    };
    if (!manifest?.slug) continue;
    fixtures.push({ slug: manifest.slug, healthCheckInput: manifest.test_fixtures?.health_check_input });
    costClass.set(manifest.slug, manifest.cost_class ?? null);
    quotaCap.set(manifest.slug, manifest.quota_cap ?? null);
    quotaWindow.set(manifest.slug, manifest.quota_window ?? null);
  }
  return { fixtures, costClass, quotaCap, quotaWindow };
}

function classify(sampleFailure: string | null): string {
  const s = sampleFailure ?? "";
  if (/refuses invocation from context kind/.test(s)) return "policy_refusal";
  if (/has exhausted its .* test budget/.test(s)) return "quota_refusal";
  if (/No confident .* registry match|Ambiguous .* name|none with that exact/.test(s)) return "ambiguous_match";
  if (/quota exceeded|quota has been temporarily exceeded|daily quota .* exhausted/i.test(s)) return "quota_refusal";
  if (/No .* (found|company found)|does not exist|could not find/i.test(s)) return "stale_identifier";
  return "other";
}

async function main(): Promise<void> {
  const db = openOperatorDrizzle();
  const rows: any = await db.execute(sql`
    SELECT ts.id AS suite_id,
           ts.capability_slug,
           ts.test_type,
           ts.input,
           c.is_active,
           COUNT(tr.id)::int                              AS runs,
           COUNT(tr.id) FILTER (WHERE tr.passed)::int     AS passed,
           LEFT((array_agg(tr.failure_reason ORDER BY tr.executed_at DESC)
                 FILTER (WHERE tr.failure_reason IS NOT NULL))[1], 300) AS sample_failure
      FROM test_suites ts
      JOIN capabilities c ON c.slug = ts.capability_slug
      LEFT JOIN test_results tr
        ON tr.test_suite_id = ts.id
       AND tr.executed_at >= now() - (${days}::text || ' days')::interval
     WHERE ts.test_type = ${testType}
       AND ts.active = true
     GROUP BY ts.id, ts.capability_slug, ts.test_type, ts.input, c.is_active
  `);

  const suites: SuiteRow[] = (rows.rows ?? rows).map((r: any) => ({
    suiteId: String(r.suite_id),
    capabilitySlug: r.capability_slug,
    testType: r.test_type,
    input: typeof r.input === "string" ? JSON.parse(r.input) : r.input,
    runs: Number(r.runs),
    passed: Number(r.passed),
    sampleFailure: r.sample_failure,
    capabilityActive: r.is_active === true,
  }));

  const { fixtures, costClass, quotaCap, quotaWindow } = readManifests();
  const findings = findFixtureDrift(suites, fixtures, { testType });

  const grouped: Record<string, unknown[]> = {};
  for (const f of findings) {
    const cause = classify(f.sampleFailure);
    const entry = {
      slug: f.slug,
      suiteId: f.suiteId,
      capabilityActive: f.capabilityActive,
      runs: f.runs,
      productionInput: f.productionInput,
      manifestInput: f.manifestInput,
      sampleFailure: f.sampleFailure,
      cost_class: costClass.get(f.slug) ?? null,
      quota_cap: quotaCap.get(f.slug) ?? null,
      quota_window: quotaWindow.get(f.slug) ?? null,
    };
    (grouped[cause] ??= []).push(entry);
  }

  const out = {
    test_type: testType,
    days,
    active_suites_count: suites.length,
    manifests_count: fixtures.length,
    findings_count: findings.length,
    groups: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, { count: v.length, items: v }])),
  };
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
