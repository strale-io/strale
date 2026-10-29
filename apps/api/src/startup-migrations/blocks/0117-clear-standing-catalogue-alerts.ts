import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0117 (2026-09-26): clear two invariant alerts that have fired on
// every invariant tick since 2026-08-25 (367 times each by 2026-09-25) and
// were carried in the morning records as "standing" without an owner. Both
// are data the public capability pages render, and both are our own rows
// disagreeing with manifests that were already right.
//
// (1) `compliance_profile_completeness`: five active Czech capabilities have
// `capabilities.geography IS NULL`, so their public compliance profile falls
// back to "global" and does not map the EU frameworks as primary. The sibling
// `cz-company-data` already holds 'eu' and its manifest says so; the five
// manifests carried no `geography` line at all (added in this change). The
// UPDATE only fills NULL, matching the field's `hybrid` authority
// (capability-field-authority.ts: "Backfill fills NULL; preserves set
// values"), so an operator-set value is never overwritten.
//
// (2) `fixture_quality`: the three active `adverse-media-check` known_answer
// suites store `{"entity_name": ...}`. The executor accepts `entity_name` as
// an alias, but the input schema requires `name`, so the example the public
// page renders fails the published contract. The manifest's known_answer
// already reads `name: Wirecard AG`. The predicate matches the two exact
// stale literals, so a suite already holding `name` never matches.
//
// Checked in production, read-only, on 2026-09-26: exactly five capabilities
// match (1) and exactly three test_suites rows match (2). The three suites are
// `test_mode = 'fixture'` and `scheduled_testing_eligible = false` (last run
// 2026-08-27), so moving their `updated_at` — which marks the stored baseline
// stale — schedules no paid Dilisense call. No other capability's known_answer
// is flagged by this invariant; other `entity_name`-only suites (aml-risk-score,
// vasp-*) validate against their own schemas and are deliberately not touched.
//
// The third standing alert, `lying_breaker` on `danish-company-data`, is not
// fixed here: its breaker row has been frozen since 2026-08-16 while the
// harness still calls the capability daily, so a value written now would
// describe a writer nobody has examined. Recorded in the 2026-09-26 record.
//
// Workload (DEC-20260504-B): eight rows, once. Not a bulk operation.
// Authority: DEC-20260815-A and DEC-20260822-A (obvious, reversible,
// evidence-backed correction of our own data to match its manifest).

export async function runMigration0117_clearStandingCatalogueAlerts(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0117_clearStandingCatalogueAlerts";

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

  const geo = (await tx.execute(sql`
    UPDATE capabilities
       SET geography = 'eu'
     WHERE slug IN ('cz-bank-account-validate', 'cz-birth-number-validate',
                    'cz-datova-schranka-id-validate', 'cz-ico-validate',
                    'cz-unreliable-vat-payer')
       AND geography IS NULL
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  const fixtures = (await tx.execute(sql`
    UPDATE test_suites
       SET input = jsonb_build_object('name', input->>'entity_name'),
           updated_at = now()
     WHERE capability_slug = 'adverse-media-check'
       AND test_type = 'known_answer'
       AND input IN ('{"entity_name":"Wirecard AG"}'::jsonb,
                     '{"entity_name":"Spotify Technology SA"}'::jsonb)
     RETURNING id, capability_slug, test_type
  `)) as unknown as Array<{ id: string; capability_slug: string; test_type: string }>;

  const affected = geo.length + fixtures.length;

  if (affected > 0) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'auto_fix',
        NULL,
        2,
        'cleared_standing_catalogue_alerts',
        ${JSON.stringify({
          geography_filled: geo.map((r) => r.slug),
          known_answer_inputs_renamed: fixtures.map((r) => r.id),
          reason:
            "compliance_profile_completeness and fixture_quality had alerted on every tick since 2026-08-25; production rows disagreed with manifests that were already correct (geography 'eu' as for cz-company-data; adverse-media-check known_answer uses the schema's required 'name', not the 'entity_name' alias).",
          source: "startup-migration 0117",
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${affected})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      affected === 0
        ? "no matching NULL geography or stale adverse-media-check input remains"
        : `filled geography on ${geo.length} capability(s); renamed ${fixtures.length} known_answer input(s)`,
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
