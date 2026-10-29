import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0132: drop the residual SQS schema (H7d) ──────────────────────────
//
// The SQS engine was deleted under DEC-20260503-B (2026-05-05), which planned
// this drop. Nothing reads these columns or the table: no code path selects
// them since the drizzle fields were removed in the same change, and the
// public catalogue, solution, x402 and trust responses carry none of them.
//
// Before dropping, the block measures what it removes and reports it in its
// outcome (the boot log), because the data is gone afterwards. Dropping a
// column is a catalogue change in Postgres, not a table rewrite, and
// DROP TABLE frees the table at once, so this is not a bulk operation
// (DEC-20260504-B). Once both are gone a re-run measures nothing and drops
// nothing.
export async function runMigration0132_dropSqsResidualSchema(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  const rows = (await tx.execute(sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'capabilities'
          AND column_name IN ('qp_score', 'rp_score', 'matrix_sqs', 'matrix_sqs_raw', 'trend',
            'guidance_usable', 'guidance_strategy', 'guidance_confidence')) AS columns_present,
      to_regclass('sqs_daily_snapshot') IS NOT NULL AS snapshot_present,
      COALESCE(pg_total_relation_size(to_regclass('sqs_daily_snapshot')), 0)::bigint AS snapshot_bytes,
      (SELECT count(*)::int FROM capabilities) AS capability_rows
  `)) as unknown as Array<{ columns_present: number; snapshot_present: boolean; snapshot_bytes: string | number; capability_rows: number }>;
  const { columns_present: columnsPresent, snapshot_present: snapshotPresent, snapshot_bytes: snapshotBytes,
    capability_rows: capabilityRows } = rows[0];

  if (columnsPresent === 0 && !snapshotPresent) {
    return { block: "0132_dropSqsResidualSchema", outcome: "skipped (already dropped)", rows_affected: 0, duration_ms: Date.now() - startedAt };
  }

  let snapshotRows = 0;
  if (snapshotPresent) {
    const counted = (await tx.execute(sql`SELECT count(*)::int AS n FROM sqs_daily_snapshot`)) as unknown as Array<{ n: number }>;
    snapshotRows = counted[0].n;
  }

  await tx.execute(sql`
    ALTER TABLE capabilities
      DROP COLUMN IF EXISTS qp_score,
      DROP COLUMN IF EXISTS rp_score,
      DROP COLUMN IF EXISTS matrix_sqs,
      DROP COLUMN IF EXISTS matrix_sqs_raw,
      DROP COLUMN IF EXISTS trend,
      DROP COLUMN IF EXISTS guidance_usable,
      DROP COLUMN IF EXISTS guidance_strategy,
      DROP COLUMN IF EXISTS guidance_confidence
  `);
  await tx.execute(sql`DROP TABLE IF EXISTS sqs_daily_snapshot`);

  return {
    block: "0132_dropSqsResidualSchema",
    outcome: `dropped ${columnsPresent} SQS columns from ${capabilityRows} capabilities rows and sqs_daily_snapshot (${snapshotRows} rows, ${Number(snapshotBytes)} bytes)`,
    rows_affected: snapshotRows,
    duration_ms: Date.now() - startedAt,
  };
}
