import { Hono } from "hono";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  wallets,
  walletTransactions,
  transactions,
  failedRequests,
} from "../db/schema.js";
import { checkMilestone } from "../lib/milestones.js";
import { optionalAuthMiddleware } from "../lib/middleware.js";
import { rateLimitByKey, rateLimitFreeTierByIp } from "../lib/rate-limit.js";
import { matchCapability } from "../lib/matching.js";
import { getExecutor } from "../capabilities/index.js";
import { apiError } from "../lib/errors.js";
import {
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
} from "../lib/circuit-breaker.js";
import { recordQuality } from "../lib/quality-capture.js";
import { getTestResultsForSlug } from "../lib/trust-helpers.js";
import { recordPiggybackResult } from "../lib/piggyback-monitor.js";
import { computeCapabilitySQS } from "../lib/sqs.js";
import type { AppEnv } from "../types.js";

const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_PRICE_CAP_CENTS = 2000; // €20 absolute cap per request

// DEC-22: Capabilities with avg latency above this threshold execute async
const ASYNC_THRESHOLD_MS = 10_000;

export const doRoute = new Hono<AppEnv>();

// POST /v1/do — Core endpoint: execute a capability
// DEC-21: 10 req/sec per API key (authenticated), 10/day per IP (free-tier)
doRoute.post(
  "/do",
  optionalAuthMiddleware,
  rateLimitByKey(10, 1000),         // applies only if user is set
  rateLimitFreeTierByIp(10),        // applies only if user is NOT set
  async (c) => {
  const user = c.get("user") as any | undefined;
  const db = getDb();

  // ── 1. Parse and validate request ──────────────────────────────────────
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      apiError("invalid_request", "Request body is required."),
      400,
    );
  }

  const task: string | undefined = body.task;
  const capabilitySlug: string | undefined = body.capability_slug;
  const inputs: Record<string, unknown> | undefined = body.inputs;
  const maxPriceCents: number | undefined = body.max_price_cents;
  const timeoutSeconds: number = Math.min(
    body.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS,
    MAX_TIMEOUT_SECONDS,
  );
  const dryRun: boolean = body.dry_run === true;
  const minSqs: number | undefined =
    typeof body.min_sqs === "number" && body.min_sqs >= 0 && body.min_sqs <= 100
      ? Math.round(body.min_sqs)
      : undefined;

  if (!task && !capabilitySlug) {
    return c.json(
      apiError(
        "invalid_request",
        "Either 'task' or 'capability_slug' is required.",
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
          "'max_price_cents' is required and must be a positive integer.",
        ),
        400,
      );
    }

    if (maxPriceCents > MAX_PRICE_CAP_CENTS) {
      return c.json(
        apiError(
          "invalid_request",
          `'max_price_cents' cannot exceed ${MAX_PRICE_CAP_CENTS} (€${MAX_PRICE_CAP_CENTS / 100}).`,
          { max_allowed: MAX_PRICE_CAP_CENTS },
        ),
        400,
      );
    }
  }

  // For unauthenticated requests, default to 0 (free-tier only)
  const effectiveMaxPrice = maxPriceCents ?? 0;

  // ── 2. Idempotency check (authenticated only) ─────────────────────────
  const idempotencyKey = c.req.header("Idempotency-Key") || null;

  if (idempotencyKey && user) {
    const [existing] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      const [wallet] = await db
        .select({ balanceCents: wallets.balanceCents })
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      return c.json({
        transaction_id: existing.id,
        status: existing.status,
        capability_used: capabilitySlug ?? null,
        price_cents: existing.priceCents,
        latency_ms: existing.latencyMs,
        wallet_balance_cents: wallet?.balanceCents ?? 0,
        output: existing.output,
        provenance: existing.provenance,
      });
    }
  }

  // ── 3. Match capability ────────────────────────────────────────────────
  const match = await matchCapability({
    task,
    capabilitySlug,
    category: body.category,
    maxPriceCents: effectiveMaxPrice,
  });

  if (!match) {
    // Log the failed request for demand analysis (DEC-20260225-P-c5d6)
    if (user) {
      await db.insert(failedRequests).values({
        userId: user.id,
        task: task ?? capabilitySlug ?? "",
        category: body.category ?? null,
        maxPriceCents: effectiveMaxPrice,
      });
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

  // ── 3a. Auth gate: unauthenticated users can only use free-tier ──────
  if (!user && !isFreeTier) {
    return c.json(
      apiError(
        "unauthorized",
        "Authentication required. Free-tier capabilities (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate) are available without signup.",
      ),
      401,
    );
  }

  // ── 3b. Hourly spend cap check (DEC-21) — authenticated only ────────────
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
        ...(isFreeTier ? { free_tier: true } : {}),
      });
    }
    // Unauthenticated dry run (free-tier only)
    return c.json({
      dry_run: true,
      would_execute: capability.slug,
      price_cents: 0,
      free_tier: true,
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

  // ── 5c. SQS quality gate ──────────────────────────────────────────────
  const PLATFORM_FLOOR_SQS = 25;
  const sqs = await computeCapabilitySQS(capability.slug);

  if (!sqs.pending && sqs.score < PLATFORM_FLOOR_SQS) {
    return c.json(
      apiError(
        "capability_degraded",
        `Capability '${capability.slug}' is currently degraded (SQS ${sqs.score}/100). Execution refused.`,
        { sqs_score: sqs.score, sqs_label: sqs.label },
      ),
      503,
    );
  }

  if (minSqs !== undefined && !sqs.pending && sqs.score < minSqs) {
    return c.json(
      apiError(
        "below_quality_threshold",
        `Capability '${capability.slug}' SQS (${sqs.score}) is below your threshold (${minSqs}).`,
        { sqs_score: sqs.score, sqs_label: sqs.label, min_sqs: minSqs },
      ),
      422,
    );
  }

  // ── 6. Decide execution path ─────────────────────────────────────────
  const executionInput = inputs ?? { task };
  const outputSchema = (match.capability.outputSchema ?? {}) as Record<string, unknown>;

  // Free-tier without auth: lightweight execution (no wallet, no transaction record)
  if (!user && isFreeTier) {
    return executeFreeTier(c, capability, executor, executionInput, outputSchema, sqs);
  }

  // Free-tier with auth: skip wallet operations but still record transaction
  if (user && isFreeTier) {
    return executeFreeTierAuthenticated(c, db, user, capability, executor, executionInput, idempotencyKey, outputSchema, sqs);
  }

  // Paid execution: sync or async (DEC-22)
  const isAsync = (capability.avgLatencyMs ?? 0) > ASYNC_THRESHOLD_MS;
  if (isAsync) {
    return executeAsync(c, db, user, capability, executor, executionInput, idempotencyKey, outputSchema);
  } else {
    return executeSync(c, db, user, capability, executor, executionInput, idempotencyKey, outputSchema);
  }
});

