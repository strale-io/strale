import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/** Private immutable email snapshots support safe delivery retries. No
 * customer data is copied and no existing production rows are rewritten. */
export async function runMigration0152_businessSummaryDeliveries(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS business_summary_deliveries (
      report_day date PRIMARY KEY,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz
    )
  `);
  return { block: "0152_businessSummaryDeliveries", outcome: "table ensured", duration_ms: Date.now() - startedAt };
}
