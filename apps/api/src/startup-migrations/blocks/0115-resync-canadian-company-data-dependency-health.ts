import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0115 (2026-09-12): resync the `canadian-company-data`
// `dependency_health` suite's stale corporation number, the same root cause
// PR #677's block 0114 fixed for irish/lithuanian/swiss-company-data, from
// the wider sweep the brief that added `test-input-drift.ts` asked for
// (`archive/receipts/2026-09-12-sweep-wider-input-drift-groups.json`).
//
// Verified live before this block was written, not inferred (free_unlimited
// cost class, `manifests/canadian-company-data.yaml:8`, no vendor cost for
// either call): the stored input `{"corporation_number":"2408951"}` throws
// "No Canadian federal corporation found for 2408951" against the live
// Corporations Canada API; the manifest's `health_check_input`
// `{"corporation_number":"1007"}` (already corrected 2026-08-12, per that
// manifest's own comment) resolves to "Abbotsford Chamber of Commerce",
// Active since 1947.
//
// Unlike 0113/0114, this row is NOT quarantined (`test_status = 'normal'`,
// `quarantine_reason IS NULL` as of 2026-09-12, checked live, read-only):
// the suite keeps recapturing on every scheduled run and keeps failing
// rather than tripping the fixture-recapture-exhausted lock, so the
// predicate below matches on the exact stale input value instead of a
// quarantine marker. `input = '{"corporation_number":"2408951"}'::jsonb`
// AND `capability_slug = 'canadian-company-data'` AND
// `test_type = 'dependency_health'` cannot touch any other row: no other
// capability shares this slug, and once this block has run once the input
// no longer equals the literal, so the predicate matches nothing on a
// second boot (belt and braces alongside the ledger guard below).
//
// `input` is rewritten to the manifest's corrected value directly, the
// same value `scripts/onboard.ts --backfill --discover` would write via
// `checkDependencyHealthDrift` (`src/lib/test-input-drift.ts`, the general
// mechanism PR #677 added) if run against this slug today; this block and
// that mechanism converge on the same input, per the brief's instruction
// not to write a second resync mechanism. `test_mode` stays `live` (already
// was); baseline is cleared so the next scheduled run captures fresh
// against the corrected input rather than replaying the stale one.
//
// Workload this resumes (Bulk-Operation Deploy Protocol, DEC-20260504-B):
// one test suite moves from "367 runs, 0 passed against a dead identifier"
// to its existing schedule against a live one. `free_unlimited`, so this
// does not reach a paid upstream, and one suite resuming its own cadence is
// not the bulk-DELETE-style resumption event the protocol targets, no
// pre-drain or self-throttle needed beyond the exact-literal predicate
// already built in.
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone;
// this is the narrower "obvious reversible evidence-backed code error" class
// DEC-20260822-A widens Claude's autonomy to include).

export async function runMigration0115_resyncCanadianCompanyDataDependencyHealth(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0115_resyncCanadianCompanyDataDependencyHealth";

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
       SET input = '{"corporation_number":"1007"}'::jsonb,
           baseline_output = NULL,
           baseline_captured_at = NULL,
           test_mode = 'live',
           updated_at = now()
     WHERE test_type = 'dependency_health'
       AND capability_slug = 'canadian-company-data'
       AND input = '{"corporation_number":"2408951"}'::jsonb
     RETURNING id, capability_slug, test_type
  `)) as unknown as Array<{ id: string; capability_slug: string; test_type: string }>;

  for (const row of released) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'auto_fix',
        ${row.capability_slug},
        2,
        'resynced_stale_dependency_health_input',
        ${JSON.stringify({
          test_suite_id: row.id,
          test_type: row.test_type,
          reason:
            "stored dependency_health input (corporation_number 2408951) no longer resolves against the live Corporations Canada registry; the manifest's health_check_input had already been corrected to 1007 (2026-08-12) but the pre-existing row was never resynced (onboard.ts --backfill only ever updated known_answer). Verified live against the registry before release; free_unlimited cost class, no vendor cost for the verification calls.",
          source: "startup-migration 0115",
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
        ? "no matching stale canadian-company-data dependency_health input remains"
        : `resynced ${released.length} suite(s): ${released.map((r) => `${r.capability_slug}/${r.test_type}`).join(", ")}`,
    rows_affected: released.length,
    duration_ms: Date.now() - startedAt,
  };
}
