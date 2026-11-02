import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0119 (2026-10-10): resync the `german-company-data`
// `dependency_health` suite's input from `{"company_name":"Google"}` to the
// manifest's `health_check_input`, `{"company_name":"SAP SE"}` -- the last
// of the six registries DQ-33 named, and the same root cause blocks 0114,
// 0115 and 0116 fixed for the other five: the manifest was corrected and the
// pre-existing row never was, because `onboard.ts --backfill` only ever
// updated known_answer.
//
// "Google" is correctly refused: OpenRegister's search is fuzzy, it returns
// no confident German registry match for the bare name, and a registry name
// search must score and refuse, never take the first result. So the suite
// has failed on a correct refusal (its last run, 2026-10-07T00:06Z: "No
// confident German registry match for "Google"") and never measured whether
// the registry is reachable, the one question a dependency_health suite
// exists to answer.
//
// Verified in production, read-only, on 2026-10-10: the capability's live
// schema_check suite (6714cbe5-8a76-48b8-9b7a-22c6cbeadd4c) holds exactly
// `{"company_name":"SAP SE"}`, runs in `live` mode through the production
// OpenRegister key, and passed at 2026-10-07T00:18Z -- twelve minutes after
// this suite failed on "Google". The key exists only in production, so that
// run is the verification. DQ-33 deferred this block until the OpenRegister
// allowance reset on 2026-10-07, so a passing check would not compete with
// the paying buyer's German lookups. Exactly one test_suites row holds
// `{"company_name":"Google"}` for this capability
// (69a00c0a-7eeb-4e9e-b6ad-e6314ac3a2be), `test_mode = 'live'`.
//
// Workload this resumes (Bulk-Operation Deploy Protocol, DEC-20260504-B):
// one suite, already running on its schedule, starts passing. A passing run
// spends one OpenRegister credit where a refused one spends roughly none;
// the suite has run about once every few days, against 474 of 500 credits
// left on 2026-10-10 (resets 2026-11-06). Not a bulk-operation resumption
// event; no pre-drain or throttle needed.
//
// Disjoint from M040 (block 0111), which only INSERTs german-company-data
// known_answer fixture rows and never updates a dependency_health row.
//
// Authority: DEC-20260815-A and DEC-20260822-A (an obvious, reversible,
// evidence-backed correction of our own test input).

export async function runMigration0119_resyncGermanCompanyDataDependencyHealth(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0119_resyncGermanCompanyDataDependencyHealth";

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
       SET input = '{"company_name":"SAP SE"}'::jsonb,
           baseline_output = NULL,
           baseline_captured_at = NULL,
           test_mode = 'live',
           updated_at = now()
     WHERE test_type = 'dependency_health'
       AND capability_slug = 'german-company-data'
       AND input = '{"company_name":"Google"}'::jsonb
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
            "stored dependency_health input (company_name Google) is correctly refused as having no confident German registry match, so the suite failed on a refusal and never measured availability; the manifest's health_check_input had already been corrected to company_name SAP SE but the pre-existing row was never resynced (onboard.ts --backfill only ever updated known_answer). SAP SE verified by the capability's own live schema_check suite passing in production on 2026-10-07.",
          source: "startup-migration 0119",
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
        ? "no matching stale german-company-data dependency_health input remains"
        : `resynced ${released.length} suite(s): ${released.map((r) => `${r.capability_slug}/${r.test_type}`).join(", ")}`,
    rows_affected: released.length,
    duration_ms: Date.now() - startedAt,
  };
}
