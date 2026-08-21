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

import { x402OrphanSettlements, x402SettlementIntents } from "../db/schema.js";
import { logError } from "./log.js";
import type { WalletTx } from "./wallet-service.js";

/**
 * Bookkeeping after the money has moved must never fail the request.
 *
 * Found by an existing test rather than by inspection: the unique index on
 * settlement_id can reject `markSettled`, and that rejection propagated as an
 * unhandled 500 — AFTER the USDC had already left the customer's wallet. Before
 * WP5 they would have received their result. A durability mechanism that turns
 * a successful paid call into an error has made things worse, not better.
 *
 * Swallowing here is safe precisely because of what it degrades TO: an intent
 * stuck at 'settling' is the reconciler's "we do not know" class, which gets
 * escalated to a human rather than silently resolved. The failure becomes a
 * page instead of a 500.
 *
 * Logged loudly, per DEC-20260504-A's swallow-visibility rule — a swallowed
 * error that produces a clean-looking summary is the failure mode that protocol
 * exists to prevent.
 */
async function bestEffort(
  label: string,
  context: Record<string, unknown>,
  fn: () => Promise<number>,
): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    logError(label, err, context);
    return 0;
  }
}

/**
 * A conditional UPDATE that matches nothing is not an exception.
 *
 * Review finding, and the sharper half of the swallow problem: `bestEffort`
 * only catches THROWS. Every transition here is guarded on the prior state, so
 * a guard miss is a zero-row UPDATE — no error, no log, no counter, nothing.
 * The safety argument above ("it degrades to a state the reconciler escalates")
 * holds for the throw case and is FALSE for this one, where the row can be left
 * describing a different settlement while looking fully resolved.
 *
 * So every transition reports whether it applied, and a no-op is logged as the
 * anomaly it is. DEC-20260504-A's swallow-visibility rule, applied to the case
 * that produces no error to swallow.
 */
function reportNoOp(
  label: string,
  applied: number,
  context: Record<string, unknown>,
): void {
  if (applied === 0) {
    logError(
      label,
      new Error("conditional state transition matched no row"),
      context,
    );
  }
}

export type SettlementIntentState =
  | "settling"
  | "settled"
  | "recorded"
  | "failed"
  /**
   * Handed to a human. Terminal from the job's perspective.
   *
   * Exists because of a starvation defect found in review: the reconciler
   * escalated unresolvable rows and deliberately left them untouched, but the
   * sweep is `ORDER BY updated_at ASC LIMIT n`. An untouched row keeps its
   * original timestamp, so it stays permanently among the oldest — and once n
   * of them accumulate they occupy the whole batch forever, and the next real
   * crash is never examined. The recovery job would have silently stopped
   * recovering, which is the failure WP5 exists to prevent.
   */
  | "escalated";

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

/**
 * The intent could not be written, so the settlement cannot be made durable.
 *
 * Its own class so the failure is attributable. It is raised BEFORE any money
 * moves, which makes failing the request the safe choice — but the capability
 * has already executed successfully by then, and without a distinct type the
 * generic catch fires recordFailure + triggerOnFailure against a quality floor
 * that is armed in production. A database blip on Strale's side would delist a
 * capability that did its job.
 */
export class SettlementIntentUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "Could not record a durable settlement intent; the payment was not " +
        "taken. This is a Strale-side failure, not a capability failure.",
    );
    this.name = "SettlementIntentUnavailableError";
    this.cause = cause;
  }
}