// ─── Free-tier execution: unauthenticated, no wallet, no transaction ────────

async function executeFreeTier(
  c: any,
  capability: { id: string; slug: string; priceCents: number },
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  sqs: { score: number; label: string; trend: string; pending: boolean },
) {
  const startTime = Date.now();

  try {
    const capResult = await executor(executionInput);
    const latencyMs = Date.now() - startTime;

    // Record circuit breaker + quality (fire-and-forget)
    recordSuccess(capability.slug).catch(() => {});
    recordQuality({
      transactionId: crypto.randomUUID(),
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    if (capResult.output) {
      recordPiggybackResult(
        capability.slug, capResult.output, outputSchema, latencyMs,
      ).catch(() => {});
    }

    return c.json({
      status: "completed",
      capability_used: capability.slug,
      price_cents: 0,
      latency_ms: latencyMs,
      output: capResult.output,
      provenance: capResult.provenance,
      free_tier: true,
      quality: {
        sqs: sqs.score,
        label: sqs.label,
        trend: sqs.trend,
      },
      upgrade_hint: "This capability is free. Sign up for API key access to 233+ capabilities at strale.dev/signup",
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    recordFailure(capability.slug).catch(() => {});
    recordQuality({
      transactionId: crypto.randomUUID(),
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });

    return c.json(
      apiError(
        "execution_failed",
        "The capability failed to execute.",
        { error: errorMessage },
      ),
      500,
    );
  }
}

// ─── Free-tier execution: authenticated, no wallet debit ────────────────────

async function executeFreeTierAuthenticated(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: { id: string; slug: string; priceCents: number },
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
  outputSchema: Record<string, unknown>,
  sqs: { score: number; label: string; trend: string; pending: boolean },
) {
  const startTime = Date.now();
  const marker = getTransparencyMarker(capability.slug);

  // Create transaction record (for usage history), but no wallet lock/debit
  const [txnRecord] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      capabilityId: capability.id,
      idempotencyKey,
      status: "executing",
      input: executionInput,
      priceCents: 0,
      transparencyMarker: marker,
      dataJurisdiction: "EU",
    })
    .returning({ id: transactions.id });

  try {
    const capResult = await executor(executionInput);
    const latencyMs = Date.now() - startTime;

    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        auditTrail: {
          executor: capability.slug,
          execution_mode: "sync",
          free_tier: true,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          latency_ms: latencyMs,
        },
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, txnRecord.id));

    // Record circuit breaker + quality (fire-and-forget)
    recordSuccess(capability.slug).catch(() => {});
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    if (capResult.output) {
      recordPiggybackResult(
        capability.slug, capResult.output, outputSchema, latencyMs,
      ).catch(() => {});
    }

    // Get wallet balance for response
    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return c.json({
      transaction_id: txnRecord.id,
      status: "completed",
      capability_used: capability.slug,
      price_cents: 0,
      latency_ms: latencyMs,
      wallet_balance_cents: wallet?.balanceCents ?? 0,
      output: capResult.output,
      provenance: capResult.provenance,
      free_tier: true,
      quality: {
        sqs: sqs.score,
        label: sqs.label,
        trend: sqs.trend,
      },
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(transactions)
      .set({
        status: "failed",
        error: errorMessage,
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, txnRecord.id));

    recordFailure(capability.slug).catch(() => {});
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });

    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return c.json(
      apiError(
        "execution_failed",
        "The capability failed to execute. You were not charged.",
        {
          transaction_id: txnRecord.id,
          error: errorMessage,
          wallet_balance_cents: wallet?.balanceCents ?? 0,
        },
      ),
      500,
    );
  }
}

