import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0078: transactions(capability_id, created_at) compound index ────
//
// Phase A0c.1.v3 (2026-05-13). The list-endpoint extension for
// last_customer_call_at runs `SELECT capability_id, MAX(created_at) FROM
// transactions WHERE status='completed' AND user filter GROUP BY
// capability_id`. Without an index on (capability_id, created_at), this
// degrades from index-only aggregate to status-filter-scan + in-memory
// hash aggregate. Fine at pre-launch scale (<10k transactions); degrades
// linearly as the table grows.
//
// The detail handler's per-cap query (capabilities.ts:136-144) ALSO
// benefits — previously it seq-scanned the status='completed' filter set
// looking for one capability_id; now it can index-seek directly.
//
// Idempotency: CREATE INDEX IF NOT EXISTS. Re-runs are no-ops.

export async function runMigration0078_transactionsCapabilityIdCreatedAtIdx(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS transactions_capability_id_created_at_idx
      ON transactions (capability_id, created_at)
  `);

  return {
    block: "0078_transactions_capability_id_created_at_idx",
    outcome: "compound index ensured on transactions(capability_id, created_at)",
    duration_ms: Date.now() - startedAt,
  };
}
