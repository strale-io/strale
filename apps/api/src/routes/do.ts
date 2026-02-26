import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  wallets,
  walletTransactions,
  transactions,
  failedRequests,
} from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { matchCapability } from "../lib/matching.js";
import { getExecutor } from "../capabilities/index.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_PRICE_CAP_CENTS = 2000; // €20 absolute cap per request

// DEC-22: Capabilities with avg latency above this threshold execute async
const ASYNC_THRESHOLD_MS = 10_000;

export const doRoute = new Hono<AppEnv>();

// POST /v1/do — Core endpoint: execute a capability
doRoute.post("/do", authMiddleware, async (c) => {
  const user = c.get("user");
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

  if (!task && !capabilitySlug) {
    return c.json(
      apiError(
        "invalid_request",
        "Either 'task' or 'capability_slug' is required.",
      ),
      400,
    );
  }

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

  // ── 2. Idempotency check ───────────────────────────────────────────────
  const idempotencyKey = c.req.header("Idempotency-Key") || null;

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      // Return the cached result without re-executing or re-charging
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
    maxPriceCents,
  });

  if (!match) {
    // Log the failed request for demand analysis (DEC-20260225-P-c5d6)
    await db.insert(failedRequests).values({
      userId: user.id,
      task: task ?? capabilitySlug ?? "",
      category: body.category ?? null,
      maxPriceCents,
    });

    return c.json(
      apiError(
        "no_matching_capability",
        "No capability found matching your request within budget.",
        {
          task,
          capability_slug: capabilitySlug,
          max_price_cents: maxPriceCents,
        },
      ),
      404,
    );
  }

  const capability = match.capability;

  // ── 4. Dry run — return what would execute without charging ────────────
  if (dryRun) {
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

  // ── 6. Decide sync vs async (DEC-22) ──────────────────────────────────
  const isAsync = (capability.avgLatencyMs ?? 0) > ASYNC_THRESHOLD_MS;
  const executionInput = inputs ?? { task };

  if (isAsync) {
    return executeAsync(c, db, user, capability, executor, executionInput, idempotencyKey);
  } else {
    return executeSync(c, db, user, capability, executor, executionInput, idempotencyKey);
  }
});

// ─── Sync execution: lock → execute → debit on success (DEC-14) ────────────

async function executeSync(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: { id: string; slug: string; priceCents: number },
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
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

      // Mark transaction completed
      await tx
        .update(transactions)
        .set({
          status: "completed",
          output: capResult.output,
          provenance: capResult.provenance,
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
  });
}

// ─── Async execution: debit upfront → 202 → background → refund on failure ──

async function executeAsync(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: { id: string; slug: string; priceCents: number },
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
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
    const [txnRecord] = await tx
      .insert(transactions)
      .values({
        userId: user.id,
        capabilityId: capability.id,
        idempotencyKey,
        status: "executing",
        input: executionInput,
        priceCents: capability.priceCents,
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
) {
  try {
    const capResult = await executor(executionInput);
    const latencyMs = Date.now() - startTime;

    // Success: update transaction record
    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));
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
  }
}
