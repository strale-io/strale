/**
 * POST /v1/solutions/:slug/execute — Execute a bundled solution.
 *
 * Two-phase transaction write matching /v1/do pattern:
 * 1. Insert transaction row at "executing" inside same DB transaction as wallet debit
 * 2. Update to "completed" or "failed" after executeSolution() returns
 *
 * Status vocabulary matches /v1/do: "completed" or "failed".
 * Partial successes (some steps failed, caller received value) map to "completed"
 * with per-step detail in audit_trail JSONB.
 *
 * Full failure refunds the wallet. Partial success does NOT refund.
 *
 * Part of DEC-20260405-A fix plan, phase 1.4.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutions, wallets, walletTransactions, transactions } from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { executeSolution } from "../lib/solution-executor.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { logError } from "../lib/log.js";
import type { AppEnv } from "../types.js";

export const solutionExecuteRoute = new Hono<AppEnv>();

solutionExecuteRoute.post(
  "/:slug/execute",
  authMiddleware,
  rateLimitByKey(10, 1000),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user");
    const db = getDb();

    c.get("log").info(
      { label: "solutions-execute-start", solution_slug: slug },
      "solutions-execute-start",
    );

    // ── 1. Parse request body ─────────────────────────────────────────
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json(apiError("invalid_request", "Request body is required."), 400);
    }

    const inputs = body.inputs;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      return c.json(
        apiError("invalid_request", "'inputs' is required and must be an object."),
        400,
      );
    }

    const maxPriceCents: number | undefined =
      typeof body.max_price_cents === "number" && body.max_price_cents > 0
        ? Math.round(body.max_price_cents)
        : undefined;

    // ── 2. Look up solution ───────────────────────────────────────────
    const [sol] = await db
      .select({
        id: solutions.id,
        slug: solutions.slug,
        name: solutions.name,
        priceCents: solutions.priceCents,
        isActive: solutions.isActive,
        transparencyTag: solutions.transparencyTag,
      })
      .from(solutions)
      .where(eq(solutions.slug, slug))
      .limit(1);

    if (!sol || !sol.isActive) {
      return c.json(
        apiError("not_found", `Solution '${slug}' not found.`),
        404,
      );
    }

    // ── 3. Price check (before wallet debit) ──────────────────────────
    if (maxPriceCents !== undefined && sol.priceCents > maxPriceCents) {
      return c.json(
        apiError("budget_exceeded", `Solution '${slug}' costs €${(sol.priceCents / 100).toFixed(2)} which exceeds your max_price_cents of ${maxPriceCents}.`, {
          solution_slug: slug,
          actual_price_cents: sol.priceCents,
          max_price_cents: maxPriceCents,
        }),
        402,
      );
    }

    // ── 4. Wallet debit + transaction insert (single DB transaction) ──
    const startTime = Date.now();
    let transactionId: string;
    let balanceAfter: number;
    let walletId: string;
    let walletBalanceBefore: number;

    try {
      const txResult = await db.transaction(async (tx) => {
        // Lock wallet row
        const [wallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, user.id))
          .for("update");

        if (!wallet || wallet.balanceCents < sol.priceCents) {
          return {
            ok: false as const,
            balance: wallet?.balanceCents ?? 0,
          };
        }

        // Debit wallet
        const newBalance = wallet.balanceCents - sol.priceCents;
        await tx
          .update(wallets)
          .set({ balanceCents: newBalance, updatedAt: new Date() })
          .where(eq(wallets.id, wallet.id));

        // Log wallet transaction
        await tx.insert(walletTransactions).values({
          walletId: wallet.id,
          amountCents: -sol.priceCents,
          type: "purchase",
          description: `Solution: ${sol.slug}`,
        });

        // Insert transaction row at "executing" — two-phase write per /v1/do pattern
        const [txnRecord] = await tx
          .insert(transactions)
          .values({
            userId: user.id,
            capabilityId: null,
            solutionSlug: sol.slug,
            status: "executing",
            input: inputs as Record<string, unknown>,
            priceCents: sol.priceCents,
            transparencyMarker: sol.transparencyTag ?? "mixed",
            dataJurisdiction: "EU",
            paymentMethod: "wallet",
          })
          .returning({ id: transactions.id });

        return {
          ok: true as const,
          transactionId: txnRecord.id,
          balanceAfter: newBalance,
          walletId: wallet.id,
          walletBalanceBefore: wallet.balanceCents,
        };
      });

      if (!txResult.ok) {
        return c.json(
          apiError("insufficient_balance", `Your wallet has €${(txResult.balance / 100).toFixed(2)} but this solution costs €${(sol.priceCents / 100).toFixed(2)}.`, {
            wallet_balance_cents: txResult.balance,
            required_cents: sol.priceCents,
            topup_url: "/v1/wallet/topup",
          }),
          402,
        );
      }

      transactionId = txResult.transactionId;
      balanceAfter = txResult.balanceAfter;
      walletId = txResult.walletId;
      walletBalanceBefore = txResult.walletBalanceBefore;
    } catch (err) {
      c.get("log").error(
        { label: "solutions-tx-insert-failed", solution_slug: slug, err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
        "solutions-tx-insert-failed",
      );
      return c.json(
        apiError("execution_failed", "Failed to process payment."),
        500,
      );
    }

    // ── 5. Execute solution steps ─────────────────────────────────────
    let execResult;
    try {
      execResult = await executeSolution(sol.id, inputs as Record<string, unknown>);
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      c.get("log").error(
        { label: "solutions-execute-error", solution_slug: slug, err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
        "solutions-execute-error",
      );

      // Update transaction to failed
      db.update(transactions)
        .set({
          status: "failed",
          error: sanitizeFailureReason(errorMessage),
          latencyMs,
          completedAt: new Date(),
          auditTrail: buildInlineAudit(slug, [], 0, 0, latencyMs, true, c),
        })
        .where(eq(transactions.id, transactionId))
        .catch((e) => c.get("log").error(
          { label: "solutions-tx-update-failed", transaction_id: transactionId, solution_slug: slug, err: e instanceof Error ? { message: e.message } : e },
          "solutions-tx-update-failed",
        ));

      // Refund
      await refundWallet(db, walletId, walletBalanceBefore, sol.priceCents, sol.slug, "execution error");

      return c.json(
        apiError("execution_failed", "Solution execution failed. You were not charged.", {
          transaction_id: transactionId,
          solution_slug: slug,
          error: sanitizeFailureReason(errorMessage),
          wallet_balance_cents: walletBalanceBefore,
        }),
        500,
      );
    }

    if (!execResult) {
      const latencyMs = Date.now() - startTime;

      db.update(transactions)
        .set({
          status: "failed",
          error: "Solution has no steps configured",
          latencyMs,
          completedAt: new Date(),
          auditTrail: buildInlineAudit(slug, [], 0, 0, latencyMs, true, c),
        })
        .where(eq(transactions.id, transactionId))
        .catch((e) => c.get("log").error(
          { label: "solutions-tx-update-failed", transaction_id: transactionId, solution_slug: slug, err: e instanceof Error ? { message: e.message } : e },
          "solutions-tx-update-failed",
        ));

      await refundWallet(db, walletId, walletBalanceBefore, sol.priceCents, sol.slug, "no steps configured");

      return c.json(
        apiError("execution_failed", "Solution has no steps configured. You were not charged.", {
          transaction_id: transactionId,
          solution_slug: slug,
          wallet_balance_cents: walletBalanceBefore,
        }),
        503,
      );
    }

    // ── 6. Determine status (matches /v1/do vocabulary) ───────────────
    const latencyMs = Date.now() - startTime;
    const totalSteps = execResult.step_count;
    const errorCount = execResult.errors.length;
    const stepsSucceeded = totalSteps - errorCount;
    const allFailed = stepsSucceeded === 0;

    // /v1/do vocabulary: "completed" or "failed". Partial success maps to "completed"
    // with per-step detail in audit_trail.
    const txStatus = allFailed ? "failed" : "completed";
    const chargedPrice = allFailed ? 0 : sol.priceCents;

    // Full failure — refund
    if (allFailed) {
      await refundWallet(db, walletId, walletBalanceBefore, sol.priceCents, sol.slug, "all steps failed");
    }

    const finalBalance = allFailed ? walletBalanceBefore : balanceAfter;

    // Build per-step audit breakdown with per-step latency
    const stepAuditEntries = Object.entries(execResult.steps).map(([capSlug, output], index) => {
      const isError = execResult.errors.some((e) => e.startsWith(`${capSlug}:`));
      const timing = execResult.stepTimings.find((t) => t.capabilitySlug === capSlug);
      return {
        index,
        capabilitySlug: capSlug,
        status: isError ? "failed" : "completed",
        latencyMs: timing?.latencyMs ?? 0,
        error: isError
          ? sanitizeFailureReason(execResult.errors.find((e) => e.startsWith(`${capSlug}:`))?.split(": ").slice(1).join(": ") ?? null)
          : null,
      };
    });

    // TODO: extract to buildFullSolutionAudit() once the shape stabilizes
    // across multiple solution executions in production. See DEC-20260405-B.
    const auditTrail = buildInlineAudit(
      slug, stepAuditEntries, stepsSucceeded, errorCount, latencyMs, allFailed, c,
    );

    // ── 7. Update transaction row (phase 2 of two-phase write) ────────
    db.update(transactions)
      .set({
        status: txStatus,
        output: execResult.steps,
        latencyMs,
        completedAt: new Date(),
        priceCents: chargedPrice,
        auditTrail,
      })
      .where(eq(transactions.id, transactionId))
      .catch((e) => c.get("log").error(
        { label: "solutions-tx-update-failed", transaction_id: transactionId, solution_slug: slug, err: e instanceof Error ? { message: e.message } : e },
        "solutions-tx-update-failed",
      ));

    c.get("log").info(
      {
        label: "solutions-execute-done",
        solution_slug: slug,
        status: txStatus,
        latency_ms: latencyMs,
        steps_succeeded: stepsSucceeded,
        steps_failed: errorCount,
        transaction_id: transactionId,
      },
      "solutions-execute-done",
    );

    // ── 8. Build response ─────────────────────────────────────────────
    // result.status uses the richer vocabulary for the caller:
    // "completed" (all ok), "partial" (some failed), "failed" (all failed)
    const responseStatus = allFailed ? "failed" : (errorCount > 0 ? "partial" : "completed");

    return c.json({
      result: {
        transaction_id: transactionId,
        solution_slug: sol.slug,
        status: responseStatus,
        steps: execResult.steps,
        errors: execResult.errors.length > 0 ? execResult.errors : undefined,
        step_count: totalSteps,
        latency_ms: latencyMs,
        price_cents: chargedPrice,
        wallet_balance_cents: finalBalance,
      },
      meta: {
        solution_used: sol.slug,
        price_cents: chargedPrice,
        latency_ms: latencyMs,
        wallet_balance_cents: finalBalance,
        audit: auditTrail,
      },
    });
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refundWallet(
  db: ReturnType<typeof getDb>,
  walletId: string,
  originalBalance: number,
  priceCents: number,
  solutionSlug: string,
  reason: string,
): Promise<void> {
  try {
    await db
      .update(wallets)
      .set({ balanceCents: originalBalance, updatedAt: new Date() })
      .where(eq(wallets.id, walletId));
    await db.insert(walletTransactions).values({
      walletId,
      amountCents: priceCents,
      type: "refund",
      description: `Refund: ${solutionSlug} (${reason})`,
    });
  } catch (err) {
    logError("solutions-refund-failed", err, { solution_slug: solutionSlug, wallet_id: walletId });
  }
}

function buildInlineAudit(
  solutionSlug: string,
  steps: Array<{ index: number; capabilitySlug: string; status: string; latencyMs: number; error: string | null }>,
  stepsSucceeded: number,
  stepsFailed: number,
  totalLatencyMs: number,
  refunded: boolean,
  c: any,
): Record<string, unknown> {
  // TODO: extract to buildFullSolutionAudit() once the shape stabilizes
  // across multiple solution executions in production. See DEC-20260405-B.
  return {
    requestContext: {
      userAgent: c.req.header("user-agent") ?? null,
      referer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      origin: c.req.header("origin") ?? null,
      timestamp: new Date().toISOString(),
    },
    solutionSlug,
    steps,
    stepsSucceeded,
    stepsFailed,
    totalLatencyMs,
    refunded,
  };
}
