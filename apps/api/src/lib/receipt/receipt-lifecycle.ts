/**
 * Receipt lifecycle persistence (Phase 4 §C).
 *
 * A post-epoch transaction may not simply have a null receipt with no
 * explanation. Three states, and every one of them says something:
 *
 *   complete  a digest exists and can be recomputed
 *   pending   the row committed, the receipt has not been built yet — the
 *             expected transient state, because the money path must never wait
 *             on receipt construction
 *   failed    construction was attempted and could not honestly complete;
 *             `receipt_failure_reason` says why
 *
 * `legacy_unavailable` is **pre-epoch only** and is not a status at all — it is
 * what a NULL `receipt_status` means when read. Using it post-epoch would
 * disguise a present-day defect as a policy about history, which is the exact
 * confusion the lifecycle exists to prevent.
 *
 * ## The invariant that matters most
 *
 * **A successful business execution must never be recorded as receipt-complete
 * when receipt creation failed.** The transaction still commits — a customer's
 * call succeeded and they are billed for it — but the receipt state says
 * `failed` with a reason, visibly. The database enforces this too: the
 * `transactions_receipt_complete_is_complete` CHECK refuses a 'complete' row
 * without a digest, so the two cannot drift even if this module is bypassed.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  RECEIPT_CANONICALIZATION,
  RECEIPT_DIGEST_ALG,
  RECEIPT_VERSION,
  type ReceiptFailureReason,
  type ReceiptResult,
} from "./execution-receipt.js";

type Db = PostgresJsDatabase<Record<string, never>> | PostgresJsDatabase<any>;

export type ReceiptStatus = "complete" | "pending" | "failed";

/**
 * Reasons that are worth another attempt, and reasons that are not.
 *
 * The split is whether the thing that failed can plausibly be different next
 * time. A database hiccup can; a rail nobody mapped cannot, and retrying it
 * would bury the escalation an operator is supposed to act on.
 */
export const RETRYABLE_REASONS: ReadonlySet<ReceiptFailureReason> = new Set([
  "snapshot_write_failed",
  "internal_error",
]);

export const TERMINAL_REASONS: ReadonlySet<ReceiptFailureReason> = new Set([
  "unmapped_rail",
  "missing_deploy_identity",
  "unresolvable_manifest",
  "missing_subject",
  "canonicalization_error",
]);

/** Attempts before a retryable reason becomes terminal. */
export const MAX_RECEIPT_ATTEMPTS = 5;

export function isRetryable(reason: ReceiptFailureReason): boolean {
  return RETRYABLE_REASONS.has(reason);
}

/**
 * Mark a row as awaiting its receipt.
 *
 * Written in the same transaction as the row itself, so a post-epoch row is
 * never momentarily indistinguishable from a pre-epoch one.
 */
export async function markReceiptPending(
  db: Db,
  transactionId: string,
  reason: ReceiptFailureReason = "internal_error",
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
       SET receipt_status = 'pending',
           receipt_failure_reason = ${reason},
           integrity_payload_version = 2
     WHERE id = ${transactionId}::uuid
  `);
}

/** Record a built receipt. The only path that may write 'complete'. */
export async function markReceiptComplete(
  db: Db,
  transactionId: string,
  receipt: Extract<ReceiptResult, { outcome: "complete" }>,
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
       SET receipt_status = 'complete',
           receipt_failure_reason = NULL,
           receipt_version = ${RECEIPT_VERSION},
           receipt_canonicalization = ${RECEIPT_CANONICALIZATION},
           receipt_digest_alg = ${RECEIPT_DIGEST_ALG},
           receipt_digest = ${receipt.digest},
           receipt_manifest_digest = ${receipt.manifestDigest},
           integrity_payload_version = 2
     WHERE id = ${transactionId}::uuid
  `);
}

/**
 * Record a refusal.
 *
 * A terminal reason goes straight to `failed`. A retryable one stays `pending`
 * until the attempt budget is spent, then becomes `failed` carrying the last
 * reason — so exhaustion is visible rather than looking like a stall.
 */
