/**
 * Recovers wallet reservations a crash abandoned (WP3, risks CR-01 / N1).
 *
 * Without this job the reservation table is just bookkeeping. This is the part
 * that makes a stranded charge recoverable: it finds reservations that are
 * still non-terminal past their deadline, releases them, and marks the
 * execution failed so a polling client finally sees a terminal state.
 *
 * Two properties make it safe to run against a live system:
 *
 *   - Release is a conditional UPDATE that claims the row before crediting.
 *     A live execution finishing at the same moment either wins and captures,
 *     or loses and finds nothing to capture. Exactly one terminal state per
 *     reservation, no double refund.
 *   - The deadline is generous (15 minutes by default). Releasing a still-
 *     running execution would refund a customer about to receive their result,
 *     which is worse than waiting.
 *
 * Cadence and batching follow DEC-20260504-B, the bulk-operation deploy
 * protocol. This job's very first run in production has a backlog: 11
 * transactions have been stranded since as far back as 2026-04-07. A job that
 * drained them all in one tick would be exactly the workload-resumption event
 * that took Postgres down on 2026-05-04. So each tick is bounded, and the
 * backlog drains over several minutes instead.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import * as reservations from "../lib/wallet-reservations.js";
import { log, logError, logWarn } from "../lib/log.js";

/** Bounded per tick — see the DEC-20260504-B note above. */
const BATCH_SIZE = 25;

/**
 * Cross-replica dedup, matching every other recurring job in index.ts
 * (activation-drip, db-retention, capability-promotion, integrity-hash-retry).
 *
 * Without it the per-tick bound is per-INSTANCE, so N replicas make it N x 25
 * — which is exactly the quantity the DEC-20260504-B argument above depends
 * on. Every replica would also do N-1 wasted transactions per row, each
 * blocking on the same reservation row lock. Money safety never depended on
 * this (the conditional transitions handle concurrency), but the batching
 * claim did.
 */
const ADVISORY_LOCK_ID = 20260821;

const TICK_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 45_000;

export interface ReconcileSummary {
  examined: number;
  released: number;
  /** Refunded, but the execution row was already outside the guarded states. */
  releasedButNotMarked: number;
  alreadyTerminal: number;
  failed: number;
}

/**
 * One pass. Exported so tests can drive it deterministically rather than
 * waiting on an interval — the mistake that left the rest of this codebase's
 * jobs unexercised.
 */
export async function runReservationReconcilerOnce(): Promise<ReconcileSummary> {
  const db = getDb();
  const summary: ReconcileSummary = {
    examined: 0,
    released: 0,
    releasedButNotMarked: 0,
    alreadyTerminal: 0,
    failed: 0,
  };

  // Take the cross-replica lock for the duration of the batch selection. It is
  // transaction-scoped, so it releases when this short transaction commits —
  // the per-reservation work below then runs in its own transactions, which is
  // what keeps one poisoned row from rolling back the recoveries around it.
  const claimed = await db.transaction(async (tx) => {
    const [lock] = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
    )) as unknown as Array<{ acquired?: boolean }>;
    if (!lock?.acquired) return null;
    return reservations.findAbandoned(tx, BATCH_SIZE);
  });

  if (claimed === null) {
    // Another replica is on this tick. Not an error.
    return summary;
  }

  const abandoned = claimed;
  summary.examined = abandoned.length;
  if (abandoned.length === 0) return summary;

  for (const row of abandoned) {
    try {
      // One transaction per reservation, not one for the batch: a single
      // poisoned row must not roll back the recoveries that already
      // succeeded, and holding one transaction across 25 wallets would
      // serialise unrelated customers behind each other.
      const outcome = await db.transaction(async (tx) => {
        // Lock ordering: `transactions` FIRST, then `wallet_reservations`.
        //
        // The success path in do.ts updates the transaction row and then
        // captures, so taking the two row locks in the opposite order here
        // would be a textbook ABBA deadlock. Postgres would abort one side;
        // if it chose the execution, a call that SUCCEEDED would be recorded
        // as failed and its output discarded. Same order on both sides makes
        // that impossible rather than merely unlikely.
        //
        // Claiming the transaction row first is safe because the status guard
        // means a run that already completed matches nothing, and the release
        // below is still conditional — if the execution captured in the
        // meantime, no money moves.
        let transactionMarked = false;
        if (row.transactionId) {
          const marked = await tx
            .update(transactions)
            .set({
              status: "failed",
              error:
                "Execution did not complete — the charge was refunded automatically.",
              completedAt: new Date(),
            })
            .where(
              and(
                eq(transactions.id, row.transactionId),
                // A row that reached 'completed' between the reservation
                // lookup and here must not be rewritten.
                inArray(transactions.status, ["executing", "deferred"]),
              ),
            )
            .returning({ id: transactions.id });
          transactionMarked = marked.length > 0;
        }

        const didRelease = await reservations.release(tx, {
          reservationId: row.id,
          reason: "abandoned — execution never reached a terminal state",
        });

        return { didRelease, transactionMarked };
      });

      if (!outcome.didRelease) {
        summary.alreadyTerminal += 1;
      } else if (row.transactionId && !outcome.transactionMarked) {
        // Refunded, but the execution row stayed non-terminal — it was
        // already outside the guarded statuses. The reservation is terminal
        // now, so findAbandoned will never return it again and nothing else
        // will ever look at it. Counting this as a clean recovery is the
        // swallow-visibility failure DEC-20260504-A exists to prevent, so it
        // gets its own counter and a warning.
        summary.releasedButNotMarked += 1;
        logWarn(
          "reservation-released-transaction-not-marked",
          "released a reservation whose transaction was outside the guarded statuses",
          { reservation_id: row.id, transaction_id: row.transactionId },
        );
      } else {
        summary.released += 1;
      }
    } catch (err) {
      summary.failed += 1;
      logError("reservation-reconcile-failed", err, {
        reservation_id: row.id,
        transaction_id: row.transactionId,
      });
    }
  }

  log.info(
    {
      label: "reservation-reconcile",
      examined: summary.examined,
      released: summary.released,
      released_but_not_marked: summary.releasedButNotMarked,
      already_terminal: summary.alreadyTerminal,
      failed: summary.failed,
    },
    "reservation-reconcile",
  );

  return summary;
}

export function startReservationReconciler(): void {
  setTimeout(() => {
    void runReservationReconcilerOnce().catch((err) =>
      logError("reservation-reconcile-tick-failed", err),
    );
    setInterval(() => {
      void runReservationReconcilerOnce().catch((err) =>
        logError("reservation-reconcile-tick-failed", err),
      );
    }, TICK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
