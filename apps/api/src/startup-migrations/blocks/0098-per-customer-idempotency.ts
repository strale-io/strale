import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0098 — per-customer idempotency + request fingerprint (WP6).
 *
 * Two changes, both verified read-only against production first:
 *   - 0 duplicate (user_id, idempotency_key) pairs across 421 keyed rows, so
 *     the new unique index cannot abort boot.
 *   - 0 keyed rows with a NULL user_id, so scoping to the customer strands
 *     nothing.
 *
 * The old index is dropped AFTER the new one exists. Order matters: dropping
 * first would leave a window with no uniqueness at all, and this runs at boot
 * while the previous release is still serving traffic.
 */
export async function runMigration0098_perCustomerIdempotency(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" varchar(64)
  `);

  // Bound the LOCK WAIT, not just the statement. Review finding: this table has
  // ~902k rows and is written by every /v1/do call. CREATE UNIQUE INDEX takes
  // SHARE, which conflicts with the ROW EXCLUSIVE an in-flight execution holds
  // across its external call (bounded at 15s), and a PENDING SHARE request
  // queues every subsequent write behind it. The connection carries
  // statement_timeout=30s and lock wait counts toward it, so a busy deploy
  // window could throw here — and an uncaught throw aborts boot, which on
  // Railway means the old commit keeps serving and the failure is silent.
  //
  // Block 0095 reached the same conclusion for `wallets` and chose the same
  // shape: bound the wait, and on failure log and DEFER to the next boot rather
  // than throwing. Both statements are IF [NOT] EXISTS, so a retry is a no-op
  // once they land.
  let indexOutcome: string;
  try {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "transactions_user_idempotency_key_unique"
        ON "transactions" ("user_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);
    // Only now — see the ordering note above.
    await tx.execute(sql`
      DROP INDEX IF EXISTS "transactions_idempotency_key_unique"
    `);
    indexOutcome = "per-customer index created; global index dropped";
  } catch (err) {
    // Deferring is safe in BOTH directions. Until the new index exists the old
    // global one is still in force and is strictly stricter, so nothing the
    // previous release writes can later violate the new one.
    indexOutcome =
      "index swap deferred to next boot (lock contention): " +
      (err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120));
  }

  return {
    block: "0098_per_customer_idempotency",
    outcome: `idempotency_fingerprint column ensured; ${indexOutcome}`,
    duration_ms: Date.now() - startedAt,
  };
}