export async function markReceiptFailed(
  db: Db,
  transactionId: string,
  reason: ReceiptFailureReason,
): Promise<{ status: ReceiptStatus; attempts: number }> {
  const rows = await db.execute(sql`
    UPDATE transactions
       SET receipt_attempts = receipt_attempts + 1,
           receipt_failure_reason = ${reason},
           integrity_payload_version = 2,
           receipt_status = CASE
             WHEN ${isRetryable(reason)} AND receipt_attempts + 1 < ${MAX_RECEIPT_ATTEMPTS}
               THEN 'pending'
             ELSE 'failed'
           END,
           -- A failed build must never leave stale success metadata behind.
           receipt_digest = NULL,
           receipt_version = NULL,
           receipt_canonicalization = NULL,
           receipt_digest_alg = NULL
     WHERE id = ${transactionId}::uuid
    RETURNING receipt_status, receipt_attempts
  `);
  const row = (rows as unknown as Array<{ receipt_status: ReceiptStatus; receipt_attempts: number }>)[0];
  return { status: row?.receipt_status ?? "failed", attempts: Number(row?.receipt_attempts ?? 0) };
}

/** Rows a retry sweep should pick up. Bounded; oldest first. */
export async function selectPendingReceipts(
  db: Db,
  limit = 50,
): Promise<Array<{ id: string; attempts: number; reason: string | null }>> {
  const rows = await db.execute(sql`
    SELECT id::text AS id, receipt_attempts, receipt_failure_reason
      FROM transactions
     WHERE receipt_status = 'pending'
     ORDER BY created_at ASC
     LIMIT ${limit}
  `);
  return (rows as unknown as Array<{ id: string; receipt_attempts: number; receipt_failure_reason: string | null }>)
    .map((r) => ({ id: r.id, attempts: Number(r.receipt_attempts), reason: r.receipt_failure_reason }));
}

/**
 * What monitoring reads.
 *
 * A non-zero `failed` count is an alert, not a dashboard curiosity: it means
 * executions are happening that cannot be committed to. Grouped by reason so
 * the alert says which invariant broke.
 */
export async function receiptHealthCounts(
  db: Db,
): Promise<Array<{ status: string; reason: string | null; n: number }>> {
  const rows = await db.execute(sql`
    SELECT receipt_status AS status, receipt_failure_reason AS reason, count(*)::int AS n
      FROM transactions
     WHERE receipt_status IN ('pending', 'failed')
     GROUP BY 1, 2
     ORDER BY 3 DESC
  `);
  return (rows as unknown as Array<{ status: string; reason: string | null; n: number }>)
    .map((r) => ({ status: r.status, reason: r.reason, n: Number(r.n) }));
}

/**
 * How a row's receipt state reads to a verifier.
 *
 * The epoch is not a column and does not need to be: a NULL `receipt_status`
 * IS pre-epoch, because migration 0107 added the column with no backfill and
 * every write since sets it. There is no moment at which a post-epoch row has
 * a null status, so the two populations cannot be confused — and the
 * `transactions_chain_v2_has_receipt_state` CHECK makes that structural rather
 * than merely true today.
 */
export function describeReceiptState(row: {
  receiptStatus: string | null;
  receiptFailureReason: string | null;
  receiptDigest: string | null;
}):
  | { status: "legacy_unavailable"; reason: string }
  | { status: "complete"; digest: string }
  | { status: "pending" | "failed"; reason: string } {
  if (row.receiptStatus === null) {
    return {
      status: "legacy_unavailable",
      reason:
        "this transaction predates the execution-receipt epoch; its implementation " +
        "identity was never recorded and cannot be reconstructed",
    };
  }
  if (row.receiptStatus === "complete" && row.receiptDigest) {
    return { status: "complete", digest: row.receiptDigest };
  }
  return {
    status: row.receiptStatus === "failed" ? "failed" : "pending",
    reason: row.receiptFailureReason ?? "unknown",
  };
}
