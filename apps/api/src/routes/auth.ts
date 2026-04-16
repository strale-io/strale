import { Hono } from "hono";
import { eq, sql, and, gte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, wallets, walletTransactions, transactions } from "../db/schema.js";
import { generateApiKey, hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { apiError } from "../lib/errors.js";
import { authMiddleware, getClientIp, hashIp } from "../lib/middleware.js";
import { rateLimitByIpDb } from "../lib/db-rate-limit.js";
import { sendWebhook } from "../lib/webhook.js";
import { sendWelcomeEmail, sendRecoveryEmail } from "../lib/welcome-email.js";
import { DISPOSABLE_DOMAINS } from "../lib/disposable-domains.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import type { AppEnv } from "../types.js";
import type { Context } from "hono";

const TRIAL_CREDITS_CENTS = 200; // €2.00 per DEC-10

export const authRoute = new Hono<AppEnv>();

// POST /v1/auth/register — Register new account
// No auth required. DEC-21: 3 req/min per IP (prevent account spam).
// F-0-002: DB-backed — survives Railway restart.
authRoute.post(
  "/register",
  rateLimitByIpDb({ windowSeconds: 60, max: 3, scope: "auth-register" }),
  async (c) => {
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
  const clientIp = getClientIp(c);
  const signupIpHash = clientIp !== "unknown" ? hashIp(clientIp) : null;

  const [user] = await db
    .insert(users)
    .values({ email, name, apiKeyHash, keyPrefix, signupIpHash })
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

  // Fire-and-forget signup webhook
  const totalUsers = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(users);
  fireAndForget(
    () =>
      sendWebhook({
        event: "user.signup",
        user: {
          email: user.email,
          created_at: new Date().toISOString(),
        },
        stats: {
          total_users: Number(totalUsers[0]?.count ?? 0),
        },
      }),
    { label: "webhook-user-signup", context: { userId: user.id } },
  );

  // Fire-and-forget welcome email with API key
  fireAndForget(
    () => sendWelcomeEmail(user.email, apiKey),
    { label: "welcome-email-send", context: { userId: user.id } },
  );

  return c.json(
    {
      user_id: user.id,
      email: user.email,
      api_key: apiKey, // Shown once — store it safely
      wallet_balance_cents: TRIAL_CREDITS_CENTS,
      getting_started: {
        message: "Try your first call now — paste any of these into a terminal.",
        try_free: {
          description: "Validate a German IBAN (free, no credits used)",
          curl: `curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug":"iban-validate","inputs":{"iban":"DE89370400440532013000"},"max_price_cents":100}'`,
        },
        try_paid: [
          {
            description: "Screen against sanctions lists (€0.02)",
            curl: `curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug":"sanctions-check","inputs":{"name":"John Smith"},"max_price_cents":100}'`,
          },
          {
            description: "Audit an npm package for vulnerabilities (€0.15)",
            curl: `curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug":"package-security-audit","inputs":{"name":"express"},"max_price_cents":100}'`,
          },
        ],
        browse_capabilities: "https://api.strale.io/v1/capabilities",
        docs: "https://strale.dev/docs",
      },
    },
    201,
  );
});

// POST /v1/auth/recover — Email-based API key recovery
// No auth required. Strict rate limit: 2 per 5 minutes per IP.
// F-0-002: DB-backed — the 5-minute window must persist through redeploys,
// otherwise an attacker can time key-recovery bursts against deploys.
authRoute.post(
  "/recover",
  rateLimitByIpDb({ windowSeconds: 300, max: 2, scope: "auth-recover" }),
  async (c) => {
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
  const genericResponse = {
    message:
      "If an account exists with that email, a new API key has been sent.",
  };

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.log(
      `[key-recovery] email=${email} user_found=false timestamp=${new Date().toISOString()}`,
    );
    return c.json(genericResponse);
  }

  // Generate new key, invalidate old one
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

  console.log(
    `[key-recovery] email=${email} user_found=true timestamp=${new Date().toISOString()}`,
  );

  // Fire-and-forget recovery email
  fireAndForget(
    () => sendRecoveryEmail(user.email, newApiKey),
    { label: "recovery-email-send", context: { userId: user.id } },
  );

  return c.json(genericResponse);
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

// ── Agent self-signup (DEC-20260410-A) ────────────────────────────────────────
// POST /v1/signup — autonomous agent signup. Returns API key + €2 instantly.
// Mounted at /v1/signup in app.ts (not under /v1/auth).

export async function agentSignupHandler(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || !body.email.includes("@")) {
    return c.json(
      apiError("invalid_request", "A valid email address is required. Use your operator's real email — this is where usage reports and low-balance alerts are sent.", {
        field: "email",
      }),
      400,
    );
  }

  const email = body.email.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";

  // Reject disposable email domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return c.json(
      apiError("invalid_request", "Disposable email addresses are not accepted. Use your operator's real email address."),
      400,
    );
  }

  // MX validation — ensure the email domain can receive mail
  try {
    const dns = await import("node:dns/promises");
    const mx = await dns.resolveMx(domain).catch(() => []);
    if (mx.length === 0) {
      return c.json(
        apiError("invalid_request", `No mail server found for ${domain}. Use an email address that can receive mail.`),
        400,
      );
    }
  } catch {
    // DNS failure is non-fatal — allow signup to proceed
  }

  const db = getDb();
  const clientIp = getClientIp(c);
  const ipHash = clientIp !== "unknown" ? hashIp(clientIp) : null;

  // Require at least 1 successful free-tier call from this IP
  if (ipHash) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [usage] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(transactions)
      .where(and(
        sql`${transactions.userId} IS NULL`,
        eq(transactions.isFreeTier, true),
        eq(transactions.status, "completed"),
        sql`${transactions.auditTrail}->'request_context'->>'ipHash' = ${ipHash}`,
        gte(transactions.createdAt, sevenDaysAgo),
      ));

    if ((usage?.cnt ?? 0) === 0) {
      return c.json(
        apiError("unauthorized", "Make at least one free-tier API call before signing up. Try: POST /v1/do with capability_slug 'email-validate'.", {
          free_capabilities: ["email-validate", "dns-lookup", "iban-validate", "url-to-markdown", "json-repair"],
        }),
        403,
      );
    }
  }

  // Check if email already registered
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return c.json(
      apiError("invalid_request", "An account with this email already exists. Use POST /v1/auth/recover to get a new API key."),
      409,
    );
  }

  // Flag for review if 3+ signups from same IP this week
  let flaggedForReview = false;
  if (ipHash) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [ipSignups] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(and(
        eq(users.signupIpHash, ipHash),
        gte(users.createdAt, sevenDaysAgo),
      ));
    if ((ipSignups?.cnt ?? 0) >= 2) {
      flaggedForReview = true;
    }
  }

  // Create account (same as register)
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  const [user] = await db
    .insert(users)
    .values({ email, apiKeyHash, keyPrefix, signupIpHash: ipHash })
    .returning({ id: users.id, email: users.email });

  const [wallet] = await db
    .insert(wallets)
    .values({ userId: user.id, balanceCents: TRIAL_CREDITS_CENTS })
    .returning({ id: wallets.id });

  await db.insert(walletTransactions).values({
    walletId: wallet.id,
    amountCents: TRIAL_CREDITS_CENTS,
    type: "trial_credit",
    description: "Welcome trial credits (agent self-signup)",
  });

  // Fire-and-forget webhook
  fireAndForget(
    () =>
      sendWebhook({
        event: "user.signup",
        user: { email: user.email, created_at: new Date().toISOString() },
        source: "agent_self_signup",
        flagged_for_review: flaggedForReview,
        ...(flaggedForReview ? { flag_reason: "3+ signups from same IP this week" } : {}),
      }),
    { label: "webhook-user-signup", context: { userId: user.id, source: "agent_self_signup" } },
  );

  // Fire-and-forget welcome email
  fireAndForget(
    () => sendWelcomeEmail(user.email, apiKey),
    { label: "welcome-email-send", context: { userId: user.id } },
  );

  console.log(`[agent-signup] email=${email} ip=${clientIp} flagged=${flaggedForReview} timestamp=${new Date().toISOString()}`);

  return c.json({
    api_key: apiKey,
    balance_cents: TRIAL_CREDITS_CENTS,
    message: `Account created. You have €${(TRIAL_CREDITS_CENTS / 100).toFixed(2)} in credits.`,
    next_step: `Add "Authorization: Bearer ${apiKey}" to your requests to access 270+ paid capabilities.`,
    top_up: "POST /v1/wallet/topup with amount_cents (min 1000) to add more credits.",
  }, 201);
}
