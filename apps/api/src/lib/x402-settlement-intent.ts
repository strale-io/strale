/**
 * Durable intent for x402 settlements (WP5, risk CR-01).
 *
 * WP3 made a crashed wallet debit recoverable. This is the harder half: a
 * settlement moves USDC on-chain and cannot be undone, so there is no
 * equivalent of "release the reservation and give it back".
 *
 * The defect. `recordX402Transaction` captures an orphaned settlement in a
 * catch block (routes/x402-gateway-v2.ts). That handles "the INSERT threw". It
 * cannot handle "the process died between the settlement succeeding and the
 * INSERT committing", because then the catch never runs either. A SIGKILL in
 * that window means the customer's USDC moved irreversibly and Strale holds no
 * row anywhere — not in `transactions`, not in `x402_orphan_settlements`. The
 * only remaining evidence is on the chain.
 *
 * An in-process catch block is not a recovery mechanism. That was the WP3
 * lesson, and it had not been applied to the one rail where the money movement
 * is irreversible.
 *
 * So: write down what we are ABOUT to do, before doing it. The row outlives the
 * process, so a reconciler can ask "what happened to this?" instead of nobody
 * ever knowing it was attempted.
 *
 *   settling ──▶ settled ──▶ recorded
 *        ╰─────▶ failed
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 *
 * It does not decide, on its own, whether an interrupted settlement moved money.
 * A crash DURING the facilitator call leaves genuine ambiguity that only an
 * on-chain query can resolve. Assuming "settled" invents revenue; assuming "not
 * settled" gives the work away. The reconciler alerts and leaves the row alone.
 * Money code should refuse to guess, and say so loudly.
 */

import { and, eq, isNull, lt, sql } from "drizzle-orm";

import { x402SettlementIntents } from "../db/schema.js";
import type { WalletTx } from "./wallet-service.js";

export type SettlementIntentState =
  | "settling"
  | "settled"
  | "recorded"
  | "failed";

/**
 * How long an intent may sit non-terminal before the reconciler treats it as
 * abandoned.
 *
 * Short relative to the wallet TTL: a facilitator call is seconds, not minutes,
 * and unlike a wallet reservation there is no live execution that a premature
 * sweep could disturb. The reconciler never reverses money, so the cost of
 * looking early is a query, not a wrong refund.
 */
export const INTENT_STALE_AFTER_MS = 5 * 60 * 1000;

export interface SettlementIntent {
  id: string;
  paymentHash: string;
}

/**
 * Record that a settlement is about to be attempted.
 *
 * Committed BEFORE the facilitator is called — that ordering is the entire
 * point, and a caller that writes it afterwards has reintroduced the defect
 * with extra steps.
 *
 * Idempotent on `paymentHash`: a replayed payment header must not create a
 * second intent, or the reconciler would later see two attempts where the
 * platform made one.
 */
export async function openIntent(
  db: WalletTx,
  params: {
    paymentHash: string;
    slug: string;
    solutionSlug?: string | null;
    priceCents: number;
    /**
     * Optional: the /v1/do rail's CapabilityInfo does not carry the USD price.
     * The intent exists to make a settlement recoverable, and priceCents plus
     * the slug are enough for that; the USD figure is convenience for an
     * operator reading the row.
     */
    priceUsd?: number | null;
  },
): Promise<SettlementIntent> {
  const [row] = await db
    .insert(x402SettlementIntents)
    .values({
      paymentHash: params.paymentHash,
      slug: params.slug,
      solutionSlug: params.solutionSlug ?? null,
      priceCents: params.priceCents,
      priceUsd: params.priceUsd != null ? params.priceUsd.toFixed(4) : null,
      state: "settling",
    })
    .onConflictDoUpdate({
      target: x402SettlementIntents.paymentHash,
      // A no-op update rather than DO NOTHING: DO NOTHING returns no row, and
      // the caller needs the id of the existing intent to close it out.
      set: { updatedAt: new Date() },
    })
    .returning({
      id: x402SettlementIntents.id,
      paymentHash: x402SettlementIntents.paymentHash,
    });

  return row;
}

