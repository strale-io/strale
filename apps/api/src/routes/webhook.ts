import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { wallets, walletTransactions } from "../db/schema.js";
import { getStripe } from "../lib/stripe.js";
import { logError } from "../lib/log.js";

export const webhookRoute = new Hono();

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const userId = session.metadata?.user_id;
    const amountCents = parseInt(session.metadata?.amount_cents ?? "0", 10);
    const sessionId = session.id;

    if (!userId || !amountCents) {
      logError(
        "stripe-webhook-metadata-missing",
        new Error("Webhook missing metadata"),
        { user_id: userId, amount_cents: amountCents },
      );
      return c.json({ received: true });
    }

    const db = getDb();

    // All wallet operations in a single transaction for atomicity
    await db.transaction(async (tx) => {
      // Idempotency: check if this session was already processed
      const [existingTxn] = await tx
        .select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(eq(walletTransactions.stripeSessionId, sessionId))
        .limit(1);

      if (existingTxn) {
        // Already processed — Stripe retried the webhook
        return;
      }

      // Look up the wallet
      const [wallet] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);

      if (!wallet) {
        logError(
          "stripe-webhook-wallet-missing",
          new Error("Wallet not found for user"),
          { user_id: userId },
        );
        return;
      }

      // Credit the wallet atomically
      await tx
        .update(wallets)
        .set({
          balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, wallet.id));

      // Record the wallet transaction
      await tx.insert(walletTransactions).values({
        walletId: wallet.id,
        amountCents,
        type: "top_up",
        stripeSessionId: sessionId,
        description: `Stripe top-up: €${(amountCents / 100).toFixed(2)}`,
      });
    });
  }

  return c.json({ received: true });
});
