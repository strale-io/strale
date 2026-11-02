import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 1 (runMigration0028_sqsDailySnapshot) retired with the SQS engine
// (DEC-20260503-B). The sqs_daily_snapshot table is dropped in PR2.

// ─── Block 2: actual_cost_cents on test_run_log ─────────────────────────────
//
// Adds the column conditionally — IF NOT EXISTS isn't quite enough here
// because the column has a `NOT NULL DEFAULT 0` constraint that we want
// to apply on first creation only. The information_schema check makes
// that explicit and matches the prior shape.

export async function runMigration0029_actualCostCents(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  // information_schema column counts return bigint; coerce via text to avoid postgres-js's bigint→string default.
  const check = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM information_schema.columns
    WHERE table_name = 'test_run_log' AND column_name = 'actual_cost_cents'
  `);
  const rows = Array.isArray(check) ? check : (check as { rows?: unknown[] })?.rows ?? [];
  const exists = (rows[0] as { cnt?: string })?.cnt !== "0";

  if (exists) {
    return {
      block: "0029_actual_cost_cents",
      outcome: "skipped (column already exists)",
      duration_ms: Date.now() - startedAt,
    };
  }

  await tx.execute(sql`
    ALTER TABLE "test_run_log" ADD COLUMN "actual_cost_cents" integer DEFAULT 0 NOT NULL
  `);

  return {
    block: "0029_actual_cost_cents",
    outcome: "added column",
    duration_ms: Date.now() - startedAt,
  };
}
