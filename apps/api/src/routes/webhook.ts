import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { wallets, walletTransactions } from "../db/schema.js";
import { getStripe } from "../lib/stripe.js";
import { log, logError } from "../lib/log.js";
import { sendAlert } from "../lib/alerting.js";
import { assessTopUpSession } from "../lib/stripe-settlement.js";
import * as walletService from "../lib/wallet-service.js";

export const webhookRoute = new Hono();

/**
 * Events that can carry a settled Checkout Session.
 *
 * `completed` alone is not enough and never was: for delayed-notification
 * payment methods Stripe fires it while `payment_status` is still "unpaid" and
 * sends `async_payment_succeeded` when the money actually arrives. The
 * pre-WP11 handler listened only to `completed` and read neither field, so it
 * credited on the first event and would never have credited at all on the
 * second — wrong in both directions at once.
 */
const TOP_UP_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

// POST /webhooks/stripe — Stripe webhook for payment confirmation
webhookRoute.post("/stripe", async (c) => {
  const stripe = getStripe();
  const sig = c.req.header("stripe-signature");

  if (!sig) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logError("stripe-webhook-secret-missing", new Error("STRIPE_WEBHOOK_SECRET not configured"));
    return c.json({ error: "Webhook not configured" }, 500);
  }

  // Stripe needs the raw body for signature verification
  const rawBody = await c.req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logError("stripe-webhook-signature-invalid", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  if (TOP_UP_EVENTS.has(event.type)) {
    // WP11: the crediting decision is read from Stripe's own record of the
    // sale — payment_status, amount_total, currency — not from the
    // `metadata.amount_cents` string we wrote ourselves when creating the
    // session. Metadata is our request echoed back; it is not evidence that
    // money moved, nor of how much.
    const assessment = assessTopUpSession(event.data.object as never);

    if (assessment.kind === "ignore") {
      log.info(
        { label: "stripe-webhook-no-credit", event_type: event.type, reason: assessment.reason },
        "stripe-webhook-no-credit",
      );
      return c.json({ received: true });
    }

    if (assessment.kind === "escalate") {
      // The customer has paid and we cannot safely credit them. This is the
      // one branch that must never be quiet: the pre-WP11 handler logged and
      // returned 200 for the equivalent cases, so a missing wallet or absent
      // metadata consumed the event and the money simply never arrived in a
      // balance.
      logError(
        "stripe-webhook-uncredited-payment",
        new Error(`Paid Stripe session could not be credited: ${assessment.reason}`),
        { session_id: assessment.sessionId, event_type: event.type },
      );
      await sendAlert({
        subject: "Stripe payment received but not credited",
        severity: "critical",
        body:
          `A paid Checkout Session could not be credited to a wallet.\n\n` +
          `session: ${assessment.sessionId ?? "unknown"}\n` +
          `event:   ${event.type}\n` +
          `reason:  ${assessment.reason}\n\n` +
          `The money is in Stripe. Reconcile from the Stripe dashboard and credit ` +
          `the wallet manually through the wallet service.`,
      }).catch((err) => logError("stripe-webhook-alert-failed", err));
      return c.json({ received: true });
    }

    if (assessment.metadataMismatchCents !== undefined) {
      // Not fatal — the customer is credited what they actually paid — but our
      // record of the sale and Stripe's disagree, which should never happen
      // while `/v1/wallet/topup` is the only session-creating path.
      logError(
        "stripe-webhook-amount-mismatch",
        new Error("Session metadata amount disagrees with amount_total"),
        {
          session_id: assessment.sessionId,
          metadata_cents: assessment.metadataMismatchCents,
          amount_total_cents: assessment.amountCents,
        },
      );
    }

    const db = getDb();
    let credited = false;
    let walletMissing = false;

    // All wallet operations in a single transaction for atomicity. A throw
    // from here propagates to a 500, which is deliberate: Stripe's own retry
    // schedule is the durable queue for a transient database failure, and
    // swallowing the error would consume the event instead.
    await db.transaction(async (tx) => {
      // Idempotency: check if this session was already processed. Also covers
      // the completed → async_payment_succeeded pair, which carry the same
      // session id and must credit once between them.
      const [existingTxn] = await tx
        .select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(eq(walletTransactions.stripeSessionId, assessment.sessionId))
        .limit(1);

      if (existingTxn) {
        // Already processed — Stripe retried the webhook
        return;
      }

      // Look up the wallet
      const [wallet] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.userId, assessment.userId))
        .limit(1);

      if (!wallet) {
        walletMissing = true;
        return;
      }

      // Credit through the wallet service (WP2). The balance change and the
      // ledger row are written by one call, and the stripe_session_id that
      // makes the credit idempotent is carried on the entry.
      await walletService.credit(tx, {
        walletId: wallet.id,
        amountCents: assessment.amountCents,
        type: "top_up",
        stripeSessionId: assessment.sessionId,
        description: `Stripe top-up: EUR ${(assessment.amountCents / 100).toFixed(2)}`,
      });
      credited = true;
    });

    if (walletMissing) {
      // After WP11's atomic signup a user without a wallet is unreachable —
      // which is exactly why reaching it means something is wrong that a log
      // line will not fix.
      logError(
        "stripe-webhook-uncredited-payment",
        new Error("Paid Stripe session has no wallet to credit"),
        { session_id: assessment.sessionId, user_id: assessment.userId },
      );
      await sendAlert({
        subject: "Stripe payment received but not credited",
        severity: "critical",
        body:
          `A paid Checkout Session has no wallet to credit.\n\n` +
          `session: ${assessment.sessionId}\n` +
          `user:    ${assessment.userId}\n` +
          `amount:  ${assessment.amountCents} cents\n\n` +
          `The money is in Stripe. Open the account's wallet and credit it ` +
          `through the wallet service.`,
      }).catch((err) => logError("stripe-webhook-alert-failed", err));
    } else if (credited) {
      log.info(
        {
          label: "stripe-webhook-credited",
          session_id: assessment.sessionId,
          amount_cents: assessment.amountCents,
        },
        "stripe-webhook-credited",
      );
    }
  }

  return c.json({ received: true });
});