// ─── Sync execution: lock → execute → debit on success (DEC-14) ────────────

async function executeSync(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: { id: string; slug: string; priceCents: number },
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
  outputSchema: Record<string, unknown>,
) {
  const startTime = Date.now();

  type TxResult =
    | {
        ok: true;
        transactionId: string;
        output: unknown;
        provenance: unknown;
        latencyMs: number;
        balanceAfter: number;
      }
    | {
        ok: false;
        errorCode: "insufficient_balance";
        balance: number;
        required: number;
      }
    | {
        ok: false;
        errorCode: "execution_failed";
        error: string;
        transactionId: string;
        balanceAfter: number;
      };

  const result: TxResult = await db.transaction(async (tx) => {
    // Lock wallet row
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .for("update");

    if (!wallet || wallet.balanceCents < capability.priceCents) {
      return {
        ok: false as const,
        errorCode: "insufficient_balance" as const,
        balance: wallet?.balanceCents ?? 0,
        required: capability.priceCents,
      };
    }

    // Determine transparency marker based on capability type
    const marker = getTransparencyMarker(capability.slug);

    // Create transaction record as "executing"
    const [txnRecord] = await tx
      .insert(transactions)
      .values({
        userId: user.id,
        capabilityId: capability.id,
        idempotencyKey,
        status: "executing",
        input: executionInput,
        priceCents: capability.priceCents,
        transparencyMarker: marker,
        dataJurisdiction: "EU",
      })
      .returning({ id: transactions.id });

    // Execute the capability
    try {
      const capResult = await executor(executionInput);
      const latencyMs = Date.now() - startTime;

      // Deduct from wallet
      const newBalance = wallet.balanceCents - capability.priceCents;
      await tx
        .update(wallets)
        .set({ balanceCents: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));

      // Log wallet transaction
      await tx.insert(walletTransactions).values({
        walletId: wallet.id,
        amountCents: -capability.priceCents,
        type: "purchase",
        referenceId: txnRecord.id,
        description: `Capability: ${capability.slug}`,
      });

      // Mark transaction completed with audit trail
      await tx
        .update(transactions)
        .set({
          status: "completed",
          output: capResult.output,
          provenance: capResult.provenance,
          auditTrail: {
            executor: capability.slug,
            execution_mode: "sync",
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
            latency_ms: latencyMs,
          },
          latencyMs,
          completedAt: new Date(),
        })
        .where(eq(transactions.id, txnRecord.id));

      return {
        ok: true as const,
        transactionId: txnRecord.id,
        output: capResult.output,
        provenance: capResult.provenance,
        latencyMs,
        balanceAfter: newBalance,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);

      // Mark transaction failed — no charge (wallet not debited)
      await tx
        .update(transactions)
        .set({
          status: "failed",
          error: errorMessage,
          latencyMs,
          completedAt: new Date(),
        })
        .where(eq(transactions.id, txnRecord.id));

      return {
        ok: false as const,
        errorCode: "execution_failed" as const,
        error: errorMessage,
        transactionId: txnRecord.id,
        balanceAfter: wallet.balanceCents, // unchanged — no charge on failure
      };
    }
  });

  // ── Record circuit breaker + quality + piggyback (fire-and-forget) ───
  if (result.ok) {
    recordSuccess(capability.slug).catch(() => {});
    recordQuality({
      transactionId: result.transactionId,
      responseTimeMs: result.latencyMs,
      output: result.output,
      outputSchema,
    });
    // Piggyback monitoring: validate output and record as test data point
    if (result.output) {
      recordPiggybackResult(
        capability.slug,
        result.output,
        outputSchema,
        result.latencyMs,
      ).catch(() => {});
    }
    // Check transaction milestones (fire-and-forget)
    db.execute(
      sql`SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
    )
      .then((res: any) => {
        const rows = Array.isArray(res) ? res : res?.rows ?? [];
        checkMilestone(Number(rows[0]?.count ?? 0));
      })
      .catch(() => {});
  } else if (result.errorCode === "execution_failed") {
    recordFailure(capability.slug).catch(() => {});
    recordQuality({
      transactionId: result.transactionId,
      responseTimeMs: Date.now() - startTime,
      output: null,
      outputSchema,
      error: result.error,
    });
  }

  // ── Return response ───────────────────────────────────────────────────
  if (!result.ok && result.errorCode === "insufficient_balance") {
    return c.json(
      apiError(
        "insufficient_balance",
        `Your wallet has €${(result.balance / 100).toFixed(2)} but this capability costs €${(result.required / 100).toFixed(2)}.`,
        {
          wallet_balance_cents: result.balance,
          required_cents: result.required,
          topup_url: "/v1/wallet/topup",
        },
      ),
      402,
    );
  }

  if (!result.ok && result.errorCode === "execution_failed") {
    return c.json(
      apiError(
        "execution_failed",
        "The capability failed to execute. You were not charged.",
        {
          transaction_id: result.transactionId,
          error: result.error,
          wallet_balance_cents: result.balanceAfter,
        },
      ),
      500,
    );
  }

  // Look up quality data for the capability (non-blocking, best-effort)
  let qualityStatus: "healthy" | "degraded" | "unhealthy" | "unknown" = "unknown";
  let qualityPassRate: number | null = null;
  try {
    const testData = await getTestResultsForSlug(capability.slug);
    qualityPassRate = testData.pass_rate;
    if (qualityPassRate === null || testData.total_tests === 0) {
      qualityStatus = "unknown";
    } else if (qualityPassRate >= 95) {
      qualityStatus = "healthy";
    } else if (qualityPassRate >= 80) {
      qualityStatus = "degraded";
    } else {
      qualityStatus = "unhealthy";
    }
  } catch {
    // Quality lookup failure should never block the response
  }

  // Success
  return c.json({
    transaction_id: result.transactionId,
    status: "completed",
    capability_used: capability.slug,
    price_cents: capability.priceCents,
    latency_ms: result.latencyMs,
    wallet_balance_cents: result.balanceAfter,
    output: result.output,
    provenance: result.provenance,
    quality_status: qualityStatus,
    quality_pass_rate: qualityPassRate,
  });
}

// TODO: Partial results for multi-step solution execution
// When solutions execute as a pipeline (e.g., company-due-diligence = 5 capability calls),
// each step should record its output independently so that:
// 1. GET /v1/transactions/:id can return partial_output with completed steps
// 2. If step 3/5 fails, steps 1-2 results are still available to the caller
// 3. The caller is charged only for steps that succeeded (pro-rata pricing)
// 4. The response includes a `steps` array with per-step status, output, and latency
// This requires: solution-aware execution in /v1/do (currently solutions are
// client-orchestrated as separate /v1/do calls per step).

// ─── Async execution: debit upfront → 202 → background → refund on failure ──

async function executeAsync(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: { id: string; slug: string; priceCents: number },
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
  outputSchema: Record<string, unknown>,
) {
  // Short DB tx: lock wallet → check balance → debit → create record → commit
  type SetupResult =
    | {
        ok: true;
        transactionId: string;
        walletId: string;
        balanceAfter: number;
      }
    | {
        ok: false;
        errorCode: "insufficient_balance";
        balance: number;
        required: number;
      };

  const setupResult: SetupResult = await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .for("update");

    if (!wallet || wallet.balanceCents < capability.priceCents) {
      return {
        ok: false as const,
        errorCode: "insufficient_balance" as const,
        balance: wallet?.balanceCents ?? 0,
        required: capability.priceCents,
      };
    }

    // Optimistic debit — refunded if execution fails
    const newBalance = wallet.balanceCents - capability.priceCents;
    await tx
      .update(wallets)
      .set({ balanceCents: newBalance, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    // Create transaction record
    const marker = getTransparencyMarker(capability.slug);
    const [txnRecord] = await tx
      .insert(transactions)
      .values({
        userId: user.id,
        capabilityId: capability.id,
        idempotencyKey,
        status: "executing",
        input: executionInput,
        priceCents: capability.priceCents,
        transparencyMarker: marker,
        dataJurisdiction: "EU",
      })
      .returning({ id: transactions.id });

    // Log wallet transaction (purchase)
    await tx.insert(walletTransactions).values({
      walletId: wallet.id,
      amountCents: -capability.priceCents,
      type: "purchase",
      referenceId: txnRecord.id,
      description: `Capability: ${capability.slug}`,
    });

    return {
      ok: true as const,
      transactionId: txnRecord.id,
      walletId: wallet.id,
      balanceAfter: newBalance,
    };
  });

  if (!setupResult.ok) {
    return c.json(
      apiError(
        "insufficient_balance",
        `Your wallet has €${(setupResult.balance / 100).toFixed(2)} but this capability costs €${(setupResult.required / 100).toFixed(2)}.`,
        {
          wallet_balance_cents: setupResult.balance,
          required_cents: setupResult.required,
          topup_url: "/v1/wallet/topup",
        },
      ),
      402,
    );
  }

  const { transactionId, walletId, balanceAfter } = setupResult;
  const startTime = Date.now();

  // Fire-and-forget: execute in background, update DB when done
  executeInBackground(
    db,
    executor,
    executionInput,
    transactionId,
    walletId,
    capability,
    startTime,
    outputSchema,
  ).catch((err) => {
    // Last-resort error logging — should not normally reach here
    console.error(
      `[async-exec] Unhandled error for txn ${transactionId}:`,
      err,
    );
  });

  // Return 202 immediately — client polls GET /v1/transactions/:id
  return c.json(
    {
      transaction_id: transactionId,
      status: "executing",
      capability_used: capability.slug,
      price_cents: capability.priceCents,
      wallet_balance_cents: balanceAfter,
    },
    202,
  );
}

async function executeInBackground(
  db: ReturnType<typeof getDb>,
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  transactionId: string,
  walletId: string,
  capability: { id: string; slug: string; priceCents: number },
  startTime: number,
  outputSchema: Record<string, unknown>,
) {
  try {
    const capResult = await executor(executionInput);
    const latencyMs = Date.now() - startTime;

    // Success: update transaction record with audit trail
    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        auditTrail: {
          executor: capability.slug,
          execution_mode: "async",
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          latency_ms: latencyMs,
        },
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    // Record success for circuit breaker + quality + piggyback
    await recordSuccess(capability.slug).catch(() => {});
    recordQuality({
      transactionId,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    // Piggyback monitoring
    if (capResult.output) {
      recordPiggybackResult(
        capability.slug,
        capResult.output,
        outputSchema,
        latencyMs,
      ).catch(() => {});
    }

    // Check transaction milestones (fire-and-forget)
    db.execute(
      sql`SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
    )
      .then((res: any) => {
        const rows = Array.isArray(res) ? res : res?.rows ?? [];
        checkMilestone(Number(rows[0]?.count ?? 0));
      })
      .catch(() => {});
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);

    // Failure: refund wallet + update transaction in a single tx
    await db.transaction(async (tx) => {
      // Refund the optimistic debit
      await tx
        .update(wallets)
        .set({
          balanceCents: (
            await tx
              .select({ b: wallets.balanceCents })
              .from(wallets)
              .where(eq(wallets.id, walletId))
          )[0].b + capability.priceCents,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, walletId));

      // Log refund
      await tx.insert(walletTransactions).values({
        walletId,
        amountCents: capability.priceCents,
        type: "refund",
        referenceId: transactionId,
        description: `Refund: ${capability.slug} execution failed`,
      });

      // Mark transaction failed
      await tx
        .update(transactions)
        .set({
          status: "failed",
          error: errorMessage,
          latencyMs,
          completedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));
    });

    // Record failure for circuit breaker + quality
    await recordFailure(capability.slug).catch(() => {});
    recordQuality({
      transactionId,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });
  }
}

