import { Hono } from "hono";
import * as walletService from "../lib/wallet-service.js";
import { eq, sql, and, gte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, transactions } from "../db/schema.js";
import { generateApiKey, hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { apiError } from "../lib/errors.js";
import { authMiddleware, getClientIp, hashIp } from "../lib/middleware.js";
import { rateLimitByIpDb } from "../lib/db-rate-limit.js";
import { sendWebhook } from "../lib/webhook.js";
import { sendWelcomeEmail, sendRecoveryEmail } from "../lib/welcome-email.js";
import { getFreeTierSlugs } from "../lib/free-tier.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import {
  createAccount,
  emailIsRegistered,
  EmailAlreadyRegisteredError,
} from "../lib/account-service.js";
import {
  applyClosurePlan,
  buildClosureSummary,
} from "../lib/account-closure.js";
import {
  assessTrialGrant,
  MAX_NAME_LENGTH,
  trialRateBucket,
  PUBLIC_WITHHELD_MESSAGE,
  PUBLIC_WITHHELD_REASON,
  TRIAL_CREDITS_CENTS,
  type TrialAssessment,
} from "../lib/trial-eligibility.js";
import {
  issueRecoveryToken,
  redeemRecoveryToken,
  RECOVERY_TOKEN_TTL_MINUTES,
} from "../lib/key-recovery.js";
import type { AppEnv } from "../types.js";
import type { Context } from "hono";

export { TRIAL_CREDITS_CENTS };

