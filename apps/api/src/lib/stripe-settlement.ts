/**
 * The one authority for "how much money did this customer actually pay, in
 * what currency, and is it settled" (WP11, risk CR-09).
 *
 * `webhook.ts` credited `session.metadata.amount_cents`. That value is a
 * string *we* wrote when we created the Checkout Session — it is our own
 * request echoed back, not Stripe's record of what was collected. Three
 * authoritative fields were available on the same object and none were read:
 *
 *   - `payment_status` — whether any money moved at all. `checkout.session.
 *     completed` does NOT mean paid. For delayed-notification methods (SEPA
 *     debit, Klarna, Bacs, most bank-redirect methods) Stripe fires it with
 *     `payment_status: "unpaid"` and settles later via
 *     `checkout.session.async_payment_succeeded`. The pre-WP11 handler
 *     credited the wallet on the first event, so enabling any such method —
 *     a Dashboard toggle, not a deploy — would have converted an unpaid
 *     checkout into spendable balance.
 *   - `amount_total` — what was actually collected.
 *   - `currency` — what it was collected in. The ledger's description string
 *     hardcoded "EUR" and the balance is EUR cents, so a session in any other
 *     currency would have been credited at 1:1.
 *
 * Today the only session-creating path is `/v1/wallet/topup`, which writes
 * metadata from the same validated integer it puts in the line item and pins
 * `currency: "eur"` and `payment_method_types: ["card"]`. So the divergence is
 * currently unreachable and the defect is latent, not realised — production
 * has **zero** rows in `wallet_transactions` with a `stripe_session_id`, i.e.
 * this path has never credited a real wallet. That is exactly the moment to
 * fix it: reading the authoritative fields costs nothing while there is
 * nothing to reconcile.
 *
 * The classification below deliberately has three outcomes rather than two.
 * "Do not credit" splits into a benign case (not paid yet — Stripe will send
 * another event) and an incident (money we received and cannot safely credit),
 * and collapsing them is how a real payment goes missing quietly.
 */

export interface StripeCheckoutSessionLike {
  id?: string | null;
  currency?: string | null;
  amount_total?: number | null;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
}

export type TopUpAssessment =
  /** Credit `amountCents` to `userId`. */
  | {
      kind: "credit";
      userId: string;
      amountCents: number;
      sessionId: string;
      /** Set when metadata disagreed with `amount_total`; the latter wins. */
      metadataMismatchCents?: number;
    }
  /** Nothing to do. Not an error — no money has moved. */
  | { kind: "ignore"; reason: string }
  /** Money may have moved and we cannot credit it. Needs a human. */
  | { kind: "escalate"; reason: string; sessionId: string | null };

/** The wallet is denominated in EUR cents; nothing else can be credited 1:1. */
export const WALLET_CURRENCY = "eur";

/**
 * Classify a Checkout Session into a crediting decision.
 *
 * Pure: takes the session object, touches no database and no clock, so the
 * rule is testable without a Stripe fixture harness.
 */
export function assessTopUpSession(
  session: StripeCheckoutSessionLike,
): TopUpAssessment {
  const sessionId = session.id ?? null;

  if (!sessionId) {
    return { kind: "escalate", reason: "session_id_missing", sessionId: null };
  }

  // Not paid yet is the ordinary path for delayed-notification methods, and
  // `async_payment_succeeded` carries the same session once it settles. Doing
  // nothing here is correct and must not page anyone.
  if (session.payment_status !== "paid") {
    return {
      kind: "ignore",
      reason: `payment_status=${session.payment_status ?? "absent"}`,
    };
  }

  // From here on the customer HAS paid, so every remaining failure is an
  // incident rather than a no-op.
  const userId = session.metadata?.user_id;
  if (!userId) {
    return { kind: "escalate", reason: "metadata.user_id_missing", sessionId };
  }

  const currency = (session.currency ?? "").toLowerCase();
  if (currency !== WALLET_CURRENCY) {
    return {
      kind: "escalate",
      reason: `currency=${currency || "absent"} (wallet is ${WALLET_CURRENCY})`,
      sessionId,
    };
  }

  const amountCents = session.amount_total;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    return {
      kind: "escalate",
      reason: `amount_total=${String(amountCents)}`,
      sessionId,
    };
  }

  // Metadata is no longer the source of the credited amount, but a divergence
  // still means our record of the sale and Stripe's disagree, which is worth
  // surfacing even though the customer is credited correctly either way.
  const declared = Number.parseInt(session.metadata?.amount_cents ?? "", 10);
  const metadataMismatchCents =
    Number.isInteger(declared) && declared !== amountCents ? declared : undefined;

  return {
    kind: "credit",
    userId,
    amountCents,
    sessionId,
    ...(metadataMismatchCents !== undefined ? { metadataMismatchCents } : {}),
  };
}
