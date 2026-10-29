import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0129: marginal per-call costs, no historical estimates/backfill ────
export async function runMigration0129_transactionCost(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'transactions' AND column_name = 'cost_cents') THEN
        PERFORM set_config('lock_timeout', '3s', true);
        ALTER TABLE transactions ADD COLUMN cost_cents numeric(24,9);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'transactions' AND column_name = 'cost_breakdown') THEN
        PERFORM set_config('lock_timeout', '3s', true);
        ALTER TABLE transactions ADD COLUMN cost_breakdown jsonb;
      END IF;
    END $$
  `);
  return { block: "0129_transactionCost", outcome: "ensured nullable per-call cost columns", duration_ms: Date.now() - startedAt };
}
