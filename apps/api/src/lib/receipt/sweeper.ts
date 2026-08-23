/**
 * Finishes receipts the request path could not.
 *
 * ## Why this exists at all
 *
 * Since block 0109 every transaction starts `pending`, so a receipt that is
 * never built is not a silent absence - it is a row sitting in a state
 * something has to resolve. Three things produce one: a process killed between
 * the settlement commit and the receipt, a transient database failure inside
 * `settle.ts`, and a rail nobody wired. The first two deserve another attempt.
 * The third deserves an escalation, and `markReceiptFailed` already tells them
 * apart through `RETRYABLE_REASONS`.
 *
 * ## Why a retry is sound here, when it would not have been before
 *
 * A naive sweeper rebuilds the receipt from the environment it is running in,
 * and that is wrong in a way that leaves no trace: after a deploy it would bind
 * the code running NOW to a result produced by the code that ran THEN, and the
 * digest would verify perfectly against the wrong implementation identity.
 *
 * Block 0110 removed the guesswork. `receipt_rail` and `receipt_deploy_commit`
 * are captured at INSERT, and `settle.ts` prefers them over anything ambient,
 * so a retry an hour and two deploys later binds exactly what the original
 * execution bound.
 *
 * ## Bounding
 *
 * Attempts are bounded by `markReceiptFailed`, which flips a row to `failed`
 * once a retryable reason has burned `MAX_RECEIPT_ATTEMPTS`. This module adds
 * the two things that primitive cannot do for itself: exponential spacing
 * between attempts, and advancing the counter when a pass leaves the row
 * pending WITHOUT any reason being recorded - otherwise a row that fails in a
 * way nothing classifies would be retried forever at the sweep interval.
 *
 * ## Isolation
 *
 * Every row is swept in its own try/catch, and none of it runs inside the
 * chain worker's transaction. That is deliberate and it is the Phase 4
 * round-three lesson: the chain tick is one transaction, so a single raised
 * exception there rolled back every other row's work. A receipt sweep that
 * could abort the tamper-evident chain would be a far worse thing than the
 * problem it solves.
 */

import { sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";

import { settleExecutionReceipt } from "./settle.js";
import { markReceiptFailed, MAX_RECEIPT_ATTEMPTS } from "./receipt-lifecycle.js";
import { log } from "../log.js";

type Db = ReturnType<typeof getDb>;

/** How long after creation a pending receipt is first retried. */
export const RECEIPT_SWEEP_GRACE_MS = 60_000;

/** Rows per tick. Bounded so a backlog drains steadily instead of in one gulp. */
export const RECEIPT_SWEEP_LIMIT = 100;

export interface SweepSummary {
  examined: number;
  completed: number;
  failed: number;
  stillPending: number;
}

/**
 * Rows whose receipt is pending, whose transaction has actually settled, and
 * whose backoff window has elapsed.
 *
 * The backoff is derived from `receipt_attempts` and `created_at` rather than
 * from a last-attempt timestamp, because that is one fewer column to keep
 * honest: attempt N is not eligible until the row is `grace * 2^N` old. With
 * the default grace that is 1, 2, 4, 8 and 16 minutes - five attempts spread
 * over roughly half an hour, then terminal.
 *
 * `status IN ('completed','failed')` matters. A row still `executing` or
 * `deferred` has no final result to commit to, and the async path settles it
 * later; sweeping those would race the execution rather than repair anything.
 */
async function selectSweepable(db: Db, limit: number): Promise<
  Array<{ id: string; attempts: number }>
> {
  const rows = (await db.execute(sql`
    SELECT id::text AS id, receipt_attempts
      FROM transactions
     WHERE receipt_status = 'pending'
       AND status IN ('completed', 'failed')
       AND created_at < now() - (
             ${RECEIPT_SWEEP_GRACE_MS}::bigint
             * power(2, least(receipt_attempts, ${MAX_RECEIPT_ATTEMPTS}))
           ) * interval '1 millisecond'
     ORDER BY created_at ASC
     LIMIT ${limit}
  `)) as unknown as Array<{ id: string; receipt_attempts: number }>;
  return rows.map((r) => ({ id: r.id, attempts: Number(r.receipt_attempts) }));
}

async function readReceiptState(
  db: Db,
  id: string,
): Promise<{ status: string | null; attempts: number } | null> {
  const rows = (await db.execute(sql`
    SELECT receipt_status, receipt_attempts
      FROM transactions
     WHERE id = ${id}::uuid
  `)) as unknown as Array<{ receipt_status: string | null; receipt_attempts: number }>;
  const r = rows[0];
  return r ? { status: r.receipt_status, attempts: Number(r.receipt_attempts) } : null;
}

/**
 * One sweep pass. Never throws: a sweeper that can take down its caller is
 * worse than a backlog.
 */
export async function sweepPendingReceipts(
  db: Db,
  limit = RECEIPT_SWEEP_LIMIT,
): Promise<SweepSummary> {
  const summary: SweepSummary = { examined: 0, completed: 0, failed: 0, stillPending: 0 };

  let candidates: Array<{ id: string; attempts: number }>;
  try {
    candidates = await selectSweepable(db, limit);
  } catch (err) {
    log.warn(
      { label: "receipt-sweep-select-failed", err: err instanceof Error ? err.message : String(err) },
      "could not select pending receipts",
    );
    return summary;
  }

  for (const row of candidates) {
    summary.examined += 1;
    try {
      // No rail argument: the row carries the authoritative one. Passing one
      // here would reintroduce exactly the guess block 0110 removed.
      await settleExecutionReceipt(db, { transactionId: row.id });

      const after = await readReceiptState(db, row.id);
      if (!after) continue;

      if (after.status === "complete") {
        summary.completed += 1;
        continue;
      }
      if (after.status === "failed") {
        summary.failed += 1;
        // Terminal, and worth saying out loud: a failed receipt means an
        // execution happened that we cannot commit to.
        log.warn(
          { label: "receipt-sweep-terminal", transaction_id: row.id, attempts: after.attempts },
          "receipt construction is terminally failed for this transaction",
        );
        continue;
      }

      summary.stillPending += 1;
      if (after.attempts === row.attempts) {
        // The pass changed nothing and recorded no reason. Without this the
        // row would be retried at the sweep interval forever, because the
        // counter that bounds retries would never move.
        await markReceiptFailed(db, row.id, "internal_error");
      }
    } catch (err) {
      log.warn(
        {
          label: "receipt-sweep-row-failed",
          transaction_id: row.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "sweeping one pending receipt threw; the rest of the batch continues",
      );
    }
  }

  if (summary.examined > 0) {
    log.info(
      { label: "receipt-sweep", ...summary },
      "receipt sweep pass complete",
    );
  }
  return summary;
}
