/**
 * x402 settlement reconciler (WP5).
 *
 * WP3's reconciler releases wallet reservations a crash abandoned. This one
 * cannot do the equivalent, because an x402 settlement is irreversible: there
 * is no "give it back". What it can do is make sure that money which moved is
 * always recorded, and that money which MIGHT have moved is always escalated
 * rather than quietly forgotten.
 *
 * Three populations, and the difference between them is the whole design:
 *
 *   settled, transaction row exists   → discharge the intent. Bookkeeping only.
 *   settled, no transaction row       → recreate the row. We know the money
 *                                       moved and we know what it was for; this
 *                                       is the case the orphan table was meant
 *                                       to catch and could not, because its
 *                                       catch block died with the process.
 *   settling, no settlement id        → WE DO NOT KNOW. The process died during
 *                                       the facilitator call. Alert. Never guess.
 *
 * That last one is the honest part. Assuming it settled invents revenue and
 * tells a customer they paid when they may not have; assuming it did not gives
 * away work that may have been paid for. Only an on-chain query resolves it,
 * and the platform has no such query today. So the job escalates and leaves the
 * row exactly as it found it — a stuck row an operator can see beats a wrong
 * number nobody can find.
 */

import { eq, sql } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import { log, logError } from "../lib/log.js";
import { alertOnce } from "../lib/alert-once.js";
import {
  findAbandonedIntents,
  markRecordedBySettlement,
} from "../lib/x402-settlement-intent.js";

/**
 * Distinct from the WP3 reconciler's lock. Two jobs sweeping different tables
 * must not serialise behind each other; sharing an id would make the slower one
 * silently starve the other on a busy replica.
 */
const ADVISORY_LOCK_ID = 20260822;

/** How long to suppress a repeat of the same alert. */
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Bounded per tick — DEC-20260504-B. */
const BATCH_SIZE = 25;
const TICK_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 60_000;

export interface ReconcileSettlementsSummary {
  examined: number;
  /** Intents whose transaction row already existed; bookkeeping caught up. */
  discharged: number;
  /** Rows recreated for settlements that moved money and lost their record. */
  recovered: number;
  /** Interrupted mid-facilitator. Cannot be resolved from our side. */
  escalated: number;
  failed: number;
}

export async function reconcileSettlementsOnce(): Promise<ReconcileSettlementsSummary> {
  const db = getDb();
  const summary: ReconcileSettlementsSummary = {
    examined: 0,
    discharged: 0,
    recovered: 0,
    escalated: 0,
    failed: 0,
  };

  // Cross-replica: one sweeper at a time, so the batch bound means what it says
  // rather than being multiplied by the replica count. Transaction-scoped like
  // the WP3 reconciler's, so it releases even if this process dies holding it.
  const abandoned = await db.transaction(async (tx) => {
    const [lock] = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
    )) as unknown as Array<{ acquired?: boolean }>;
    if (!lock?.acquired) return null;
    return findAbandonedIntents(tx, BATCH_SIZE);
  });

  // Another replica is on this tick. Not an error.
  if (abandoned === null) return summary;

  {
    summary.examined = abandoned.length;

    for (const intent of abandoned) {
      try {
        if (intent.state === "settling" || !intent.settlementId) {
          // The unresolvable class. Escalate; do not touch the row.
          summary.escalated += 1;
          await alertOnce(
            `x402-settlement-interrupted-${intent.id}`,
            ALERT_COOLDOWN_MS,
            {
              subject:
                "x402 settlement interrupted mid-flight — manual on-chain check required",
              body:
                `Intent ${intent.id} (slug=${intent.slug}, ${intent.priceCents} cents) was left ` +
                `in state '${intent.state}' with no settlement id. The process died during the ` +
                `facilitator call, so we cannot tell from our side whether the USDC moved. ` +
                `Check the chain against our receiving address for payment hash ` +
                `${intent.paymentHash}. If it settled, the customer paid and has no record; ` +
                `if it did not, no action is needed.`,
              severity: "critical",
            },
          );
          continue;
        }

        // From here the money definitely moved — we hold a settlement id.
        const existing = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.x402SettlementId, intent.settlementId))
          .limit(1);

        if (existing.length > 0) {
          await markRecordedBySettlement(db, {
            settlementId: intent.settlementId,
            transactionId: existing[0].id,
          });
          summary.discharged += 1;
          continue;
        }

        // Settled, and no row. This is the case the orphan table was written
        // for and structurally could not catch.
        const [recreated] = await db
          .insert(transactions)
          .values({
            userId: null,
            capabilityId: null,
            solutionSlug: intent.solutionSlug,
            status: "completed",
            input: { recovered_by: "settlement-reconciler" },
            output: null,
            priceCents: intent.priceCents,
            paymentMethod: "x402",
            x402SettlementId: intent.settlementId,
            x402PaymentHash: intent.paymentHash,
            error:
              "Recovered by the WP5 settlement reconciler: the settlement " +
              "succeeded on-chain but the process died before its transaction " +
              "row was written. Output was not captured and cannot be " +
              "reconstructed.",
            completedAt: new Date(),
          })
          .returning({ id: transactions.id });

        await markRecordedBySettlement(db, {
          settlementId: intent.settlementId,
          transactionId: recreated.id,
        });
        summary.recovered += 1;

        // Recovered, but the customer paid and did not receive output. That is
        // a refund conversation, not a silent fix.
        await alertOnce(
          `x402-settlement-recovered-${intent.id}`,
          ALERT_COOLDOWN_MS,
          {
            subject:
              "x402 settlement recovered — customer paid but received no output",
            body:
              `Settlement ${intent.settlementId} (slug=${intent.slug}, ${intent.priceCents} ` +
              `cents) moved USDC and lost its transaction row to a crash. A row has been ` +
              `recreated for audit completeness, but the customer did not receive their ` +
              `result and may be owed a refund.`,
            severity: "warning",
          },
        );
      } catch (err) {
        summary.failed += 1;
        logError("settlement-reconcile-item-failed", err, {
          intent_id: intent.id,
        });
      }
    }
  }

  // Logged every tick, including the quiet ones. A summary that only appears
  // when something happened is indistinguishable from a job that stopped
  // running — the failure mode DEC-20260504-B was written about.
  log.info({ label: "settlement-reconcile", ...summary }, "settlement-reconcile");
  return summary;
}

export function startSettlementReconciler(): void {
  setTimeout(() => {
    void reconcileSettlementsOnce().catch((err) =>
      logError("settlement-reconcile-tick-failed", err),
    );
    setInterval(() => {
      void reconcileSettlementsOnce().catch((err) =>
        logError("settlement-reconcile-tick-failed", err),
      );
    }, TICK_INTERVAL_MS).unref?.();
  }, STARTUP_DELAY_MS).unref?.();
}
