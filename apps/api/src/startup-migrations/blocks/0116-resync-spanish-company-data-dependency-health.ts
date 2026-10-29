import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0116 (2026-09-18): resync the `spanish-company-data`
// `dependency_health` suite's input from a company name to the manifest's
// NIF, the same root cause blocks 0114 and 0115 fixed for four other
// registries: the manifest's `health_check_input` was corrected
// (`manifests/spanish-company-data.yaml`, `nif: A20072302`) and the
// pre-existing row never was, because `onboard.ts --backfill` only ever
// updated known_answer.
//
// Verified live before this block was written, twice, on two days
// (2026-09-17 and 2026-09-18, one call per input each day through the
// registered executor): `{"company_name":"Telefonica"}` throws "No confident
// Spanish registry match for "Telefonica"" — correctly, since several
// Telefónica entities match and a registry name search must score and
// refuse, never take the first result — while `{"nif":"A20072302"}` resolves
// to CONSTRUCCIONES AMENABAR SA, active, from openmercantil.es. So the suite
// has been failing on a correct refusal, which says nothing about whether
// the registry is reachable: the one question a dependency_health suite
// exists to answer.
//
// Checked in production, read-only, on 2026-09-18: exactly one test_suites
// row holds `{"company_name":"Telefonica"}` (this suite,
// `f7f09533-7ff9-4ef7-957d-46d4bbd903bc`), `test_status = 'normal'`,
// `test_mode = 'live'`, not quarantined. So, as in 0115, the predicate
// matches the exact stale literal rather than a quarantine marker, and on a
// second boot it matches nothing even without the ledger guard.
//
// Workload this resumes (Bulk-Operation Deploy Protocol, DEC-20260504-B):
// one suite, already running on its schedule, starts passing. It does not
// change how often the suite runs, so it spends no more of the vendor's
// `free_quota` (200 requests/day, 10% reserved for tests) than it does now.
// Not a bulk-operation resumption event; no pre-drain or throttle needed.
//
// Authority: DEC-20260815-A and DEC-20260822-A (an obvious, reversible,
// evidence-backed correction of our own test input).

export async function runMigration0116_resyncSpanishCompanyDataDependencyHealth(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0116_resyncSpanishCompanyDataDependencyHealth";

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
       SET input = '{"nif":"A20072302"}'::jsonb,
           baseline_output = NULL,
           baseline_captured_at = NULL,
           test_mode = 'live',
           updated_at = now()
     WHERE test_type = 'dependency_health'
       AND capability_slug = 'spanish-company-data'
       AND input = '{"company_name":"Telefonica"}'::jsonb
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
            "stored dependency_health input (company_name Telefonica) is correctly refused as an ambiguous registry name match, so the suite failed on a refusal and never measured availability; the manifest's health_check_input had already been corrected to nif A20072302 but the pre-existing row was never resynced (onboard.ts --backfill only ever updated known_answer). Both inputs verified live on 2026-09-17 and 2026-09-18.",
          source: "startup-migration 0116",
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
        ? "no matching stale spanish-company-data dependency_health input remains"
        : `resynced ${released.length} suite(s): ${released.map((r) => `${r.capability_slug}/${r.test_type}`).join(", ")}`,
    rows_affected: released.length,
    duration_ms: Date.now() - startedAt,
  };
}
