import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0110 - the two facts a receipt cannot be rebuilt without.
 *
 * The sweeper (jobs/receipt-sweeper.ts) finishes receipts the request path
 * could not. Writing it exposed a soundness problem that is worth stating
 * plainly, because the obvious implementation is wrong:
 *
 *  - **The rail is not recoverable from the row.** Nothing on `transactions`
 *    says which surface created it. A sweeper would have to GUESS - infer
 *    `x402` from `payment_method`, `internal` from the system user id - and a
 *    guessed value has no business inside a commitment whose whole purpose is
 *    to be exact.
 *
 *  - **The deploy commit drifts.** `resolveDeployCommit()` answers for the
 *    process asking, so a receipt rebuilt after a deploy would bind the code
 *    that is running NOW to a result produced by the code that ran THEN. That
 *    is not a smaller truth, it is a false one, and it would be invisible: the
 *    digest would verify perfectly against the wrong implementation identity.
 *
 * So both are captured at INSERT, where they are known exactly, and `settle.ts`
 * prefers the row's values over anything ambient. This also makes the request
 * path itself more correct, not just the sweeper - the commit bound is the one
 * that was serving when the transaction was created, rather than whatever the
 * environment happens to say a few milliseconds later.
 *
 * A site that never sets `receipt_rail` leaves it NULL, and the sweeper records
 * `unmapped_rail` - which is already in Phase 2's closed reason set, and is
 * exactly what a new unwired rail should produce: a loud, correctly-named
 * invariant failure rather than a plausible guess.
 *
 * Both columns are nullable and both CHECKs are `NOT VALID`: every existing row
 * is pre-epoch and has neither.
 */
export async function runMigration0110_receiptExecutionContext(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS receipt_rail TEXT,
      ADD COLUMN IF NOT EXISTS receipt_deploy_commit TEXT
  `);

  // The rail is a closed enum. Enforced here rather than trusted, because the
  // whole point of the column is that a verifier can rely on it.
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_rail_closed') THEN
        ALTER TABLE transactions
          ADD CONSTRAINT receipt_rail_closed
          CHECK (receipt_rail IS NULL OR receipt_rail IN ('v1_do','x402','mcp','a2a','internal'))
          NOT VALID;
      END IF;
    END $$
  `);

  // A full 40-hex commit, or the local-build sentinel. Anything else is a
  // truncated or decorated value pretending to be an identity.
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_deploy_commit_shape') THEN
        ALTER TABLE transactions
          ADD CONSTRAINT receipt_deploy_commit_shape
          CHECK (
            receipt_deploy_commit IS NULL
            OR receipt_deploy_commit = 'unknown-local-build'
            OR receipt_deploy_commit ~ '^[0-9a-f]{40}$'
          )
          NOT VALID;
      END IF;
    END $$
  `);

  const verify = (await tx.execute(sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_name = 'transactions'
          AND column_name IN ('receipt_rail', 'receipt_deploy_commit')) AS cols,
      (SELECT count(*)::int FROM pg_constraint
        WHERE conname IN ('receipt_rail_closed', 'receipt_deploy_commit_shape')) AS checks
  `)) as unknown as Array<{ cols: number; checks: number }>;

  const row = verify[0];
  if (Number(row?.cols) !== 2) {
    throw new Error(`0110: expected 2 receipt context columns, found ${row?.cols}`);
  }
  if (Number(row?.checks) !== 2) {
    throw new Error(`0110: expected 2 receipt context CHECKs, found ${row?.checks}`);
  }

  return {
    block: "0110_receipt_execution_context",
    outcome: "receipt_rail + receipt_deploy_commit columns and their closed-set CHECKs verified",
    duration_ms: Date.now() - startedAt,
  };
}