/** The facilitator answered. Record which way, and the settlement id if any. */
export async function markSettled(
  db: WalletTx,
  params: { intentId: string; settlementId: string },
): Promise<void> {
  await db
    .update(x402SettlementIntents)
    .set({
      state: "settled",
      settlementId: params.settlementId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(x402SettlementIntents.id, params.intentId),
        eq(x402SettlementIntents.state, "settling"),
      ),
    );
}

/**
 * The facilitator declined. No money moved, so there is nothing to reconcile.
 *
 * Recorded rather than deleted: a burst of failed intents is the signal that
 * the facilitator is unhealthy, and deleting them would erase exactly the
 * evidence an operator needs.
 */
export async function markFailed(
  db: WalletTx,
  params: { intentId: string; reason: string },
): Promise<void> {
  await db
    .update(x402SettlementIntents)
    .set({
      state: "failed",
      failureReason: params.reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(x402SettlementIntents.id, params.intentId),
        eq(x402SettlementIntents.state, "settling"),
      ),
    );
}

/**
 * The transaction row exists. The intent is fully discharged.
 *
 * Conditional on `settled` so a duplicate call is a no-op rather than a second
 * transition, for the same reason every WP3 transition is conditional.
 */
export async function markRecorded(
  db: WalletTx,
  params: { intentId: string; transactionId: string },
): Promise<void> {
  await db
    .update(x402SettlementIntents)
    .set({
      state: "recorded",
      transactionId: params.transactionId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(x402SettlementIntents.id, params.intentId),
        eq(x402SettlementIntents.state, "settled"),
      ),
    );
}

export interface AbandonedIntent {
  id: string;
  state: SettlementIntentState;
  paymentHash: string;
  settlementId: string | null;
  slug: string;
  solutionSlug: string | null;
  priceCents: number;
}

/**
 * Intents a crash left behind: non-terminal and past the staleness window.
 *
 * Two very different populations come back from this, and the reconciler must
 * treat them differently:
 *
 *   state='settled'  — the money moved and we know it. Recoverable: the
 *                      transaction row can be recreated from what we stored.
 *   state='settling' — we do not know whether the chain moved. NOT recoverable
 *                      from our side. Alert; never guess.
 *
 * Bounded and oldest-first, per DEC-20260504-B: the first real run of a job
 * like this is a workload-resumption event, not a routine tick.
 */
export async function findAbandonedIntents(
  db: WalletTx,
  limit = 50,
): Promise<AbandonedIntent[]> {
  return db
    .select({
      id: x402SettlementIntents.id,
      state: x402SettlementIntents.state,
      paymentHash: x402SettlementIntents.paymentHash,
      settlementId: x402SettlementIntents.settlementId,
      slug: x402SettlementIntents.slug,
      solutionSlug: x402SettlementIntents.solutionSlug,
      priceCents: x402SettlementIntents.priceCents,
    })
    .from(x402SettlementIntents)
    .where(
      and(
        sql`${x402SettlementIntents.state} IN ('settling', 'settled')`,
        lt(
          x402SettlementIntents.updatedAt,
          sql`now() - ${sql.raw(`interval '${Math.floor(INTENT_STALE_AFTER_MS / 1000)} seconds'`)}`,
        ),
        isNull(x402SettlementIntents.transactionId),
      ),
    )
    .orderBy(x402SettlementIntents.updatedAt)
    .limit(limit) as Promise<AbandonedIntent[]>;
}

/**
 * Discharge the intent for a settlement, keyed by the settlement id.
 *
 * Called from `recordX402Transaction` rather than from each rail, because that
 * is the exact point where "the row landed" becomes true — and there are three
 * settle sites but only one place that writes the row. Keying on settlementId
 * rather than threading an intent id through every caller keeps the rails from
 * having to remember; the unique partial index on that column is what makes the
 * lookup unambiguous.
 *
 * Best-effort by design: the transaction row is the customer-facing record and
 * must never fail to land because bookkeeping did. A missed mark leaves an
 * intent the reconciler will find and resolve as already-recorded.
 */
export async function markRecordedBySettlement(
  db: WalletTx,
  params: { settlementId: string; transactionId: string },
): Promise<void> {
  await db
    .update(x402SettlementIntents)
    .set({
      state: "recorded",
      transactionId: params.transactionId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(x402SettlementIntents.settlementId, params.settlementId),
        eq(x402SettlementIntents.state, "settled"),
      ),
    );
}
