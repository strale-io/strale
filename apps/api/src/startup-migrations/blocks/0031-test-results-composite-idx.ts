import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0031: test_results composite index ───────────────────────────────
//
// CREATE INDEX IF NOT EXISTS — idempotent at the SQL level. On re-run
// Postgres detects the existing index and is a no-op.

export async function runMigration0031_testResultsCompositeIdx(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "test_results_suite_executed_idx"
    ON "test_results" ("test_suite_id", "executed_at" DESC)
  `);
  return {
    block: "0031_test_results_suite_executed_idx",
    outcome: "ensured composite index on (test_suite_id, executed_at DESC)",
    duration_ms: Date.now() - startedAt,
  };
}