// Cert-audit G7: ToS version recorded at signup. Bump whenever the
// public Terms page changes materially. Mirror this value in the
// frontend Terms component (LAST_UPDATED) so the user sees the same
// version they accepted.
export const CURRENT_TOS_VERSION = "2026-04-30";

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

  // `users.name` is varchar(255). Unchecked, an over-long value reaches the
  // INSERT and raises 22001, which is not a unique violation, so it propagates
  // as a 500 on what is plainly a 400. The email cap lives in the trial
  // authority; `name` never reaches it, so it is checked here.
  if (name !== null && name.length > MAX_NAME_LENGTH) {
    return c.json(
      apiError("invalid_request", `'name' must be at most ${MAX_NAME_LENGTH} characters.`, {
        field: "name",
      }),
      400,
    );
  }

  const db = getDb();

  // Fast path only. The authoritative duplicate check is the unique index,
  // enforced inside createAccount — this SELECT is a TOCTOU race on its own
  // and exists to answer the common case without attempting a write.
  if (await emailIsRegistered(db, email)) {
    return c.json(
      apiError("invalid_request", "An account with this email already exists."),
      409,
    );
  }

  const clientIp = getClientIp(c);
  const signupIpHash = clientIp !== "unknown" ? hashIp(clientIp) : null;
  // WP11: the trial cap counts by /64 for IPv6, so it needs its own bucketed
  // hash. `users.signup_ip_hash` keeps hashing the exact address — it is an
  // existing abuse-investigation column and narrowing it would lose detail.
  // For IPv4 the two are identical by construction.
  const trialBucket = trialRateBucket(clientIp);
  const trialIpHash = trialBucket ? hashIp(trialBucket) : null;

  // WP11: one authority decides the trial, for both signup channels. This
  // path used to decide it by not asking — every registration got EUR 2.00
  // with no gate of any kind, which is how eight accounts behind one signup
  // IP each took the grant in May.
  const assessment = await assessTrialGrant(db, {
    email,
    ipHash: trialIpHash,
    channel: "register",
  });

  if (assessment.decision === "refuse") {
    return c.json(
      apiError("invalid_request", assessment.message, { reason: assessment.reason }),
      400,
    );
  }

  // WP11: user + wallet + opening grant + trial entitlement, one transaction.
  // Previously the user row committed on its own and the wallet followed in a
  // second transaction, so a failure between them left an account that owned
  // its email address and could never spend.
  let account;
  try {
    account = await createAccount(db, {
      email,
      name,
      ipHash: signupIpHash,
      trialIpHash,
      grantCents: assessment.decision === "grant" ? assessment.grantCents : 0,
      grantDescription: "Welcome trial credits",
      channel: "register",
      tosVersion: CURRENT_TOS_VERSION,
    });
  } catch (err) {
    if (err instanceof EmailAlreadyRegisteredError) {
      return c.json(
        apiError("invalid_request", "An account with this email already exists."),
        409,
      );
    }
    throw err;
  }

  const apiKey = account.apiKey;
  const user = { id: account.userId, email: account.email };

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
    () => sendWelcomeEmail(user.email, apiKey, account.grantedCents),
    { label: "welcome-email-send", context: { userId: user.id } },
  );

  return c.json(
    {
      user_id: user.id,
      email: user.email,
      api_key: apiKey, // Shown once — store it safely
      // WP11: what the wallet was actually opened with. This field used to be
      // the TRIAL_CREDITS_CENTS constant, so it asserted a balance it never
      // read — correct only for as long as the grant was unconditional.
      wallet_balance_cents: account.grantedCents,
      // Present whenever nothing was granted, not only when the pre-check said
      // so. `assessTrialGrant` is advisory — the authoritative claim is the
      // UNIQUE index inside the transaction — so a concurrent signup for the
      // same address can withhold a grant the assessment expected to make.
      // Keying this block on the assessment alone would answer that caller
      // with a zero balance and no reason for it.
      ...(account.grantedCents === 0
        ? {
            trial_credits: {
              granted: false,
              // One undifferentiated reason. Registration does not verify the
              // mailbox, so anyone can register victim@corp.com and read this
              // field; `email_already_granted` would tell an unauthenticated
              // stranger that the address was once a Strale customer. The
              // specific reason is logged, not returned.
              reason: PUBLIC_WITHHELD_REASON,
              message: PUBLIC_WITHHELD_MESSAGE,
            },
          }
        : {}),
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

// POST /v1/auth/recover — request an API key recovery token
//
// WP11 / CR-10. This endpoint used to rotate the account's key and email the
// replacement, on an unauthenticated request whose only input was an email
// address. Two defects in one handler: anyone who knew a customer's address
// could revoke their working key at will, and the replacement was a reusable
// bearer secret delivered over email. Rate limiting bounded the rate, not the
// outcome — one request was already the whole attack.
//
// It now issues a single-use, 30-minute token to the mailbox and changes
// nothing about the account. The existing key keeps working. Rotation happens
// only at /v1/auth/recover/confirm, on proof that the requester read the mail.
//
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
      "If an account exists with that email, a recovery code has been sent. " +
      "Confirm with POST /v1/auth/recover/confirm { email, token }. " +
      "Your current API key keeps working until you do.",
    expires_in_minutes: RECOVERY_TOKEN_TTL_MINUTES,
  };

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // A redacted account must not be recoverable — its key was burned on closure
  // and Art. 17 erasure is one-way. Same generic answer, so closure state is
  // not an enumeration oracle either.
  if (!user || user.deletedAt !== null) {
    // F-0-013: do not log the email. Logging `email=<addr> user_found=false`
    // is both PII and a user-enumeration oracle — anyone with Railway log
    // access can trivially see which emails are registered. Log only that a
    // lookup happened.
    c.get("log").info({ label: "key-recovery", user_found: false }, "key-recovery");
    return c.json(genericResponse);
  }

  const clientIp = getClientIp(c);
  const { token } = await issueRecoveryToken(db, {
    userId: user.id,
    ipHash: clientIp !== "unknown" ? hashIp(clientIp) : null,
  });

  // F-0-013: drop email from the log. user.id is enough for operational
  // tracing and doesn't leak PII or act as an enumeration oracle.
  c.get("log").info(
    { label: "key-recovery", user_found: true, user_id: user.id },
    "key-recovery",
  );

  fireAndForget(
    () => sendRecoveryEmail(user.email, token, RECOVERY_TOKEN_TTL_MINUTES),
    { label: "recovery-email-send", context: { userId: user.id } },
  );

  return c.json(genericResponse);
});