export interface SettlementIntent {
  id: string;
  paymentHash: string;
  /** State AFTER the upsert — 'settling' for a fresh intent. */
  state: string;
  settlementId: string | null;
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
  try {
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
      state: x402SettlementIntents.state,
      settlementId: x402SettlementIntents.settlementId,
    });

  // A conflict on a NON-'settling' intent means this authorization already
  // reached the facilitator once. The caller is about to settle it again, and
  // this row cannot represent two settlements — its uniqueness on payment_hash
  // caps the durable record at one. Surfaced rather than swallowed; markSettled's
  // zero-row path is what actually preserves the second settlement.
  if (row.state !== "settling") {
    logError(
      "x402-intent-reopened-on-terminal-state",
      new Error(
        `Intent for this payment hash is already in state '${row.state}'; a ` +
          "second settlement is about to be attempted against one authorization",
      ),
      {
        intent_id: row.id,
        existing_state: row.state,
        existing_settlement_id: row.settlementId,
      },
    );
  }

  return row;
  } catch (err) {
    // Deliberately NOT best-effort: this runs before the facilitator, so
    // failing the request costs nothing but a retry, while proceeding without
    // durability reinstates the exact defect WP5 exists to close.
    if (err instanceof SettlementIntentUnavailableError) throw err;
    throw new SettlementIntentUnavailableError(err);
  }
}

/** The facilitator answered. Record which way, and the settlement id if any. */
export async function markSettled(
  db: WalletTx,
  params: { intentId: string; settlementId: string },
): Promise<void> {
  const applied = await bestEffort(
    "x402-intent-mark-settled-failed",
    { intent_id: params.intentId, settlement_id: params.settlementId },
    async () => {
  const rows = await db
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
    )
    .returning({ id: x402SettlementIntents.id });
  return rows.length;
    },
  );

  // The settlement id could not be attached to its intent, so it now exists
  // ONLY on-chain. Preserve it in the orphan table — that table's whole purpose
  // is "a settlement we could not record normally" — otherwise a second
  // settlement against one authorization vanishes without trace.
  if (applied === 0) {
    reportNoOp("x402-intent-mark-settled-noop", applied, {
      intent_id: params.intentId,
      settlement_id: params.settlementId,
    });
    await bestEffort(
      "x402-intent-orphan-capture-failed",
      { settlement_id: params.settlementId },
      async () => {
        await db.insert(x402OrphanSettlements).values({
          settlementId: params.settlementId,
          capabilitySlug: null,
          solutionSlug: null,
          payerAddress: null,
          priceUsd: "0.0000",
          priceCents: 0,
          rawArgs: { intent_id: params.intentId, source: "mark-settled-noop" },
          failureReason:
            "Settlement succeeded but its intent was no longer in 'settling'; " +
            "the settlement id had nowhere else to live.",
        });
        return 1;
      },
    );
  }
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
  const applied = await bestEffort(
    "x402-intent-mark-failed-failed",
    { intent_id: params.intentId },
    async () => {
  const rows = await db
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
    )
    .returning({ id: x402SettlementIntents.id });
  return rows.length;
    },
  );
  reportNoOp("x402-intent-mark-failed-noop", applied, {
    intent_id: params.intentId,
  });
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
  const rows = await db
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
    )
    .returning({ id: x402SettlementIntents.id });

  reportNoOp("x402-intent-mark-recorded-noop", rows.length, {
    settlement_id: params.settlementId,
    transaction_id: params.transactionId,
  });
}

/**
 * Hand an unresolvable intent to a human and take it OUT of the sweep.
 *
 * The transition is what fixes the starvation: an escalated row no longer
 * matches the selection, so it cannot occupy a slot in an ordered, limited
 * batch forever. It stays in the table, fully visible, with the timestamp of
 * when it was handed over.
 */
export async function escalateIntent(
  db: WalletTx,
  intentId: string,
): Promise<boolean> {
  const rows = await db
    .update(x402SettlementIntents)
    .set({ state: "escalated", escalatedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(x402SettlementIntents.id, intentId),
        sql`${x402SettlementIntents.state} IN ('settling', 'settled')`,
      ),
    )
    .returning({ id: x402SettlementIntents.id });
  return rows.length > 0;
}

/** How many intents are sitting with a human. Drives one aggregate alert. */
export async function countEscalated(db: WalletTx): Promise<number> {
  const rows = (await db.execute(
    sql`SELECT count(*)::int AS c FROM x402_settlement_intents WHERE state = 'escalated'`,
  )) as unknown as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}
