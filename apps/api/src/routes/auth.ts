import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, wallets, walletTransactions } from "../db/schema.js";
import { generateApiKey, hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { apiError } from "../lib/errors.js";
import { authMiddleware } from "../lib/middleware.js";
import type { AppEnv } from "../types.js";

const TRIAL_CREDITS_CENTS = 200; // €2.00 per DEC-10

export const authRoute = new Hono<AppEnv>();

// POST /v1/auth/register — Register new account
// No auth required (public endpoint)
authRoute.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || !body.email.includes("@")) {
    return c.json(
      apiError("invalid_request", "A valid email address is required.", {
        field: "email",
      }),
      400,
    );
  }

  const email = body.email.trim().toLowerCase();
  const name =
    typeof body.name === "string" ? body.name.trim() || null : null;

  const db = getDb();

  // Check if email already registered
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return c.json(
      apiError("invalid_request", "An account with this email already exists."),
      409,
    );
  }

  // Generate API key — shown to user once, then only the hash is stored
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  // Create user + wallet + trial credits
  const [user] = await db
    .insert(users)
    .values({ email, name, apiKeyHash, keyPrefix })
    .returning({ id: users.id, email: users.email });

  const [wallet] = await db
    .insert(wallets)
    .values({ userId: user.id, balanceCents: TRIAL_CREDITS_CENTS })
    .returning({ id: wallets.id });

  await db.insert(walletTransactions).values({
    walletId: wallet.id,
    amountCents: TRIAL_CREDITS_CENTS,
    type: "trial_credit",
    description: "Welcome trial credits",
  });

  return c.json(
    {
      user_id: user.id,
      email: user.email,
      api_key: apiKey, // Shown once — store it safely
      wallet_balance_cents: TRIAL_CREDITS_CENTS,
    },
    201,
  );
});

// POST /v1/auth/api-key — Regenerate API key
// Requires auth (old key must still work)
authRoute.post("/api-key", authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getDb();

  const newApiKey = generateApiKey();
  const newHash = hashApiKey(newApiKey);
  const newPrefix = getKeyPrefix(newApiKey);

  await db
    .update(users)
    .set({
      apiKeyHash: newHash,
      keyPrefix: newPrefix,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return c.json({
    api_key: newApiKey, // Shown once — old key is now invalid
    key_prefix: newPrefix,
  });
});