// POST /v1/auth/recover/confirm — redeem a recovery token and rotate the key
//
// The rotation half of the flow above. Single-use and time-boxed, enforced by
// `SELECT … FOR UPDATE` on the token row inside the redemption transaction, so
// two concurrent redemptions serialise on the lock and produce one rotation.
// (Deliberately a lock rather than a conditional UPDATE: claiming first meant a
// caller who typed the wrong address spent the code — see key-recovery.ts.)
//
// The rate limit is not a brute-force defence — a 256-bit token does not need
// one — it bounds the cost of a flood of invalid redemptions.
authRoute.post(
  "/recover/confirm",
  rateLimitByIpDb({ windowSeconds: 300, max: 10, scope: "auth-recover-confirm" }),
  async (c) => {
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.token !== "string" ||
    body.token.length === 0
  ) {
    return c.json(
      apiError("invalid_request", "Both 'email' and 'token' are required.", {
        fields: ["email", "token"],
      }),
      400,
    );
  }

  const db = getDb();
  const result = await redeemRecoveryToken(db, {
    token: body.token,
    email: body.email,
  });

  if (!result.ok) {
    c.get("log").info(
      { label: "key-recovery-confirm", ok: false },
      "key-recovery-confirm",
    );
    return c.json(
      apiError(
        "unauthorized",
        "That recovery code is invalid, expired, or already used. Request a new one with POST /v1/auth/recover.",
      ),
      401,
    );
  }

  c.get("log").info(
    { label: "key-recovery-confirm", ok: true, user_id: result.userId },
    "key-recovery-confirm",
  );

  return c.json({
    api_key: result.apiKey, // Shown once — the previous key is now invalid
    key_prefix: result.keyPrefix,
    message: "Your previous API key has been deactivated.",
  });
});

