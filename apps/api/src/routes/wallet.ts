import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { wallets, walletTransactions } from "../db/schema.js";
import { getStripe } from "../lib/stripe.js";
import { authMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const MIN_TOPUP_CENTS = 1000; // €10
const SUGGESTED_AMOUNTS = [1000, 2500, 5000, 10000]; // €10, €25, €50, €100

export const walletRoute = new Hono<AppEnv>();

// All wallet routes require auth + DEC-21: 5 req/sec per key
walletRoute.use("*", authMiddleware);
walletRoute.use("*", rateLimitByKey(5, 1000));

// POST /v1/wallet/topup — Create Stripe Checkout session
walletRoute.post("/topup", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const amountCents = body?.amount_cents;
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_TOPUP_CENTS
  ) {
    return c.json(
      apiError(
        "invalid_request",
        `'amount_cents' must be an integer >= ${MIN_TOPUP_CENTS} (€${MIN_TOPUP_CENTS / 100}).`,
        { min_amount_cents: MIN_TOPUP_CENTS, suggested_amounts: SUGGESTED_AMOUNTS },
      ),
      400,
    );
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: amountCents,
          product_data: {
            name: "Strale Wallet Top-Up",
            description: `Add €${(amountCents / 100).toFixed(2)} to your Strale wallet`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: user.id,
      amount_cents: String(amountCents),
    },
    // success_url and cancel_url would point to the dashboard in production
    success_url: `${c.req.url.split("/v1")[0]}/v1/wallet/balance`,
    cancel_url: `${c.req.url.split("/v1")[0]}/v1/wallet/balance`,
  });

  return c.json({
    checkout_url: session.url,
    session_id: session.id,
    amount_cents: amountCents,
  });
});

// GET /v1/wallet/balance — Check current balance
walletRoute.get("/balance", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const [wallet] = await db
    .select({ balanceCents: wallets.balanceCents })
    .from(wallets)
    .where(eq(wallets.userId, user.id))
    .limit(1);

  return c.json({
    balance_cents: wallet?.balanceCents ?? 0,
    currency: "EUR",
  });
});

// GET /v1/wallet/transactions — Wallet transaction history
walletRoute.get("/transactions", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const [wallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.userId, user.id))
    .limit(1);

  if (!wallet) {
    return c.json({ transactions: [] });
  }

  const rows = await db
    .select({
      id: walletTransactions.id,
      amount_cents: walletTransactions.amountCents,
      type: walletTransactions.type,
      description: walletTransactions.description,
      created_at: walletTransactions.createdAt,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, wallet.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(100);

  return c.json({ transactions: rows });
});