// ─── EU AI Act transparency markers (DEC-20260226-P-s3t4) ─────────────────────
// 'ai_generated' = uses LLM, 'algorithmic' = pure logic, 'hybrid' = both
const ALGORITHMIC_CAPABILITIES = new Set([
  "vat-validate",
  "iban-validate",
  "swift-validate",
  "vat-format-validate",
  "isbn-validate",
  "company-id-detect",
  "email-validate",
  "exchange-rate",
  "dns-lookup",
  "ssl-check",
  "json-to-csv",
  "currency-convert",
  "url-to-text",
  "link-extract",
  "meta-extract",
  "name-parse",
  "phone-normalize",
  "date-parse",
  "unit-convert",
  "csv-clean",
  "deduplicate",
  "json-repair",
  "markdown-to-html",
  "image-resize",
  "base64-encode-url",
  "json-schema-validate",
  "url-health-check",
  "cron-explain",
  "diff-json",
  "api-health-check",
  // Batch 3 algorithmic capabilities
  "llm-output-validate",
  "timezone-meeting-find",
  "startup-domain-check",
  "dependency-audit",
  "accessibility-audit",
  // Batch 4 algorithmic capabilities
  "token-count",
  "tool-call-validate",
  "llm-cost-calculate",
  "schema-infer",
  "data-quality-check",
  "csv-to-json",
  "xml-to-json",
  "flatten-json",
  "secret-scan",
  "header-security-check",
  "password-strength",
  "gitignore-generate",
  // Batch 5 — developer workflow (algorithmic)
  "openapi-validate",
  "http-to-curl",
  "jwt-decode",
  "json-to-typescript",
  "json-to-zod",
  "json-to-pydantic",
  "log-parse",
  "uptime-check",
  // Batch 5 — external data (non-LLM)
  "uk-companies-house-officers",
  "charity-lookup-uk",
  "food-safety-rating-uk",
  "weather-lookup",
  "ip-geolocation",
  "shipping-track",
  "flight-status",
  "crypto-price",
  "port-check",
  "mx-lookup",
  "redirect-trace",
  "robots-txt-parse",
  "sitemap-parse",
  "github-user-profile",
  "npm-package-info",
  "pypi-package-info",
  "docker-hub-info",
  "github-repo-compare",
  "gdpr-website-check",
  "ssl-certificate-chain",
  "domain-reputation",
  // Batch 6 — Finance/fintech (algorithmic/API)
  "invoice-validate",
  "payment-reference-generate",
  "swift-message-parse",
  "financial-year-dates",
  "sepa-xml-validate",
  "bank-bic-lookup",
  "ecb-interest-rates",
  "ticker-lookup",
  "forex-history",
  "country-tax-rates",
  // Batch 6 — Legal/compliance (algorithmic)
  "eu-ai-act-classify",
  "data-protection-authority-lookup",
  // Batch 6 — Logistics/supply chain (algorithmic)
  "incoterms-explain",
  "port-lookup",
  "country-trade-data",
  "iso-country-lookup",
  "dangerous-goods-classify",
  // Batch 6 — Recruiting/HR (algorithmic/API)
  "job-board-search",
  "skill-extract",
  "skill-gap-analyze",
  "linkedin-url-validate",
  "work-permit-requirements",
  "public-holiday-lookup",
  "employment-cost-estimate",
  // Batch 6 — E-commerce/retail (algorithmic)
  "vat-rate-lookup",
  "shipping-cost-estimate",
  "marketplace-fee-calculate",
  // Batch 6 — Marketing/SEO (algorithmic/API)
  "keyword-suggest",
  "serp-analyze",
  "backlink-check",
  "page-speed-test",
  "social-profile-check",
  "og-image-check",
  "email-deliverability-check",
  "website-carbon-estimate",
  "barcode-lookup",
]);

function getTransparencyMarker(slug: string): string {
  if (ALGORITHMIC_CAPABILITIES.has(slug)) return "algorithmic";
  return "ai_generated";
}
