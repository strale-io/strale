import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0113: release the 32 wrongly-quarantined refusal-type suites ───
//
// 2026-09-11 incident (see test-runner.ts's fixture-recapture-tracking
// comment and browserless-suite-migration.ts's REFUSAL_ONLY_TYPES doc
// comment for the full account): the pre-fix recapture-failure condition
// (`!(passed && capResult?.output)`) counted a PASSING negative/edge_case/
// known_bad refusal (the capability correctly rejects bad input — no
// output, by design) as a failed fixture-recapture attempt. Three
// consecutive scheduled passes quarantined the suite exactly as fast as
// three genuine failures would have, and permanently — no baseline ever
// existed for these suites to self-heal into a fixture replay.
//
// Verified against production (read-only query, 2026-09-11): 35 rows carry
// `quarantine_reason LIKE 'fixture_recapture_exhausted:%'`, quarantined
// 2026-08-18..2026-08-21, across the 12 capabilities
// browserless-suite-migration.ts targets. 32 of them (test_type IN
// ('negative','edge_case','known_bad')) had exactly
// `MAX_FIXTURE_RECAPTURE_FAILURES` consecutive `passed: true` / no-output
// test_results rows immediately before the quarantine, never a
// `passed: false` one — the exact wrong-lock signature this block targets.
// The remaining 3 (test_type = 'dependency_health', on irish-company-data,
// lithuanian-company-data, swiss-company-data) quarantined on GENUINE
// execution failures (their fixed canary/health-check entity numbers no
// longer resolve against the live registries — a fixture-input-drift issue,
// separate from this bug) and are deliberately NOT touched here: the
// predicate below scopes to test_type, which structurally excludes them.
//
// Predicate, exact and narrow: `quarantine_reason` carries the specific
// marker this bug writes (`FIXTURE_RECAPTURE_QUARANTINE_MARKER` in
// test-runner.ts) AND `test_type` is one of the three refusal-only types
// AND `capability_slug` is one of the 12 target capabilities
// (browserless-suite-migration.ts's TARGET_SLUGS) — the only population
// this migration was ever converted for, so nothing outside it could have
// hit this exact cause. A row failing on ANY leg (a different
// quarantine_reason, a different test_type, a different capability) is
// left untouched.
//
// Idempotent: after the first successful run, `quarantine_reason` is NULL
// on every matched row, so the `LIKE 'fixture_recapture_exhausted:%'` guard
// matches nothing on a second boot — `rows_affected: 0`, verified below via
// the `RETURNING` count driving the ledger write, same convention as
// 0112's promotedSlugs count.
//
// test_mode is set to 'canary' here, not left as 'fixture' — matching the
// corrected browserless-suite-migration.ts planning logic (these three
// types can never capture a baseline, so 'fixture' has nothing to replay
// and would fall through to a live call on every dispatch anyway). Canary
// mode gets a 24h floor via `minRetestIntervalHours` (jobs/test-scheduler.ts)
// on the automatic scheduler's eligibility query, and never re-enters the
// fixture-recapture machinery, so this cause cannot recur for these rows on
// scheduled dispatch. That floor is not unconditional: a direct
// `POST /v1/internal/tests/run` admin call (routes/internal-tests.ts) still
// reaches the executor with no floor in the way, same as for any other
// suite — bounding this population's cost on the normal schedule is what
// this block does, not making a manual re-run cost-free.
//
// Workload this resumes (Bulk-Operation Deploy Protocol, DEC-20260504-B):
// 32 suites move from "permanently refused, zero calls" back to "canary,
// one live call at most every 24h". All 32 inputs are constructed to fail
// before or immediately at input validation (empty object, empty string
// field, or an "INVALID_TEST_VALUE_12345"/"not-a-url" sentinel) — per
// CLAUDE.md Principle B, every executor here validates before any external
// call for the `negative` type (input `{}`), and for `edge_case`/
// `known_bad` on the six URL-based capabilities (accessibility-audit,
// eu-regulation-search, html-to-pdf, screenshot-url, seo-audit,
// tech-stack-detect, url-to-markdown) that reach Browserless before
// rejecting, canary's 24h floor bounds it to at most one Browserless call
// per suite per day — 32 suites x <=1/day, not the hourly cadence the
// original 2026-08-18 migration was built to eliminate. No backlog to
// drain (these suites were refusing, not queued), so this is a
// self-throttling fix (option b), not a pre-drain.
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone).

export async function runMigration0113_releaseWronglyQuarantinedRefusalSuites(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0113_releaseWronglyQuarantinedRefusalSuites";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  const released = (await tx.execute(sql`
    UPDATE test_suites
       SET test_status = 'normal',
           quarantine_reason = NULL,
           fixture_recapture_failures = 0,
           test_mode = 'canary',
           updated_at = now()
     WHERE test_type IN ('negative', 'edge_case', 'known_bad')
       AND quarantine_reason LIKE 'fixture_recapture_exhausted:%'
       AND capability_slug IN (
         'screenshot-url', 'html-to-pdf', 'url-to-markdown', 'tech-stack-detect',
         'seo-audit', 'accessibility-audit', 'eu-regulation-search',
         'japanese-company-data', 'swiss-company-data', 'latvian-company-data',
         'lithuanian-company-data', 'irish-company-data'
       )
     RETURNING id, capability_slug, test_type
  `)) as unknown as Array<{ id: string; capability_slug: string; test_type: string }>;

  for (const row of released) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'quarantine_recovery',
        ${row.capability_slug},
        2,
        'released_wrongly_quarantined_recapture_lock',
        ${JSON.stringify({
          test_suite_id: row.id,
          test_type: row.test_type,
          reason:
            "quarantined on 3 consecutive PASSING refusal-type test runs (a bug in the fixture-recapture-failure counter, fixed 2026-09-11 in test-runner.ts), not a genuine failure — verified against the suite's own test_results history before release",
          source: "startup-migration 0113",
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${released.length})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      released.length === 0
        ? "no wrongly-quarantined refusal suite remains"
        : `released ${released.length} suite(s): ${released.map((r) => `${r.capability_slug}/${r.test_type}`).join(", ")}`,
    rows_affected: released.length,
    duration_ms: Date.now() - startedAt,
  };
}
