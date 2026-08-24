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
import { deployCommitOrNull } from "../lib/receipt/deploy-identity.js";
import { settleExecutionReceipt } from "../lib/receipt/settle.js";

import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import { log, logError } from "../lib/log.js";
import { alertOnce } from "../lib/alert-once.js";
import {
  countEscalated,
  escalateIntent,
  findAbandonedIntents,
  markRecordedBySettlement,
} from "../lib/x402-settlement-intent.js";
import { capabilities, x402OrphanSettlements } from "../db/schema.js";

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
          // The unresolvable class: the process died during the facilitator
          // call, so only the chain knows whether USDC moved. We still refuse
          // to guess — nothing about the money is inferred — but the row MUST
          // leave the sweep.
          //
          // Review finding: the first version escalated and deliberately left
          // the row untouched. The sweep is ORDER BY updated_at ASC LIMIT n, so
          // an untouched row stays permanently among the oldest; once n of them
          // accumulate they own the whole batch forever and the next real crash
          // is never examined. The recovery job would have silently stopped
          // recovering. Handing the row to a human is a state change, not a
          // guess about the money.
          await escalateIntent(db, intent.id);
          summary.escalated += 1;
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
        //
        // Attribute it properly. The intent stores the slug precisely so
        // recovery is possible, and the first version discarded it — leaving
        // the row unattributable to any capability except through free text.
        const [cap] = intent.solutionSlug
          ? []
          : await db
              .select({
                id: capabilities.id,
                transparencyTag: capabilities.transparencyTag,
              })
              .from(capabilities)
              .where(eq(capabilities.slug, intent.slug))
              .limit(1);

        const [recreated] = await db
          .insert(transactions)
          .values({
            // Captured at INSERT because neither is recoverable later:
            // the rail is not a property of the row, and the deploy commit
            // drifts the moment anything redeploys (block 0110).
            receiptRail: "x402",
            receiptDeployCommit: deployCommitOrNull(),
            userId: null,
            capabilityId: cap?.id ?? null,
            solutionSlug: intent.solutionSlug,
            // 'failed', not 'completed'. transactions.status is about what the
            // CUSTOMER got, and they got nothing — the output was lost with the
            // process. Marking it completed would both overstate delivery and
            // poison the gateway's replay cache, which serves a completed row's
            // output back: a retry inside the authorization window would have
            // received an empty body dressed as a successful cached result.
            // The money that moved is recorded by priceCents + the settlement
            // id, not by the status.
            status: "failed",
            input: { recovered_by: "settlement-reconciler" },
            output: null,
            priceCents: intent.priceCents,
            paymentMethod: "x402",
            x402SettlementId: intent.settlementId,
            x402PaymentHash: intent.paymentHash,
            // Never inherit the column default here. It is 'ai_generated',
            // which on a recovered row would be a fabricated EU AI Act Art. 50
            // marker on a call we cannot describe.
            transparencyMarker: cap?.transparencyTag ?? "unknown",
            error:
              "Recovered by the WP5 settlement reconciler: the settlement " +
              "succeeded on-chain but the process died before its transaction " +
              "row was written. The customer paid and did not receive output, " +
              "which cannot be reconstructed.",
            completedAt: new Date(),
          })
          .returning({ id: transactions.id });

        await markRecordedBySettlement(db, {
          settlementId: intent.settlementId,
          transactionId: recreated.id,
        });
        // The recovered row is a real, paid execution that we cannot describe:
        // the output was lost with the process. It still gets a receipt, and
        // the receipt says exactly that - `stepsUnknown` marks every declared
        // step `unresolved` rather than `skipped`, because `skipped` would be
        // a positive claim that the step never ran, and it very probably did.
        await settleExecutionReceipt(db, {
          transactionId: recreated.id,
          rail: "x402",
          solutionSlug: intent.solutionSlug,
          stepsUnknown: Boolean(intent.solutionSlug),
        });
        // The orphan table is the OTHER channel for this same event, and it
        // says "awaiting reconciliation" with a procedure ("recreate the row
        // OR refund the payer") that an operator following it now would apply
        // to a settlement already reconciled — double-recording or wrongly
        // refunding. Close it here so the two channels cannot disagree.
        await db
          .update(x402OrphanSettlements)
          .set({ reconciledAt: new Date(), reconciliationStatus: "auto_recovered" })
          .where(eq(x402OrphanSettlements.settlementId, intent.settlementId));
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
        // The unique index on transactions.x402_settlement_id IS the claim.
        // The advisory lock only spans the batch SELECT, so two staggered
        // replicas can both reach the insert; the loser gets 23505 here, which
        // means "already recovered", not "failed". Treated as a discharge so a
        // benign race is not reported as an error every tick.
        const pgCode = (err as { code?: string } | null)?.code;
        if (pgCode === "23505") {
          summary.discharged += 1;
          continue;
        }
        summary.failed += 1;
        logError("settlement-reconcile-item-failed", err, {
          intent_id: intent.id,
        });
      }
    }
  }

  // One alert about the whole escalated backlog, not one per row.
  //
  // Review finding: the first version paged per intent id on a 6h cooldown, so
  // a handful of permanently-stuck rows meant a standing stream of CRITICAL
  // pages every six hours — the alert-fatigue mode that ends with the channel
  // muted, which is precisely the channel that would tell an operator the
  // recovery job had stopped recovering.
  const escalatedBacklog = await countEscalated(db);
  if (escalatedBacklog > 0) {
    await alertOnce("x402-settlement-escalated-backlog", ALERT_COOLDOWN_MS, {
      subject: `${escalatedBacklog} x402 settlement(s) need a manual on-chain check`,
      body:
        `${escalatedBacklog} settlement intent(s) are in state 'escalated'. Each was ` +
        `interrupted during the facilitator call, so we cannot tell from our side whether ` +
        `the USDC moved. Query:

` +
        `  SELECT id, slug, payment_hash, price_cents, escalated_at
` +
        `  FROM x402_settlement_intents WHERE state = 'escalated' ORDER BY escalated_at;

` +
        `For each, check the chain against our receiving address for that payment hash. ` +
        `If it settled, the customer paid and has no record. If it did not, no action is ` +
        `needed — mark the row resolved either way so this count returns to zero.`,
      severity: "critical",
    });
  }

  // Logged every tick, including the quiet ones. A summary that only appears
  // when something happened is indistinguishable from a job that stopped
  // running — the failure mode DEC-20260504-B was written about.
  log.info(
    { label: "settlement-reconcile", ...summary, escalated_backlog: escalatedBacklog },
    "settlement-reconcile",
  );
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
