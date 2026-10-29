import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Block set executed in order. Append new migrations here. Order is
 * historical (oldest first); idempotency makes the order operationally
 * irrelevant on existing prod, but it's the audit-trail-friendly shape.
 *
 * Exported so the admin endpoint regression test can introspect the
 * canonical block list and assert it matches what the endpoint returns.
 */
// ─── Block 0095: wallet reservations + non-negative balance (WP3) ───────────
//
// Two changes, both additive and both reversible by dropping what they create.
//
// 1. `wallet_reservations` — the durable record that makes a charge
//    recoverable after a crash. See the table comment in db/schema.ts.
//
// 2. CHECK (balance_cents >= 0) — the backstop under the application-level
//    affordability check, so no future path can overdraw even if it bypasses
//    the wallet service entirely.
//
// SHAPE NOTES, both learned the hard way in review:
//
//   Every statement is independently idempotent — IF NOT EXISTS on the table
//   and on each index, and an exception-guarded ADD CONSTRAINT. The first
//   draft used check-then-bare-DDL, which is the TOCTOU shape block 0093's
//   comment (a few hundred lines below) documents as already having broken a
//   deploy: two overlapping boots both read "absent", both issue the bare
//   statement, the loser throws, and `runStartupMigrations` aborts boot on any
//   throw. Railway runs old and new instances together during a rolling
//   deploy, so overlapping boots are the normal case, not the edge.
//
//   The indexes are created unconditionally rather than inside a
//   "table was absent" branch. The runner has no transaction wrapper, so each
//   statement commits on its own: a kill between CREATE TABLE and the index
//   builds would otherwise leave the table permanently without
//   `wallet_reservations_transaction_id_unique`, which is the only thing
//   stopping a retry opening a second hold on one execution. A missing guard
//   that no gate would ever notice is worse than a failed migration.
//
//   The constraint is added NOT VALID and validated separately. ADD CONSTRAINT
//   with validation takes ACCESS EXCLUSIVE on `wallets` for the length of a
//   full table scan, and the sync /v1/do path holds a FOR UPDATE row lock on
//   that table across an external HTTP call — so the ALTER can queue behind a
//   live request and, while queued, block every other `wallets` query behind
//   it. NOT VALID skips the scan and takes the lock only briefly; VALIDATE
//   then takes just SHARE UPDATE EXCLUSIVE. Production was verified read-only
//   (59 wallets, none negative), so validation cannot fail on existing rows —
//   but that only ever addressed row content, never lock acquisition.
//
//   Finally, constraint work is failure-tolerant: if it cannot be applied on
//   this boot it is logged and retried on the next one rather than thrown.
//   The table is what the running code needs; a deferred constraint costs
//   nothing, whereas a throw here aborts boot, and per MEMORY a failed Railway
//   deploy does not cut over — /health would silently keep serving the old
//   commit.
export async function runMigration0095_walletReservations(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "wallet_reservations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "wallet_id" uuid NOT NULL REFERENCES "wallets"("id"),
      "user_id" uuid NOT NULL REFERENCES "users"("id"),
      "amount_cents" integer NOT NULL,
      "state" varchar(16) DEFAULT 'reserved' NOT NULL,
      "transaction_id" uuid,
      "deadline_at" timestamptz NOT NULL,
      "terminal_reason" text,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )
  `);

  // Unconditional and individually idempotent — see the shape note above.
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "wallet_reservations_state_deadline_idx"
      ON "wallet_reservations" ("state", "deadline_at")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "wallet_reservations_wallet_id_idx"
      ON "wallet_reservations" ("wallet_id")
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "wallet_reservations_transaction_id_unique"
      ON "wallet_reservations" ("transaction_id")
      WHERE "transaction_id" IS NOT NULL
  `);

  let constraintOutcome: string;
  try {
    // duplicate_object is the only expected failure and means a concurrent
    // boot won; anything else propagates to the catch below and defers.
    await tx.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "wallets"
          ADD CONSTRAINT "wallets_balance_cents_non_negative"
          CHECK ("balance_cents" >= 0) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    // Cheap lock, and a no-op if already validated.
    await tx.execute(sql`
      ALTER TABLE "wallets"
        VALIDATE CONSTRAINT "wallets_balance_cents_non_negative"
    `);
    constraintOutcome = "constraint present and validated";
  } catch (err) {
    // Deliberately not rethrown — see the failure-tolerance note above.
    constraintOutcome = `constraint deferred to a later boot (${
      err instanceof Error ? err.message : "unknown error"
    })`;
  }

  return {
    block: "0095_wallet_reservations",
    outcome: `wallet_reservations ensured; ${constraintOutcome}`,
    duration_ms: Date.now() - startedAt,
  };
}