// DELETE /v1/auth/me — GDPR Art. 17 right to erasure (cert-audit G1).
//
// Anonymises the user row in place rather than physically deleting it.
// Transactions are NOT deleted — they participate in the audit hash chain
// (DEC-20260428-B) and represent processing records under Art. 30, which
// the controller is obliged to retain. Anonymising the user link satisfies
// Art. 17 because no re-identification of the user is possible from the
// remaining data.
//
// What this endpoint does:
//   1. Overwrites email + name + apiKeyHash on the users row
//   2. Burns the wallet balance (cannot be reactivated)
//   3. Sets deleted_at + deletion_reason
//
// What this endpoint deliberately does NOT do:
//   - Touch transactions / wallet_transactions / audit chain
//   - Cascade-delete to anything that affects another customer's data
//
// The response itemises both lists so the user has explicit confirmation
// of what survived erasure and the legal basis. This is a one-way action;
// the API key dies the moment this returns 200.
authRoute.delete("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = await c.req.json().catch(() => ({})) as { reason?: string };
  const reason = (body.reason ?? "").toString().slice(0, 500) || "user_request";

  const now = new Date();
  // Replace identifiers with sentinels. Email keeps the unique-index
  // happy by tagging a UUID; apiKeyHash gets a random sha256 so the
  // current key fails immediately on next use.
  const sentinel = `redacted-${user.id}@deleted.local`;
  const burnedKeyHash = hashApiKey(generateApiKey());

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        email: sentinel,
        name: null,
        apiKeyHash: burnedKeyHash,
        keyPrefix: "REDACTED",
        signupIpHash: null,
        deletedAt: now,
        deletionReason: reason,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    // Forfeit whatever remains — refund-on-delete is out of scope (it would
    // need a Stripe payout flow) and is documented in the response.
    //
    // WP2: this used to zero the balance with no ledger entry, which made it
    // the one balance change on the platform with no audit trail and left the
    // ledger permanently out of step with the balance for that wallet. It now
    // goes through the wallet service, which writes a paired closure_forfeit
    // entry, and takes the row lock the previous version skipped.
    await walletService.forfeitOnClosure(tx, {
      userId: user.id,
      description: "Balance forfeited on account closure (Art. 17 erasure)",
    });

    // WP11: everything closure clears, and everything it deliberately does
    // not, is declared once in `lib/account-closure.ts` — which also builds
    // the summary returned below. They were two hand-maintained artifacts and
    // drifted apart in three consecutive review rounds; they are one artifact
    // now, and a completeness test fails if a user-linked table is missing
    // from the plan.
    await applyClosurePlan(tx, { userId: user.id });
  });

  const closureSummary = buildClosureSummary();

  // Cert-audit Y-7: be explicit about what survives erasure. The
  // integrity hash includes input + auditTrail in the hashed payload
  // (lib/integrity-hash.ts), so nullifying those fields would break the
  // chain for every subsequent transaction in the day's chain. We
  // therefore retain audit_trail.executionInput under Art. 30; the
  // contact channel below exists for users who exercise their absolute
  // Art. 17 right and accept the chain reset. Anonymisation of the
  // controller-side identifiers (email/name/api_key/IP) happens
  // immediately and is irreversible.
  return c.json({
    status: "redacted",
    user_id: user.id,
    redacted_at: now.toISOString(),
    deletion_reason: reason,
    summary: {
      // Derived from CLOSURE_PLAN, never restated. A hand-written copy of this
      // list was wrong in three consecutive review rounds — each time in a
      // place the previous round had not pointed at.
      ...closureSummary,
      retained_legal_basis:
        "GDPR Art. 30 (records of processing) + DEC-20260428-B (audit-chain integrity). " +
        "Your row's identifiers are anonymised; transaction rows still carry your user id, which points at that anonymised row — a bare id is not a name, and severing it would break the hashed chain every later transaction references. " +
        "This is the same legal basis many regulated-industry providers (banks, KYC vendors) use for retention-on-deletion. " +
        "Per-item reasons are in `disclosures` below.",
      retained_pii_disclosure:
        "If you used capabilities that take personal data as input — e.g. pii-redact, invoice-extract, company-enrich, sanctions-check on a real person — the input you supplied is retained inside audit_trail.executionInput on the transactions row. The row no longer links to a named account, but the input itself is still readable to a Strale operator who could correlate by content. " +
        "If this matters to your situation (e.g. data subject was a third party who has now exercised Art. 17), email petter@strale.io with the affected transaction IDs; we'll redact in place and accept the audit-chain reset that requires.",
    },
    api_key_status: "burned — current key will fail on next use",
    wallet_status: "balance_zeroed",
    contact: "petter@strale.io",
  });
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

  // WP11: the disposable-domain and MX checks that used to be written out
  // here now live in the trial-eligibility authority, so the register path
  // gets them too. They are applied below, together with the entitlement
  // gates, on one call.
  const db = getDb();
  const clientIp = getClientIp(c);
  const ipHash = clientIp !== "unknown" ? hashIp(clientIp) : null;
  const trialBucket = trialRateBucket(clientIp);
  const trialIpHash = trialBucket ? hashIp(trialBucket) : null;

  // WP11: same authority as /v1/auth/register. Both channels ask the same
  // question and get an answer computed by the same rules.
  //
  // Runs BEFORE the prior-free-call gate, matching the order the inline
  // disposable/MX checks used to run in. Telling an agent with a disposable
  // address to go make a free-tier call first, and only refusing the address
  // afterwards, wastes a round trip and reads as a different problem than the
  // one it has.
  const assessment: TrialAssessment = await assessTrialGrant(db, {
    email,
    ipHash: trialIpHash,
    channel: "agent_signup",
  });

  if (assessment.decision === "refuse") {
    return c.json(
      apiError("invalid_request", assessment.message, { reason: assessment.reason }),
      400,
    );
  }

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
      // Read from the shared authority, never a literal. This list used to be
      // five hardcoded slugs; it named `url-to-markdown` for the whole of the
      // 2026-08-22 quarantine, telling an agent to unblock its signup with a
      // call the platform would refuse. A gate whose instructions cannot be
      // followed is worse than no gate.
      const freeSlugs = await getFreeTierSlugs(db);
      // Preference, not an assertion: if the friendliest example is not
      // servable right now we name whatever is, and if nothing is we say
      // nothing rather than naming a capability that would refuse.
      const suggested =
        ["email-validate", "dns-lookup"].find((s) => freeSlugs.includes(s)) ??
        freeSlugs[0] ??
        null;
      return c.json(
        apiError(
          "unauthorized",
          suggested
            ? `Make at least one free-tier API call before signing up. Try: POST /v1/do with capability_slug '${suggested}'.`
            : "Make at least one free-tier API call before signing up.",
          { free_capabilities: freeSlugs },
        ),
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

  // Flag for review if 3+ signups from same IP this week. A signal on the
  // signup webhook, and on THIS channel that is all it is: the trial
  // authority's per-IP cap deliberately does not apply to agent signups (see
  // IP_CAPPED_CHANNELS — this path already requires same-IP clustering by
  // design). What withholds money here is the one-grant-per-address rule.
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

  let account;
  try {
    account = await createAccount(db, {
      email,
      ipHash,
      trialIpHash,
      grantCents: assessment.decision === "grant" ? assessment.grantCents : 0,
      grantDescription: "Welcome trial credits (agent self-signup)",
      channel: "agent_signup",
      tosVersion: CURRENT_TOS_VERSION,
    });
  } catch (err) {
    if (err instanceof EmailAlreadyRegisteredError) {
      return c.json(
        apiError("invalid_request", "An account with this email already exists. Use POST /v1/auth/recover to get a new API key."),
        409,
      );
    }
    throw err;
  }

  const apiKey = account.apiKey;
  const user = { id: account.userId, email: account.email };

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
    () => sendWelcomeEmail(user.email, apiKey, account.grantedCents),
    { label: "welcome-email-send", context: { userId: user.id } },
  );

  // F-0-013: drop email + raw IP. user.id is already allocated at this point
  // and is the operational join key. Raw client IP is separately used for
  // abuse-detection via `signupIpHash`; logging the cleartext IP alongside
  // an email on the same line is a tidy little dossier for anyone with log
  // read access.
  c.get("log").info(
    { label: "agent-signup", user_id: user.id, flagged: flaggedForReview },
    "agent-signup",
  );

  return c.json({
    api_key: apiKey,
    // WP11: the amount actually granted, read from the account transaction —
    // not the constant. An agent that reads this and plans its spend against
    // a hardcoded 200 would have overspent the moment a gate withheld.
    balance_cents: account.grantedCents,
    message:
      account.grantedCents > 0
        ? `Account created. You have €${(account.grantedCents / 100).toFixed(2)} in credits.`
        : "Account created with no trial credits. Top up to make paid calls.",
    // Same reasoning as the register handler above: keyed on what was
    // actually granted, because the assessment is advisory and the unique
    // index is the authority.
    ...(account.grantedCents === 0
      ? {
          trial_credits: {
            granted: false,
            // Same reasoning as the register handler above.
            reason: PUBLIC_WITHHELD_REASON,
            message: PUBLIC_WITHHELD_MESSAGE,
          },
        }
      : {}),
    next_step: `Add "Authorization: Bearer ${apiKey}" to your requests to access 270+ paid capabilities.`,
    top_up: "POST /v1/wallet/topup with amount_cents (min 1000) to add more credits.",
  }, 201);
}
