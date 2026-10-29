import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0120 (2026-10-13): declare `fear-greed-index`'s `attribution` output
// field in the database, as PR #633 (2026-09-11) declared it in the manifest.
//
// #633 made the executor emit Alternative.me's required attribution beside
// the data (the condition of commercial use) and added `attribution` to the
// manifest's output_schema.properties and output_field_reliability
// (`guaranteed`). The production row was never synced, so the weekly drift
// sweep has failed on `fear-greed-index output_field_reliability` every week
// since 2026-09-28 and the guaranteed-fields gate has never been asked to
// check the attribution is present.
//
// Verified in production, read-only, on 2026-10-13: the row's
// output_field_reliability holds the six manifest keys without `attribution`,
// and output_schema.properties lacks it; the capability's known_answer and
// edge_case suites passed that day with `attribution` present in the output
// ("Data: Crypto Fear & Greed Index by Alternative.me ..."), so declaring it
// guaranteed cannot turn a passing suite red.
//
// Adds the one key to each column and changes nothing else in either.
// `capabilities.output_field_reliability` and `.output_schema` are also
// written by M050 (block 0090), which only touches slugs listed in
// CAPABILITY_OUTPUT_CONTRACTS; fear-greed-index is not one (a test asserts
// it), so the two never contend for this row. Runs once (ledgered), so a
// later deliberate change to the declaration is not reverted on boot.
//
// One row; not a bulk-operation resumption event (DEC-20260504-B).
// Authority: DEC-20260815-A and DEC-20260822-A (an obvious, reversible,
// evidence-backed correction of our own declaration).

export async function runMigration0120_declareFearGreedAttribution(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0120_declareFearGreedAttribution";

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

  const updated = (await tx.execute(sql`
    UPDATE capabilities
       SET output_field_reliability =
             COALESCE(output_field_reliability, '{}'::jsonb) || '{"attribution":"guaranteed"}'::jsonb,
           output_schema = jsonb_set(
             output_schema,
             '{properties,attribution}',
             '{"type":"string"}'::jsonb,
             true
           )
     WHERE slug = 'fear-greed-index'
       AND (output_schema ? 'properties')
       AND (
         NOT (COALESCE(output_field_reliability, '{}'::jsonb) ? 'attribution')
         OR NOT ((output_schema->'properties') ? 'attribution')
       )
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${updated.length})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      updated.length === 0
        ? "no change (fear-greed-index already declares attribution, or has no output_schema.properties)"
        : "fear-greed-index now declares attribution (guaranteed)",
    rows_affected: updated.length,
    duration_ms: Date.now() - startedAt,
  };
}
