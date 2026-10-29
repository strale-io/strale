import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0114 (2026-09-12): release the 3 `dependency_health` suites for
// irish-company-data, lithuanian-company-data, and swiss-company-data:
// the genuine-failure population 0113's own follow-up section named and
// left quarantined on purpose (see
// handoff/_general/from-code/2026-09-11-recapture-refusal-lock.md, "Follow-up
// (not fixed this session)"). Each row's stored `input` held an entity
// identifier that no longer resolves against its live registry, while the
// manifest's `test_fixtures.health_check_input` had already been corrected
// to one that does, verified live against each registry directly before
// this block was written, not inferred:
//
//   irish-company-data:      cro_number "461onal" -> "513174"
//                            (513174 resolves: STRIPE PAYMENTS EUROPE, LIMITED)
//   lithuanian-company-data: company_code "301524699" -> "304151376"
//                            (304151376 resolves: AB "Energijos skirstymo operatorius")
//   swiss-company-data:      uid "CHE-116.281.710" -> "CHE-101.602.521"
//                            (CHE-101.602.521 resolves via Zefix: Roche Holding AG)
//
// The exact predicate below (test_type = 'dependency_health' AND
// quarantine_reason LIKE 'fixture_recapture_exhausted:%' AND capability_slug
// IN the three named slugs) cannot touch a row outside those three: no other
// capability slug matches the IN list, and a row for one of these three
// slugs that is not currently quarantined with that exact reason (e.g. an
// operator already fixed it by hand) fails the WHERE and is left alone.
// Idempotency guard mirrors 0113: a startup_migration_ledger row for this
// block short-circuits every later boot, and the `quarantine_reason LIKE`
// clause additionally matches nothing once the reason is NULL (belt and
// braces, same as 0113).
//
// `input` is rewritten to the manifest's corrected value directly (not left
// for a later backfill run) since this block already carries the verified
// live-resolving value in its own predicate literals, the same values
// scripts/onboard.ts --backfill --discover would write via
// checkDependencyHealthDrift (src/lib/test-input-drift.ts) if run today, so
// this block and that general-purpose mechanism converge on the same input.
// `test_mode` is set to 'live' (not 'canary'): these are exactly-once,
// verified-working corrections, not the structurally-incapable-of-a-baseline
// refusal types 0113 handles, so the next scheduled run captures a fresh
// baseline normally.
//
// Workload this resumes (Bulk-Operation Deploy Protocol, DEC-20260504-B): 3
// suites move from "permanently refused, zero calls" back to normal
// scheduling. All three registries are `cost_class: free_unlimited`
// (manifests/irish-company-data.yaml, manifests/lithuanian-company-data.yaml,
// manifests/swiss-company-data.yaml), so this does not reach a paid upstream.
// No backlog to drain (refusing, not queued) and no self-throttle needed:
// three suites resuming their existing schedule tier is not a bulk-operation
// resumption event in the sense DEC-20260504-B targets (that protocol is
// about a bulk DELETE/UPDATE loop processing an accumulated backlog in one
// tick, not three independent per-capability test suites resuming their
// normal per-suite cadence).
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone).

export async function runMigration0114_releaseCorrectedDependencyHealthFixtures(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0114_releaseCorrectedDependencyHealthFixtures";

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
       SET input = CASE capability_slug
             WHEN 'irish-company-data' THEN '{"cro_number":"513174"}'::jsonb
             WHEN 'lithuanian-company-data' THEN '{"company_code":"304151376"}'::jsonb
             WHEN 'swiss-company-data' THEN '{"uid":"CHE-101.602.521"}'::jsonb
           END,
           test_status = 'normal',
           quarantine_reason = NULL,
           fixture_recapture_failures = 0,
           test_mode = 'live',
           baseline_output = NULL,
           baseline_captured_at = NULL,
           updated_at = now()
     WHERE test_type = 'dependency_health'
       AND quarantine_reason LIKE 'fixture_recapture_exhausted:%'
       AND capability_slug IN ('irish-company-data', 'lithuanian-company-data', 'swiss-company-data')
     RETURNING id, capability_slug, test_type
  `)) as unknown as Array<{ id: string; capability_slug: string; test_type: string }>;

  for (const row of released) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'quarantine_recovery',
        ${row.capability_slug},
        2,
        'released_corrected_dependency_health_fixture',
        ${JSON.stringify({
          test_suite_id: row.id,
          test_type: row.test_type,
          reason:
            "quarantined on a genuine failure (3 consecutive live recaptures against a stale entity identifier); the manifest's health_check_input had already been corrected to a resolving identifier, but the pre-existing dependency_health row was never resynced (onboard.ts --backfill only ever updated known_answer). Verified live against the registry before release.",
          source: "startup-migration 0114",
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
        ? "no matching quarantined dependency_health suite remains"
        : `released ${released.length} suite(s): ${released.map((r) => `${r.capability_slug}/${r.test_type}`).join(", ")}`,
    rows_affected: released.length,
    duration_ms: Date.now() - startedAt,
  };
}
