import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Phase 4 — receipt lifecycle columns and the chain-version marker.
 *
 * The CHECK constraints encode the state invariants the spec states in prose,
 * because prose does not stop a write:
 *
 *  - a receipt digest is a FULL 256-bit value or absent; a truncated one is a
 *    different claim wearing the same name;
 *  - 'complete' requires the digest and its metadata, so a failed receipt
 *    build can never be recorded as complete;
 *  - 'pending' and 'failed' require a reason code from the closed set, so a
 *    post-epoch row can never be quietly receipt-less;
 *  - `integrity_payload_version` is 2 or NULL, and NULL means v1 by
 *    definition — the verifier reads this to pick the algorithm.
 *
 * The epoch itself is NOT a column: it is `receipt_status IS NULL` meaning
 * pre-epoch. See the receipt-epoch block below for why that is enough.
 */
export async function runMigration0107_executionReceiptColumns(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS receipt_status varchar(16),
      ADD COLUMN IF NOT EXISTS receipt_failure_reason varchar(40),
      ADD COLUMN IF NOT EXISTS receipt_version varchar(32),
      ADD COLUMN IF NOT EXISTS receipt_canonicalization varchar(16),
      ADD COLUMN IF NOT EXISTS receipt_digest_alg varchar(16),
      ADD COLUMN IF NOT EXISTS receipt_digest varchar(71),
      ADD COLUMN IF NOT EXISTS receipt_manifest_digest varchar(71),
      ADD COLUMN IF NOT EXISTS receipt_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS integrity_payload_version integer
  `);

  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_status_valid
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_status_valid
      CHECK (receipt_status IS NULL OR receipt_status IN ('complete', 'pending', 'failed'))
      NOT VALID
  `);

  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_digest_shape
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_digest_shape
      CHECK (receipt_digest IS NULL OR receipt_digest ~ '^sha256:[0-9a-f]{64}$')
      NOT VALID
  `);

  // 'complete' is a claim that a digest exists and can be recomputed. Without
  // the metadata a verifier cannot reproduce it, so the claim would be empty.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_complete_is_complete
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_complete_is_complete
      CHECK (
        receipt_status IS DISTINCT FROM 'complete'
        OR (receipt_digest IS NOT NULL
            AND receipt_version IS NOT NULL
            AND receipt_canonicalization IS NOT NULL
            AND receipt_digest_alg IS NOT NULL)
      )
      NOT VALID
  `);

  // A non-complete post-epoch row must SAY why. Silence is the failure mode
  // the whole lifecycle exists to remove.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_reason_required
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_reason_required
      CHECK (
        receipt_status NOT IN ('pending', 'failed')
        OR receipt_failure_reason IS NOT NULL
      )
      NOT VALID
  `);

  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_integrity_payload_version_valid
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_integrity_payload_version_valid
      CHECK (integrity_payload_version IS NULL OR integrity_payload_version = 2)
      NOT VALID
  `);

  // Chain v2 anchors the receipt digest, so a v2 row without one would anchor
  // nothing while claiming to.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_chain_v2_has_receipt_state
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_chain_v2_has_receipt_state
      CHECK (integrity_payload_version IS DISTINCT FROM 2 OR receipt_status IS NOT NULL)
      NOT VALID
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS transactions_receipt_status_idx
      ON transactions (receipt_status)
      WHERE receipt_status IN ('pending', 'failed')
  `);

  // NOT VALID everywhere above is deliberate: 921k existing rows all have NULL
  // receipt columns and satisfy every constraint, but VALIDATE would take a
  // full-table scan inside the boot path. New writes are checked from this
  // moment; the backfill scan is not this block's job and there is nothing to
  // find. Verified below rather than assumed.
  // EXISTS with LIMIT 1, not count(*) over an OR.
  //
  // The first version counted `receipt_status IS NOT NULL OR
  // integrity_payload_version IS NOT NULL`, which no index can serve — a full
  // sequential scan of the largest table (~921k rows) on EVERY boot, inside the
  // migration transaction. Reviewer-found. This answers the same question
  // (is any row already carrying receipt state?) and stops at the first hit.
  const bad = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM transactions WHERE receipt_status IS NOT NULL LIMIT 1
    ) AS any_state
  `);
  const preexisting =
    (bad as unknown as Array<{ any_state: boolean }>)[0]?.any_state === true ? 1 : 0;

  return {
    block: "0107_execution_receipt_columns",
    outcome:
      "receipt lifecycle columns + 6 CHECK constraints + pending/failed index; " +
      `pre-existing receipt state present: ${preexisting === 1} (expected false)`,
    rows_affected: preexisting,
    duration_ms: Date.now() - startedAt,
  };
}
