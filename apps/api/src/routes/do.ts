import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createHash } from "node:crypto";
import { checkCallbackUrl } from "../lib/jobs/callbacks.js";
import { assertGuardedAllow, BudgetExhaustedError, CapabilityInvocationRefusedError, CapabilityNotClassifiedError } from "../capabilities/guarded-executor.js";
import { getExecutor } from "../capabilities/index.js";
import { getDb } from "../db/index.js";
import { capabilities, failedRequests, transactions, wallets } from "../db/schema.js";
import { extractClientMeta } from "../lib/attribution.js";
import { setCostDeadline } from "../lib/call-cost.js";
import { checkCircuitBreaker } from "../lib/circuit-breaker.js";
import { hasMissingRequiredCredential } from "../lib/dependency-manifest.js";
import { apiError } from "../lib/errors.js";
import { shouldExecuteAsync } from "../lib/execution-routing.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import { enforceFreeTierAllowance } from "../lib/free-tier-allowance.js";
import { getFreeTierSlugs } from "../lib/free-tier.js";
import { computeIdempotencyFingerprint } from "../lib/idempotency-fingerprint.js";
import { validateDispatchInput } from "../lib/input-validation.js";
import { logError } from "../lib/log.js";
import { matchCapability } from "../lib/matching.js";
import { getClientIp, hashIp, optionalAuthIpLimitedUnlessKeyed } from "../lib/middleware.js";
import { inputForFingerprint } from "../lib/never-persist-inputs.js";
import { getCapabilityQuality } from "../lib/quality-aggregation.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { recoveredValuesHint, recoverValuesFromTask, unsatisfiedGroupFields } from "../lib/task-value-hints.js";
import { computeFreshnessGrade } from "../lib/trust-grade.js";
import { isX402PayableCapability } from "../lib/x402-eligibility.js";
import { validateX402Input } from "../lib/x402-input-validation.js";
import { isUnlocked } from "../lib/progressive-unlock.js";
import { build402Response, extractPaymentHeader, hashPaymentHeader, isX402Configured, verifyX402PaymentOnly } from "../lib/x402-gateway.js";
import type { AppEnv } from "../types.js";
import { executeAsync, executeFreeTier, executeFreeTierAuthenticated, executeSync } from "../lib/do/dispatch.js";
import { replaySyncRequest } from "../lib/do/idempotency.js";

// F-0-009 Stage 2: integrity hashing moved to jobs/integrity-hash-retry.ts.

/**
 * The refusal an anonymous caller gets when the capability that answers their
 * request costs money.
 *
 * ONE function, two call sites, because for five months there was one call
 * site and a hole. The early auth gate in section 3 fires only when the caller
 * NAMES a slug — but `task` is the documented, advertised way to call this
 * endpoint, so a caller who described what they wanted instead of naming it
 * fell past the gate, past the free-tier fork, and into the paid execution
 * path with no user and no wallet. The wallet read threw and app.ts's
 * top-level handler answered `internal_error`, HTTP 500.
 *
 * What that cost: an agent arriving the way we tell agents to arrive, asking
 * for something we sell, was told "An unexpected error occurred" instead of
 * the price and how to pay it. It is the same defect class as the free-tier
 * front door on 2026-08-22 — the answer a caller is given must come from the
 * code that decides, not from a second site that happens to agree.
 *
 * Live from 2026-03-08 (`1e8ebe6`, the commit that introduced the gate) to
 * 2026-08-23.
 */
async function anonymousPaidRefusal(
  c: Context,
  db: ReturnType<typeof getDb>,
  cap: {
    slug: string;
    name: string;
    priceCents: number;
    isActive: boolean;
    isFreeTier: boolean | null;
    x402Enabled: boolean;
    marketplaceEligible: boolean;
    visible: boolean;
    lifecycleState: string;
  },
) {
  if (isX402Configured() && isX402PayableCapability(cap)) {
    const resp = build402Response({
      slug: cap.slug,
      name: cap.name,
      priceCents: cap.priceCents,
    });
    return c.json(resp.body, 402);
  }
  const freeSlugs = await getFreeTierSlugs(db);
  return c.json(
    {
      error_code: "unauthorized",
      details: { fix: "Send a valid API key in the Authorization: Bearer <api_key> header or choose a free 'capability_slug' from GET /v1/capabilities." },
      message:
        "This capability requires an API key. Sign up at strale.dev/signup for paid tools; trial credits are available where eligible.",
      free_capabilities: freeSlugs,
      hint: `These ${freeSlugs.length} capabilities are free with no signup — try them without an API key.`,
      self_signup: {
        url: "https://api.strale.io/v1/signup",
        method: "POST",
        body: { email: "your-agent@yourdomain.com" },
        description:
          "Create an account programmatically with trial credits where eligible. Requires at least one prior free-tier call from this IP.",
      },
    },
    401,
  );
}

