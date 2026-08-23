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
 * `complete` and `failed` are **absorbing**. Nothing leaves them. That is not a
 * stylistic choice: the integrity chain anchors a row's receipt digest, so once
 * a row is chained, changing its receipt state would rewrite an already-chained
 * historical fact. Enforced by a database trigger (migration 0108), not here —
 * a rule that only holds when one module is used is not a rule.
 *
 * `legacy_unavailable` is **pre-epoch only** and is not a status at all — it is
 * what a NULL `receipt_status` means when read.
 *
 * ## Who owns `integrity_payload_version` — and it is NOT this module
 *
 * All three functions here used to write `integrity_payload_version = 2`. That
 * was the worst defect in Phase 4's first cut.
 *
 * The column records **which rule produced the integrity hash**, so only the
 * site that computes the hash may write it. Writing it here stamped v2 on a row
 * the chain worker then hashed under v1 — a row declaring one rule and hashed
 * under another. Nothing read the column yet, so rows still verified; the
 * corruption was scheduled to materialise the instant anyone implemented the
 * rule the design documents. Reproduced before removal: stored hash
 * `d9a0d728eb…`, recomputed under the row's own declared rule `78c8ebaa7e…`,
 * verifies false.
 *
 * `jobs/integrity-hash-retry.ts` now writes the version in the same UPDATE as
 * the hash — the discipline that file already applies to `chain_seq`: a row
 * cannot be hashed without recording which rule hashed it.
 *
 * ## The invariant that matters most
 *
 * **A successful business execution must never be recorded as receipt-complete
 * when receipt creation failed.** The transaction still commits — a customer's
 * call succeeded and they are billed for it — but the receipt state says
 * `failed` with a reason, visibly.
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

/** Receipt states from which the integrity chain may hash a row. */
export const TERMINAL_RECEIPT_STATUSES: ReadonlySet<string> = new Set(["complete", "failed"]);

/**
 * Why a row is `pending`.
 *
 * `not_yet_built` is the ordinary case and is NOT a failure. It exists because
 * the `receipt_reason_required` CHECK demands a reason for `pending` as well as
 * `failed`, and the first version defaulted to `internal_error` — so every
 * healthy in-flight receipt landed in the monitoring counts as an internal
 * error. A signal that fires for the normal case is not a signal.
 */
export const PENDING_NOT_YET_BUILT = "not_yet_built";
export type PendingReason = ReceiptFailureReason | typeof PENDING_NOT_YET_BUILT;

/**
 * Reasons worth another attempt, and reasons that are not.
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

export class ReceiptLifecycleError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ReceiptLifecycleError";
  }
}

/**
 * A lifecycle write that matched no row is a bug, not a no-op.
 *
 * All three writers were blind UPDATEs: writing against a transaction id that
 * does not exist silently succeeded, so a caller with a stale or wrong id would
 * believe it had recorded a receipt state that nothing carries.
 */
function assertTouchedOne(rows: unknown, transactionId: string, fn: string): void {
  const n = (rows as unknown as Array<unknown>).length;
  if (n !== 1) {
    throw new ReceiptLifecycleError(
      `${fn} matched ${n} rows for transaction ${transactionId}; expected exactly 1. ` +
        "Either the id is wrong or the row is in a state this transition cannot leave.",
    );
  }
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
  reason: PendingReason = PENDING_NOT_YET_BUILT,
): Promise<void> {
  const rows = await db.execute(sql`
    UPDATE transactions
       SET receipt_status = 'pending',
           receipt_failure_reason = ${reason}
     WHERE id = ${transactionId}::uuid
       AND receipt_status IS DISTINCT FROM 'complete'
       AND receipt_status IS DISTINCT FROM 'failed'
    RETURNING id
  `);
  assertTouchedOne(rows, transactionId, "markReceiptPending");
}

/**
 * Record a built receipt. The only path that may write 'complete'.
 *
 * Guarded on the row still being `pending`: `failed` is absorbing, so a late
 * success must not resurrect a row whose failure may already be anchored in the
 * chain.
 */
export async function markReceiptComplete(
  db: Db,
  transactionId: string,
  receipt: Extract<ReceiptResult, { outcome: "complete" }>,
): Promise<void> {
  const rows = await db.execute(sql`
    UPDATE transactions
       SET receipt_status = 'complete',
           receipt_failure_reason = NULL,
           receipt_version = ${RECEIPT_VERSION},
           receipt_canonicalization = ${RECEIPT_CANONICALIZATION},
           receipt_digest_alg = ${RECEIPT_DIGEST_ALG},
           receipt_digest = ${receipt.digest},
           receipt_manifest_digest = ${receipt.manifestDigest}
     WHERE id = ${transactionId}::uuid
       AND receipt_status = 'pending'
    RETURNING id
  `);
  assertTouchedOne(rows, transactionId, "markReceiptComplete");
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
           receipt_status = CASE
             WHEN ${isRetryable(reason)} AND receipt_attempts + 1 < ${MAX_RECEIPT_ATTEMPTS}
               THEN 'pending'
             ELSE 'failed'
           END,
           -- A failed build must never leave stale success metadata behind: a
           -- digest on a failed row is a commitment to a receipt that was
           -- withdrawn.
           receipt_digest = NULL,
           receipt_version = NULL,
           receipt_canonicalization = NULL,
           receipt_digest_alg = NULL
     WHERE id = ${transactionId}::uuid
       AND receipt_status = 'pending'
    RETURNING receipt_status, receipt_attempts
  `);
  assertTouchedOne(rows, transactionId, "markReceiptFailed");
  const row = (rows as unknown as Array<{ receipt_status: ReceiptStatus; receipt_attempts: number }>)[0];
  return { status: row.receipt_status, attempts: Number(row.receipt_attempts) };
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
 * the alert says which invariant broke. `pending`/`not_yet_built` is the
 * healthy in-flight population and is expected to be non-zero.
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
 * ## What NULL means, honestly
 *
 * A NULL `receipt_status` means "no receipt state was recorded". Today that is
 * the same thing as pre-epoch — but ONLY because no call site writes receipt
 * state yet, and that is a property of the current wiring, not a database
 * invariant. A row inserted right now through the ordinary path is
 * byte-identical to one from April.
 *
 * The epoch becomes structurally enforceable when the rails are wired and every
 * insert sets a status; until then this reports `legacy_unavailable` for
 * anything with no state, which is accurate about what is known and does not
 * claim to distinguish a genuine historical row from an unwired new one.
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
        "no execution receipt was recorded for this transaction; its implementation " +
        "identity was never captured and cannot be reconstructed",
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
