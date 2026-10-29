import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0137 — delete again the transactions a customer deleted and block 0087
 * brought back.
 *
 * Block 0136 records the cause: a customer deleting an already content-redacted
 * transaction kept `deletion_reason = 'content_retention_purge'`, and 0087 then
 * cleared its `deleted_at` on the next boot. Those rows are identifiable:
 * `DELETE /v1/transactions/:id` also sets `transaction_quality.deleted_at` in
 * the same database transaction, and nothing else in the codebase writes that
 * column. So a redacted row that still carries a retention reason while its
 * quality row is marked deleted is one of them: either visible again (0087
 * already ran on it) or deleted since the last boot with the wrong reason. The
 * quality row's `deleted_at` is the time of the customer's request, so it
 * becomes the row's `deleted_at` where that is NULL, with
 * `deletion_reason = 'user_request'`, exactly what the route writes. A
 * transaction with no quality row cannot be told apart from an ordinary
 * redacted one and is left alone.
 *
 * The 1095-day purge needs no repair: its selector is `deleted_at IS NULL`, so
 * it re-deletes any row 0087 restored on its next daily run, and with 0136 in
 * place the reason now sticks.
 *
 * Must run after 0136: under 0103's function the reason could not change.
 *
 * DEC-20260504-B: bounded by how many customers deleted a transaction older
 * than 90 days through the API, expected to be small; production was not
 * readable when this was written, so the count is measured first and reported
 * in the outcome. Self-throttled anyway: 1000 rows per statement, each its own
 * commit, until a statement comes back short. Each statement is driven by the
 * few `transaction_quality` rows with `deleted_at` set and joins
 * `transactions` by primary key. One column pair written, no payload, nothing
 * physically deleted.
 *
 * Legal hold is not consulted on purpose: the customer route refuses to
 * delete a held row, so a held row here had its hold placed after the
 * customer's delete, and the route would have left it deleted too.
 */
const BATCH = 1000;

export async function runMigration0137_redeleteCustomerDeletedRedactedRows(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const measured = (await tx.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM transactions t
      JOIN transaction_quality q ON q.transaction_id = t.id
     WHERE t.redacted_at IS NOT NULL
       AND t.deletion_reason IN ('content_retention_purge', 'pii_retention_purge')
       AND q.deleted_at IS NOT NULL
  `)) as unknown as Array<{ n: number }>;
  const found = Number((Array.isArray(measured) ? measured[0] : undefined)?.n ?? 0);

  // At most this many statements: each one moves up to BATCH rows out of the
  // predicate by changing their reason. If the reason cannot change, the
  // final count catches it instead of looping.
  const maxStatements = Math.ceil(found / BATCH) + 1;
  let restored = 0;
  for (let i = 0; found > 0 && i < maxStatements; i++) {
    const res = await tx.execute(sql`
      UPDATE transactions t
         SET deleted_at = COALESCE(t.deleted_at, q.deleted_at),
             deletion_reason = 'user_request'
        FROM transaction_quality q
       WHERE q.transaction_id = t.id
         AND t.id IN (
           SELECT t2.id
             FROM transactions t2
             JOIN transaction_quality q2 ON q2.transaction_id = t2.id
            WHERE t2.redacted_at IS NOT NULL
              AND t2.deletion_reason IN ('content_retention_purge', 'pii_retention_purge')
              AND q2.deleted_at IS NOT NULL
            LIMIT ${BATCH}
         )
    `);
    const count = (res as { count?: number }).count ?? 0;
    restored += count;
    if (count < BATCH) break;
  }

  // If any remain, the trigger did not let the reason change (0136 absent or
  // overwritten): fail loudly, not "done".
  const left = (await tx.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM transactions t
      JOIN transaction_quality q ON q.transaction_id = t.id
     WHERE t.redacted_at IS NOT NULL
       AND t.deletion_reason IN ('content_retention_purge', 'pii_retention_purge')
       AND q.deleted_at IS NOT NULL
  `)) as unknown as Array<{ n: number }>;
  const remaining = Number((Array.isArray(left) ? left[0] : undefined)?.n ?? 0);
  if (remaining !== 0) {
    throw new Error(
      `${remaining} customer-deleted redacted transaction(s) are still visible after the repair ` +
        `(found ${found}, updated ${restored}). The deletion-reason rule from block 0136 is not in effect.`,
    );
  }

  return {
    block: "0137_redeleteCustomerDeletedRedactedRows",
    outcome:
      found === 0
        ? "no change (no customer-deleted redacted transaction was visible)"
        : `${restored} customer-deleted redacted transaction(s) deleted again with deletion_reason user_request`,
    rows_affected: restored,
    duration_ms: Date.now() - startedAt,
  };
}
