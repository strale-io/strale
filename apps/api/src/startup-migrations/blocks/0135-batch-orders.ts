import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0135: batch orders (portfolio plan Phase 3 item 5) ───────────────
//
// One new, empty table; no existing table is altered. A row is the order for
// POST /v1/do/batch: one capability, many inputs, one quote, one set of
// wallet holds taken in a single transaction. It is written once and never
// updated — per-item outcomes live on the item holds (wallet_reservations)
// and the item transactions they link to, so a crash mid-batch leaves nothing
// on this row to repair.
//
// The partial unique index makes one Idempotency-Key name one batch per
// account, so two concurrent submissions of the same key cannot both reserve.
export async function runMigration0135_batchOrders(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS batch_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      api_key_id uuid,
      capability_id uuid NOT NULL REFERENCES capabilities(id),
      idempotency_key varchar(255),
      idempotency_fingerprint varchar(64) NOT NULL,
      item_count integer NOT NULL,
      unit_price_cents integer NOT NULL,
      quoted_total_cents integer NOT NULL,
      max_total_price_cents integer NOT NULL,
      item_reservation_ids jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS batch_orders_user_idempotency_key_unique
      ON batch_orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  `);
  return { block: "0135_batchOrders", outcome: "ensured batch_orders", duration_ms: Date.now() - startedAt };
}
