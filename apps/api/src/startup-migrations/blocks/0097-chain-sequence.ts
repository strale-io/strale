import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0097 — monotonic chain sequence (WP7).
 *
 * The head of a hash chain must be "the last row the worker hashed". WP7's
 * first attempt defined it as `max(completed_at)`, which cannot work: measured
 * against production, the median `completed_at - created_at` is MINUS 1.5 ms —
 * the column is stamped from a clock read before the row's `created_at`
 * default — and 78 rows in the last 30 days complete out of creation order.
 * A row admitted after the head but carrying an earlier `completed_at` chains
 * onto the head without becoming it, and the next row chains onto the same
 * parent. One parent, two children. Replaying the rule over 30 days of real
 * traffic produces nine such forks, in clusters.
 *
 * `chain_seq` is assigned from a sequence AT HASH TIME, so it is monotone in
 * the only order that matters — the order rows were actually chained. Clock
 * skew, backdating and per-row retries become structurally incapable of
 * forking the chain rather than merely unlikely to.
 *
 * Cost. `ADD COLUMN` with no default and no NOT NULL is catalog-only in
 * Postgres 11+, so there is no rewrite of a 902k-row / 355 MB hot table. The
 * 863,946 historical rows keep NULL and are simply not head candidates; their
 * chain is unchanged and still verifiable by replay. Exactly ONE row is
 * seeded — the current head under the corrected NULLS LAST rule — so the new
 * sequence continues from where the old chain actually ends instead of
 * starting a second root. A one-row UPDATE, so DEC-20260504-B's backlog-drain
 * concern does not arise.
 *
 * NOT included: an index on `previous_hash`. An earlier draft of this block
 * created one, which production already has as `idx_transactions_previous_hash`
 * (65 MB). `IF NOT EXISTS` matches on NAME, not definition, so that would have
 * built a second 60 MB index on the same column of a hot table — permanent
 * write amplification for zero benefit.
 */
export async function runMigration0097_chainSequence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "chain_seq" bigint
  `);

  await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS "transactions_chain_seq"`);

  // Unique so two rows can never claim the same position, which is the
  // single-parent property expressed structurally. Partial, because every
  // historical row is NULL and must not compete for a slot.
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "transactions_chain_seq_unique"
      ON "transactions" ("chain_seq")
      WHERE "chain_seq" IS NOT NULL
  `);

  // Seed the current head, once. Without this the first post-deploy hash would
  // find no sequenced row and link to GENESIS, silently starting a second root
  // — the very failure this package exists to stop.
  const seeded = await tx.execute(sql`
    UPDATE "transactions" SET "chain_seq" = nextval('transactions_chain_seq')
    WHERE "id" = (
      SELECT "id" FROM "transactions"
      WHERE "integrity_hash" IS NOT NULL AND "completed_at" IS NOT NULL
      ORDER BY "completed_at" DESC NULLS LAST, "id" DESC
      LIMIT 1
    )
    AND NOT EXISTS (SELECT 1 FROM "transactions" WHERE "chain_seq" IS NOT NULL)
  `);

  return {
    block: "0097_chain_sequence",
    outcome:
      "transactions.chain_seq column + sequence + unique index; " +
      `head seeded (${(seeded as unknown as { count?: number }).count ?? 0} row)`,
    duration_ms: Date.now() - startedAt,
  };
}
