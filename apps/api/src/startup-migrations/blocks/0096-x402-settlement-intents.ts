import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0096 — x402 settlement intents (WP5).
 *
 * Same shape discipline as 0095, for the same reason: every statement is
 * independently idempotent, and the indexes are created unconditionally rather
 * than inside a table-was-absent branch. The runner has no transaction, so a
 * kill between CREATE TABLE and the index builds would otherwise leave a unique
 * index permanently absent — and here that index is the "one canonical record
 * per settlement" guarantee, which is the whole point of the block.
 *
 * New table, starts empty. DEC-20260504-B backlog-drain does not apply: there
 * is no accumulated workload for the reconciler's first run, because nothing
 * has ever written an intent.
 */
export async function runMigration0096_x402SettlementIntents(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "x402_settlement_intents" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "payment_hash" text NOT NULL,
      "slug" text NOT NULL,
      "solution_slug" text,
      "price_cents" integer NOT NULL,
      "price_usd" numeric(10, 4),
      "state" varchar(16) DEFAULT 'settling' NOT NULL,
      "settlement_id" text,
      "transaction_id" uuid,
      "failure_reason" text,
      "escalated_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )
  `);

  // Separate ADD COLUMN as well as the inline definition: the table may already
  // exist from an earlier boot of this same block before the column was added.
  // IF NOT EXISTS on both, so either order is a no-op the second time.
  await tx.execute(sql`
    ALTER TABLE "x402_settlement_intents"
      ADD COLUMN IF NOT EXISTS "escalated_at" timestamptz
  `);

  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "x402_settlement_intents_payment_hash_unique"
      ON "x402_settlement_intents" ("payment_hash")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "x402_settlement_intents_state_updated_idx"
      ON "x402_settlement_intents" ("state", "updated_at")
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "x402_settlement_intents_settlement_id_unique"
      ON "x402_settlement_intents" ("settlement_id")
      WHERE "settlement_id" IS NOT NULL
  `);

  // One canonical record per settlement, on the table that actually holds the
  // revenue. Review finding: WP5 named this defect on `transactions` and then
  // only constrained the intents table, leaving duplicate prevention resting on
  // the unrelated payment-hash index — a different guarantee that happens to
  // work only because the recovery path populates that column too.
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "transactions_x402_settlement_id_unique"
      ON "transactions" ("x402_settlement_id")
      WHERE "x402_settlement_id" IS NOT NULL
  `);

  return {
    block: "0096_x402_settlement_intents",
    outcome:
      "x402_settlement_intents table + 3 indexes, escalated_at column, " +
      "and the transactions.x402_settlement_id unique index (idempotent)",
    duration_ms: Date.now() - startedAt,
  };
}
