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

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import * as reservations from "../lib/wallet-reservations.js";
import { log, logError } from "../lib/log.js";

/** Bounded per tick — see the DEC-20260504-B note above. */
const BATCH_SIZE = 25;

const TICK_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 45_000;

export interface ReconcileSummary {
  examined: number;
  released: number;
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
    alreadyTerminal: 0,
    failed: 0,
  };

  const abandoned = await reservations.findAbandoned(db, BATCH_SIZE);
  summary.examined = abandoned.length;
  if (abandoned.length === 0) return summary;

  for (const row of abandoned) {
    try {
      // One transaction per reservation, not one for the batch: a single
      // poisoned row must not roll back the recoveries that already
      // succeeded, and holding one transaction across 25 wallets would
      // serialise unrelated customers behind each other.
      const released = await db.transaction(async (tx) => {
        const didRelease = await reservations.release(tx, {
          reservationId: row.id,
          reason: "abandoned — execution never reached a terminal state",
        });

        // Only the winner touches the execution row. A capture that beat us
        // means the execution succeeded after all, and overwriting its status
        // would report a completed call as failed.
        if (didRelease && row.transactionId) {
          await tx
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
                // Guard the status too: a row that reached 'completed' between
                // the reservation lookup and here must not be rewritten.
                inArray(transactions.status, ["executing", "deferred"]),
              ),
            );
        }

        return didRelease;
      });

      if (released) summary.released += 1;
      else summary.alreadyTerminal += 1;
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