// ─── MCP client detection from User-Agent ────────────────────────────────────

function parseMcpClient(ua: string | null): string | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  if (lower.includes("claude") || lower.includes("claude-desktop")) return "claude-desktop";
  if (lower.includes("cursor")) return "cursor";
  if (lower.includes("windsurf")) return "windsurf";
  if (lower.includes("copilot")) return "copilot";
  if (lower.includes("straleio") || lower.includes("strale-mcp")) return "strale-sdk";
  if (lower.includes("python-httpx") || lower.includes("python-requests")) return "python-sdk";
  if (lower.includes("node-fetch") || lower.includes("undici")) return "node-sdk";
  if (lower.includes("axios")) return "axios";
  return null;
}

const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_PRICE_CAP_CENTS = 2000; // €20 absolute cap per request

// DEC-22 routing policy now lives in lib/execution-routing.ts (#436), so the
// route, the audit script and the tests read one definition.

export const doRoute = new Hono<AppEnv>();

// POST /v1/do — Core endpoint: execute a capability
// DEC-21: 10 req/sec per API key (authenticated), calendar-month allowance per IP (free-tier)
doRoute.post(
  "/do",
  // Per IP for anonymous and invalid-key requests (S-5); a valid key skips it,
  // so keyed traffic from shared integration IPs is limited per key instead.
  optionalAuthIpLimitedUnlessKeyed(60, 60_000),
  rateLimitByKey(10, 1000),         // applies only if user is set
  // Free-tier monthly allowance enforced in-handler via DB counter — restart-safe
  async (c) => {
  const user = c.get("user");
  const db = getDb();

  // Capture request context for attribution tracking (stored in audit trail)
  const userAgent = c.req.header("user-agent") ?? null;
  // Channel attribution (design 2026-08-12): weak-but-joinable signals,
  // persisted on the transaction row for the weekly rollup. ?src= comes from
  // tagged directory-submission URLs.
  c.set("clientMeta", extractClientMeta(c.req, {
    src: c.req.query("src"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
  }) ?? null);
  const requestContext = {
    referer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
    origin: c.req.header("origin") ?? null,
    userAgent,
    // Hash IP for aggregate pattern analysis (never store raw IPs)
    ipHash: (() => {
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
        ?? c.req.header("cf-connecting-ip")
        ?? c.req.header("x-real-ip")
        ?? null;
      return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
    })(),
    acceptLanguage: c.req.header("accept-language")?.split(",")[0]?.trim() ?? null,
    // Fingerprint fallback for rate limiting when IP is undetectable.
    // Hash of UA + Accept-Language + Origin/Referer — not unique but
    // stable enough for conservative rate limiting (3/day cap).
    fingerprintHash: (() => {
      const ua = c.req.header("user-agent") ?? "";
      const lang = c.req.header("accept-language") ?? "";
      const origin = c.req.header("origin") ?? c.req.header("referer") ?? "";
      const raw = `${ua}|${lang}|${origin}`;
      // Only generate a fingerprint if we have at least some signal
      return raw.length > 4 ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : null;
    })(),
    // Parse known MCP/SDK clients from User-Agent
    mcpClient: parseMcpClient(userAgent),
  };
  c.set("requestContext", requestContext);

  // ── 1. Parse and validate request ──────────────────────────────────────
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      apiError("invalid_request", "Request body is required.", { fix: "Send a JSON object in the request body with Content-Type: application/json." }),
      400,
    );
  }

  const task: string | undefined = body.task;
  const capabilitySlug: string | undefined = body.capability_slug;
  const inputs: Record<string, unknown> | undefined = body.inputs;
  const maxPriceCents: number | undefined = body.max_price_cents;
  if (body.timeout_seconds !== undefined &&
      (typeof body.timeout_seconds !== "number" || !Number.isFinite(body.timeout_seconds) || body.timeout_seconds <= 0)) {
    return c.json(apiError("invalid_request", "'timeout_seconds' must be a positive finite number.",
      { fix: "Send 'timeout_seconds' as a positive number of seconds (maximum 60)." }), 400);
  }
  const timeoutSeconds: number = Math.min(
    Math.max(5, body.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS),
    MAX_TIMEOUT_SECONDS,
  );
  setCostDeadline(timeoutSeconds * 1000);
  const dryRun: boolean = body.dry_run === true;
  // `min_sqs` retired with the SQS engine (DEC-20260503-B). Silently ignored
  // when present in the body; not parsed, not gated, not echoed.
  const requireFresh: boolean = body.require_fresh === true;
  const maxLatencyMs: number | undefined =
    typeof body.max_latency_ms === "number" && body.max_latency_ms > 0
      ? Math.round(body.max_latency_ms)
      : undefined;

  // Portfolio 2.11: an optional completion callback for async executions.
  // Validated up front (https, public host) so a bad URL is a 400 before any
  // money moves; used only when the capability runs on the async path.
  let callbackUrl: string | null = null;
  if (body.callback_url !== undefined && body.callback_url !== null) {
    const problem = await checkCallbackUrl(body.callback_url);
    if (problem) {
      return c.json(apiError("invalid_request", problem, {
        fix: "Send 'callback_url' as a public https URL, or omit it and poll GET /v1/transactions/{id}.",
      }), 400);
    }
    callbackUrl = body.callback_url as string;
  }

  if (!task && !capabilitySlug) {
    return c.json(
      apiError(
        "invalid_request",
        "Either 'task' or 'capability_slug' is required.", { fix: "Send either 'task' describing the work or 'capability_slug' from GET /v1/capabilities." },
      ),
      400,
    );
  }

  // max_price_cents: required for authenticated users, optional for free-tier
  if (user) {
    if (
      maxPriceCents == null ||
      typeof maxPriceCents !== "number" ||
      maxPriceCents <= 0
    ) {
      return c.json(
        apiError(
          "invalid_request",
          "'max_price_cents' is required and must be a positive integer.", { fix: "Send 'max_price_cents' as a positive integer number of cents." },
        ),
        400,
      );
    }

    if (maxPriceCents > MAX_PRICE_CAP_CENTS) {
      return c.json(
        apiError(
          "invalid_request",
          `'max_price_cents' cannot exceed ${MAX_PRICE_CAP_CENTS} (€${MAX_PRICE_CAP_CENTS / 100}).`,
          { fix: `Set 'max_price_cents' to an integer between 1 and ${MAX_PRICE_CAP_CENTS}.`, max_allowed: MAX_PRICE_CAP_CENTS },
        ),
        400,
      );
    }
  }

  // For unauthenticated requests, default to 0 (free-tier only).
  // If the capability is progressively unlocked for this IP, allow its price through.
  const preAuthIpHash = c.get("requestContext")?.ipHash;
  const isPreUnlocked = !user && capabilitySlug && preAuthIpHash && isUnlocked(preAuthIpHash, capabilitySlug);
  const effectiveMaxPrice = maxPriceCents ?? (isPreUnlocked ? 10000 : 0);

  // ── 2. Idempotency check (authenticated only) ─────────────────────────
  const idempotencyKey = c.req.header("Idempotency-Key") || null;
  // The column is varchar(255); an over-long key reached the INSERT and raised
  // Postgres 22001, which the executeSync catch does not recognise and which
  // therefore surfaced as a 500. Newly reachable now that A2A forwards a
  // caller-controlled header, and a clear 400 is the honest answer either way.
  if (idempotencyKey && idempotencyKey.length > 255) {
    return c.json(
      apiError(
        "invalid_request",
        "Idempotency-Key must be 255 characters or fewer.", { fix: "Shorten the Idempotency-Key header to 255 characters or fewer." },
      ),
      400,
    );
  }

  // WP6: what the key is a key TO. Bound to the request it was first used for,
  // so the same key reused for different work is a client bug (409) rather than
  // a plausible-looking answer to a question the caller did not ask.
  const idempotencyFingerprint = computeIdempotencyFingerprint({
    rail: "capability",
    task,
    capabilitySlug,
    // Never-persisted fields (e.g. password-strength's password) are masked:
    // the fingerprint is stored on the row and an unsalted hash of a weak
    // secret is crackable. See lib/never-persist-inputs.ts.
    inputs: inputForFingerprint(capabilitySlug, inputs),
    dryRun: body.dry_run === true,
    requireFresh: body.require_fresh === true,
  });

  if (idempotencyKey && user) {
    const [existing] = await db
      .select()
      .from(transactions)
      // Scoped to the capability rail. A key is per-customer, but it is not
      // per-PLATFORM: without this, a prior solution row could be replayed as a
      // capability result. The solutions route carries the mirror of this.
      .where(and(
        eq(transactions.idempotencyKey, idempotencyKey),
        eq(transactions.userId, user.id),
        isNull(transactions.solutionSlug),
        isNull(transactions.deletedAt),
      ))
      .limit(1);

    if (existing) return replaySyncRequest(c, db, existing, idempotencyFingerprint, capabilitySlug, user.id);
  }

  // ── 3. Early auth gate for unauthenticated requests ───────────────────
  // Check BEFORE matching so non-free capabilities return a clear response:
  //   - x402 configured + payment header → verify and continue
  //   - x402 configured + no payment → return 402 with price
  //   - x402 not configured → return 401 with signup prompt
  if (!user && capabilitySlug) {
    const [lookedUp] = await db
      .select({
        isFreeTier: capabilities.isFreeTier,
        isActive: capabilities.isActive,
        priceCents: capabilities.priceCents,
        name: capabilities.name,
        // x402 rail eligibility (WP0 §3.1) — these decide whether the
        // capability may be paid for with USDC. Consumed by
        // isX402PayableCapability; do not gate on isActive alone. This lookup
        // is by slug with no filter, so `visible` has to come from here: it is
        // the only thing standing between an anonymous caller naming a
        // withdrawn slug and a 402 challenge to pay for it.
        x402Enabled: capabilities.x402Enabled,
        marketplaceEligible: capabilities.marketplaceEligible,
        visible: capabilities.visible,
        lifecycleState: capabilities.lifecycleState,
      })
      .from(capabilities)
      .where(eq(capabilities.slug, capabilitySlug))
      .limit(1);

    if (lookedUp && lookedUp.isActive && !lookedUp.isFreeTier) {
      // Check progressive unlock before rejecting (DEC-20260410-A)
      const reqIpHash = c.get("requestContext")?.ipHash;
      if (reqIpHash && isUnlocked(reqIpHash, capabilitySlug)) {
        // Treat as free-tier — fall through to matching + execution
      } else {
      // Check for x402 payment header
      const paymentHeader = extractPaymentHeader(c.req.raw.headers);

      // WP0 §3.1 — the x402 rail has its own eligibility rule, and the quality
      // floor delists a failing capability by clearing x402_enabled. Honour the
      // same rule here so a delisted capability cannot be bought through
      // /v1/do. Checked before verification so no payment is ever consumed for
      // a capability we will not serve.
      const x402Payable = isX402PayableCapability(lookedUp);

      if (paymentHeader && isX402Configured() && !x402Payable) {
        return c.json(
          apiError(
            "capability_unavailable",
            `'${capabilitySlug}' is not currently available for x402 payment. No payment was taken.`,
          ),
          503,
        );
      }

      if (paymentHeader && isX402Configured() && x402Payable) {
        // Verify x402 payment WITHOUT broadcasting settlement — the settle
        // step runs only after the capability has produced output (DEC-14).
        const verification = await verifyX402PaymentOnly(paymentHeader, lookedUp.priceCents);
        if (!verification.valid || !verification.verified) {
          return c.json({
            error_code: "payment_failed",
            details: { retryable: false, fix: "Fetch fresh payment requirements for this capability and send a matching signed x402 payment in the PAYMENT-SIGNATURE header (or X-PAYMENT for v1)." },
            message: verification.error ?? "x402 payment verification failed",
          }, 402);
        }
        // Stash the verified handle for executeFreeTier to settle post-success.
        c.set("x402_verified", verification.verified);
        // WP5: and the payment hash, so the settle site downstream can write a
        // durable intent before it moves USDC. Carried the same way the handle
        // is, because the settle happens far from where the header is in scope.
        c.set("x402_payment_hash", hashPaymentHeader(paymentHeader));
        c.set("x402_paid", true);
        // Fall through to normal execution — the capability will execute
        // and the transaction will be logged with payment_method: "x402"
      } else {
        // No payment header: 402 with the price if the rail can take it,
        // otherwise 401 with the free list and the signup route. Both come
        // from anonymousPaidRefusal, which the task-based path below also
        // calls — one answer, two ways in.
        return anonymousPaidRefusal(c, db, { ...lookedUp, slug: capabilitySlug });
      }
      } // close progressive unlock else
    }
  }

  // ── 3a. Match capability ─────────────────────────────────────────────
  const match = await matchCapability({
    task,
    capabilitySlug,
    category: body.category,
    maxPriceCents: effectiveMaxPrice,
  });

  if (!match || match.budgetExceeded) {
    // Budget exceeded: capability exists but costs more than max_price_cents
    if (match?.budgetExceeded) {
      return c.json(
        apiError(
          "budget_exceeded",
          `Capability '${match.capability.slug}' costs €${(match.capability.priceCents / 100).toFixed(2)} (${match.capability.priceCents} cents) which exceeds your max_price_cents of ${effectiveMaxPrice}.`,
          {
            capability_slug: match.capability.slug,
            actual_price_cents: match.capability.priceCents,
            max_price_cents: effectiveMaxPrice,
          },
        ),
        402,
      );
    }

    // Log the failed request for demand analysis (DEC-20260225-P-c5d6)
    // Now captures both authenticated and unauthenticated failures
    const clientIp = getClientIp(c);
    fireAndForget(
      () =>
        db.insert(failedRequests).values({
          userId: user?.id ?? null,
          ipHash: clientIp !== "unknown" ? hashIp(clientIp) : null,
          task: task ?? capabilitySlug ?? "",
          category: body.category ?? null,
          maxPriceCents: effectiveMaxPrice ?? null,
          failureType: "no_match",
          userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
        }),
      { label: "failed-request-log", context: { failureType: "no_match", userId: user?.id ?? null } },
    );

    // Unauthenticated task-based requests that found no free-tier match
    if (!user) {
      const freeSlugs = await getFreeTierSlugs(db);
      return c.json({
        error_code: "unauthorized",
      details: { fix: "Send a valid API key in the Authorization: Bearer <api_key> header or choose a free 'capability_slug' from GET /v1/capabilities." },
        message: "No free capability matched your request. Sign up at strale.dev/signup for paid tools; trial credits are available where eligible.",
        free_capabilities: freeSlugs,
        hint: `These ${freeSlugs.length} capabilities are free with no signup — try them without an API key.`,
      }, 401);
    }

    return c.json(
      apiError(
        "no_matching_capability",
        "No capability found matching your request within budget.",
        {
          task,
          capability_slug: capabilitySlug,
          max_price_cents: effectiveMaxPrice,
        },
      ),
      404,
    );
  }

  const capability = match.capability;
  const isFreeTier = capability.isFreeTier;
  const schemaFailure = validateDispatchInput(capability.slug, c.get("x402_paid") ? "x402" : user ? "wallet" : "free", capability.inputSchema, inputs ?? {});
  if (schemaFailure) return c.json(schemaFailure, schemaFailure.error_code === "capability_unavailable" ? 503 : 400);

  if (hasMissingRequiredCredential(capability.slug)) {
    return c.json(apiError("capability_unavailable", "This capability is temporarily unavailable. Contact Strale support."), 503);
  }

  // ── 3a. Platform-quality-floor gate retired with the SQS engine
  //         (DEC-20260503-B). Lifecycle state + circuit-breaker still gate.

  // ── 3b. Hourly spend cap fast-fail (DEC-21) — authenticated only ───────
  // Cert-audit C8: this is the cheap pre-check that catches the obvious
  // over-budget case without holding any locks. The authoritative check
  // runs INSIDE the wallet-locked transaction (executeWithSpendCapCheck)
  // so concurrent requests can't each pass the pre-check and collectively
  // blow the cap. Race window: two requests arrive milliseconds apart,
  // both read SUM=950, both pass `950+50 ≤ 1000`, and both proceed to
  // debit — the cap is breached. The atomic check inside the tx fixes
  // it; this pre-check is kept only to avoid spinning up the executor
  // for the trivially-over case.
  if (user && user.maxSpendPerHourCents) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [spendRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(price_cents), 0)::text` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.status, "completed"),
          gte(transactions.createdAt, oneHourAgo),
        ),
      );

    const spent = Number(spendRow?.total ?? 0);
    if (spent + capability.priceCents > user.maxSpendPerHourCents) {
      return c.json(
        apiError(
          "spend_cap_exceeded",
          `Hourly spend limit (€${(user.maxSpendPerHourCents / 100).toFixed(2)}) would be exceeded. Spent: €${(spent / 100).toFixed(2)}, requested: €${(capability.priceCents / 100).toFixed(2)}.`,
          {
            spent_cents: spent,
            requested_cents: capability.priceCents,
            limit_cents: user.maxSpendPerHourCents,
          },
        ),
        429,
      );
    }
  }

  // ── 4. Dry run — return what would execute without charging ────────────
  if (dryRun) {
    if (user) {
      const [wallet] = await db
        .select({ balanceCents: wallets.balanceCents })
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      const balance = wallet?.balanceCents ?? 0;
      return c.json({
        dry_run: true,
        would_execute: capability.slug,
        price_cents: capability.priceCents,
        wallet_balance_cents: balance,
        wallet_sufficient: balance >= capability.priceCents,
      });
    }
    // Unauthenticated dry run (free-tier only)
    return c.json({
      dry_run: true,
      would_execute: capability.slug,
      price_cents: 0,
    });
  }

  // ── 5. Get the executor function ───────────────────────────────────────
  const executor = getExecutor(capability.slug);
  if (!executor) {
    return c.json(
      apiError(
        "capability_unavailable",
        `Capability '${capability.slug}' is registered but has no executor.`,
      ),
      503,
    );
  }

  // ── 5a. Dispatcher gate (Phase A0b). Every external invocation passes
  //         through the ALLOW_MATRIX before reaching the executor. This is
  //         a customer-paid path; the gate's null-row decision ALLOWS this
  //         context during the GRACE backfill window (preserves customer
  //         traffic for caps still awaiting cost_class classification).
  try {
    await assertGuardedAllow(capability.slug, {
      kind: "customer_paid",
      userId: user?.id ?? null,
      transactionId: null,
    });
  } catch (err) {
    if (err instanceof CapabilityInvocationRefusedError) {
      return c.json(apiError("capability_unavailable", err.message), 503);
    }
    if (err instanceof CapabilityNotClassifiedError) {
      // customer_paid + null is ALLOW per ALLOW_MATRIX — this branch is
      // defensive; if it fires the matrix has been tampered with.
      logError("dispatcher-gate-unexpected-null-refusal", err, { slug: capability.slug });
      return c.json(apiError("capability_unavailable", err.message), 503);
    }
    if (err instanceof BudgetExhaustedError) {
      // customer_paid never budget-checks; defensive.
      return c.json(apiError("capability_unavailable", err.message), 503);
    }
    throw err;
  }

  // ── 5b. Circuit breaker check ──────────────────────────────────────────
  const circuitCheck = await checkCircuitBreaker(capability.slug);
  if (!circuitCheck.allowed) {
    return c.json(
      apiError(
        "capability_unavailable",
        circuitCheck.reason ?? `Capability '${capability.slug}' is temporarily suspended.`,
        {
          circuit_state: circuitCheck.state,
          next_retry_at: circuitCheck.next_retry_at ?? null,
        },
      ),
      503,
    );
  }

  // ── 5c. SQS quality gate retired (DEC-20260503-B): no platform-floor SQS,
  //         no min_sqs threshold. Capability lifecycle/circuit-breaker still gate.

  // ── 5d. Freshness + latency pre-execution checks ──────────────────────
  const freshness = computeFreshnessGrade({
    freshnessCategory: capability.freshnessCategory,
    dataUpdateCycleDays: capability.dataUpdateCycleDays,
    datasetLastUpdated: capability.datasetLastUpdated,
  });

  // require_fresh: reject reference-data capabilities with stale data (grade C)
  if (requireFresh && freshness && freshness.category === "reference-data" && freshness.grade === "C") {
    return c.json(
      apiError(
        "freshness_check_failed",
        `Capability '${capability.slug}' has stale reference data. ${freshness.label}`,
        {
          freshness: {
            category: freshness.category,
            label: freshness.label,
            data_update_cycle_days: freshness.data_update_cycle_days ?? null,
            dataset_last_updated: freshness.dataset_last_updated ?? null,
          },
        },
      ),
      422,
    );
  }

  // max_latency_ms: check p95 latency against agent's threshold
  let qualityMetrics: Awaited<ReturnType<typeof getCapabilityQuality>> | null = null;
  if (maxLatencyMs !== undefined) {
    qualityMetrics = await getCapabilityQuality(capability.slug);
    if (qualityMetrics.p95ResponseTimeMs && qualityMetrics.p95ResponseTimeMs > maxLatencyMs) {
      return c.json(
        apiError(
          "latency_threshold_exceeded",
          `Capability '${capability.slug}' p95 latency (${qualityMetrics.p95ResponseTimeMs}ms) exceeds your threshold (${maxLatencyMs}ms).`,
          {
            p95_ms: qualityMetrics.p95ResponseTimeMs,
            max_latency_ms: maxLatencyMs,
          },
        ),
        422,
      );
    }
  }

  // ── 6. Decide execution path ─────────────────────────────────────────
  const executionInput = inputs ?? {};
  const outputSchema = (match.capability.outputSchema ?? {}) as Record<string, unknown>;

  // S-8: Validate inputs against capability's input_schema (required fields check)
  const inputSchema = (match.capability as any).inputSchema as { required?: string[]; properties?: Record<string, unknown> } | null;
  // Detect common mistake: passing the /v1/do body shape as "inputs"
  // e.g., {"capability_slug": "email-validate", "inputs": {"task": "email-validate"}}
  const DO_BODY_KEYS = new Set(["task", "capability_slug", "inputs", "max_price_cents", "dry_run"]);
  const confusedKeys = Object.keys(executionInput).filter((k) => DO_BODY_KEYS.has(k));
  if (confusedKeys.length > 0 && inputSchema?.properties) {
    const expectedFields = Object.keys(inputSchema.properties);
    const cIp = getClientIp(c);
    fireAndForget(
      () =>
        db.insert(failedRequests).values({
          userId: user?.id ?? null,
          ipHash: cIp !== "unknown" ? hashIp(cIp) : null,
          task: capabilitySlug ?? task ?? "",
          failureType: "input_confusion",
          errorDetail: `Confused keys: ${confusedKeys.join(", ")}. Expected: ${expectedFields.join(", ")}`,
          userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
        }),
      { label: "failed-request-log", context: { failureType: "input_confusion", userId: user?.id ?? null } },
    );
    return c.json(
      apiError(
        "invalid_request",
        `It looks like you passed the /v1/do request body as "inputs". The "inputs" field should contain the capability's parameters: { ${expectedFields.map((f) => `"${f}": ...`).join(", ")} }`,
        { fix: `Move the request envelope outside 'inputs' and send tool parameters in 'inputs': ${expectedFields.join(", ")}.`,
          confused_keys: confusedKeys,
          expected_fields: expectedFields,
          example: expectedFields.length > 0
            ? { [expectedFields[0]]: "your_value_here" }
            : undefined,
        },
      ),
      400,
    );
  }

  if (Array.isArray(inputSchema?.required) && inputSchema?.properties) {
    const missingFields = inputSchema.required.filter(
      (field) => !(field in executionInput) || executionInput[field] === undefined,
    );
    if (missingFields.length > 0) {
      // Detect common mistake: input fields placed at top level instead of inside "inputs"
      const topLevelMatches = missingFields.filter((f) => f in body);
      // Second common mistake: the value is sitting in the task text itself
      // ("validate this IBAN DE89…" with empty inputs — 2026-08-08 incident,
      // three retries never converged). Recover recognizable values so the
      // 400 shows the exact corrected call. Hint only, never auto-executed.
      const hint = topLevelMatches.length > 0
        ? ` It looks like you placed ${topLevelMatches.map((f) => `'${f}'`).join(", ")} at the top level — wrap them inside "inputs": { ${topLevelMatches.map((f) => `"${f}": ...`).join(", ")} }.`
        : recoveredValuesHint(recoverValuesFromTask(task, missingFields), executionInput);
      const fType = topLevelMatches.length > 0 ? "input_misplaced" : "missing_fields";
      const mIp = getClientIp(c);
      fireAndForget(
        () =>
          db.insert(failedRequests).values({
            userId: user?.id ?? null,
            ipHash: mIp !== "unknown" ? hashIp(mIp) : null,
            task: capabilitySlug ?? task ?? "",
            failureType: fType,
            errorDetail: `Missing: ${missingFields.join(", ")}`,
            userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
          }),
        { label: "failed-request-log", context: { failureType: fType, userId: user?.id ?? null } },
      );
      return c.json(
        apiError(
          "invalid_request",
          `Missing required input fields: ${missingFields.join(", ")}`,
          { fix: `Send the missing fields inside 'inputs': ${missingFields.join(", ")}.`,
            missing_fields: missingFields,
            expected_fields: Object.keys(inputSchema.properties),
            ...(hint ? { hint } : {}),
          },
        ),
        400,
      );
    }
  }

  // anyOf/oneOf required-group parity with the x402 surface (the PR #171
  // incident class): the classic check above cannot see branch groups, so an
  // either/or capability declared via anyOf was unvalidated on the wallet
  // path and leaked its executor's raw error. Reuses the same pure validator
  // both x402 handlers use — one contract, two surfaces. The classic-required
  // path above is deliberately untouched (its misplacement hints and
  // failure-type analytics are established behavior); this only adds the
  // group rule that path cannot express.
  // Only schemas that DECLARE branch groups enter this check — running the
  // full validator unconditionally would re-execute the classic-required rule
  // with stricter blank semantics ("" / null counted as missing), silently
  // changing established behavior and mislabeling those failures as
  // group-unsatisfied (review M-2). Classic required stays the block above's
  // job, verbatim.
  const declaresGroups =
    Array.isArray((inputSchema as Record<string, unknown> | null)?.anyOf) ||
    Array.isArray((inputSchema as Record<string, unknown> | null)?.oneOf);
  if (declaresGroups) {
    const groupCheck = validateX402Input(executionInput, inputSchema as Record<string, unknown> | null);
    if (!groupCheck.ok) {
      // Same value-in-task recovery as the classic-required path: an
      // either/or capability (url-or-domain etc.) whose caller sent {} but
      // named the target in the task gets a retry-ready hint. Only fields
      // that would actually satisfy the unsatisfied group are considered —
      // never unrelated optional properties.
      const groupRecovered = recoverValuesFromTask(
        task,
        unsatisfiedGroupFields(inputSchema as Record<string, unknown> | null, executionInput),
      );
      const groupHint = recoveredValuesHint(groupRecovered, executionInput);
      const gIp = getClientIp(c);
      fireAndForget(
        () =>
          db.insert(failedRequests).values({
            userId: user?.id ?? null,
            ipHash: gIp !== "unknown" ? hashIp(gIp) : null,
            task: capabilitySlug ?? task ?? "",
            failureType: "input_group_unsatisfied",
            errorDetail: groupCheck.error.slice(0, 255),
            userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
          }),
        { label: "failed-request-log", context: { failureType: "input_group_unsatisfied", userId: user?.id ?? null } },
      );
      return c.json(
        apiError(
          "invalid_request",
          groupCheck.error,
          { fix: `Send 'inputs' satisfying the required field group: ${groupCheck.error}.`,
            expected_fields: inputSchema?.properties ? Object.keys(inputSchema.properties) : [],
            input_schema: inputSchema ?? undefined,
            ...(groupHint ? { hint: groupHint } : {}),
          },
        ),
        400,
      );
    }
  }

  // x402 paid: on-chain settlement already verified — execute like free-tier (no wallet debit)
  if (!user && (c.get("x402_paid"))) {
    return executeFreeTier({ c, db, capability, executor, executionInput, outputSchema, freshness });
  }

  // Free-tier or progressively unlocked: enforce monthly allowance (DB-based, restart-safe)
  const reqCtxForUnlock = c.get("requestContext");
  const isUnlockedForIp = !user && !isFreeTier && reqCtxForUnlock?.ipHash
    ? isUnlocked(reqCtxForUnlock.ipHash, capability.slug)
    : false;

  if (!user && (isFreeTier || isUnlockedForIp)) {
    const refusal = await enforceFreeTierAllowance(c, db);
    if (refusal) return refusal;

    return executeFreeTier({ c, db, capability, executor, executionInput, outputSchema, freshness });
  }

  // Anonymous, and the capability that answered is not free.
  //
  // Reached only by the task-based caller: the x402-paid, free-tier and
  // progressive-unlock branches above have all been taken, so `!user` here
  // means an unauthenticated request that matched something we charge for.
  // Without this the request fell into executeSync with `user` null and the
  // wallet read threw — HTTP 500 to an arriving agent, for five months.
  if (!user) {
    return anonymousPaidRefusal(c, db, capability);
  }

  // Free-tier with auth: skip wallet operations but still record transaction
  if (user && isFreeTier) {
    return executeFreeTierAuthenticated({ c, db, user, capability, executor, executionInput, idempotencyKey, idempotencyFingerprint, outputSchema, freshness });
  }

  // Paid execution: sync or async (DEC-22)
  const isAsync = shouldExecuteAsync(capability.avgLatencyMs);
  if (isAsync) {
    return executeAsync({ c, db, user, capability, executor, executionInput, idempotencyKey, idempotencyFingerprint, outputSchema, freshness, callbackUrl });
  } else {
    return executeSync({ c, db, user, capability, executor, executionInput, idempotencyKey, idempotencyFingerprint, outputSchema, freshness, timeoutMs: timeoutSeconds * 1000 });
  }
});


// Preserve existing test/public seams while their implementations live with the dispatch code.
export { buildUsageSummaryForUserForTest } from "../lib/do/dispatch.js";
export { spendCapWouldExceed } from "../lib/do/idempotency.js";
