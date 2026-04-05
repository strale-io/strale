/**
 * POST /v1/solutions/:slug/execute — Execute a bundled solution.
 *
 * Authenticates the caller, looks up the solution, checks wallet balance,
 * debits the solution price, runs all steps via the shared solution executor,
 * and returns a two-tier {result, meta} response.
 *
 * Partial success (some steps failed) returns HTTP 200 with result.status = "partial".
 * Full failure (all steps failed) returns HTTP 200 with result.status = "failed"
 * and refunds the solution price to the caller's wallet.
 *
 * Part of DEC-20260405-A fix plan, phase 1.3.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutions, wallets, walletTransactions } from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { executeSolution } from "../lib/solution-executor.js";
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

    // ── 3. Price check ────────────────────────────────────────────────
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

    // ── 4. Wallet balance check + debit ───────────────────────────────
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .for("update");

    if (!wallet || wallet.balanceCents < sol.priceCents) {
      return c.json(
        apiError("insufficient_balance", `Your wallet has €${((wallet?.balanceCents ?? 0) / 100).toFixed(2)} but this solution costs €${(sol.priceCents / 100).toFixed(2)}.`, {
          wallet_balance_cents: wallet?.balanceCents ?? 0,
          required_cents: sol.priceCents,
          topup_url: "/v1/wallet/topup",
        }),
        402,
      );
    }

    // Debit upfront
    const balanceAfter = wallet.balanceCents - sol.priceCents;
    await db
      .update(wallets)
      .set({ balanceCents: balanceAfter, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    await db.insert(walletTransactions).values({
      walletId: wallet.id,
      amountCents: -sol.priceCents,
      type: "purchase",
      description: `Solution: ${sol.slug}`,
    });

    // ── 5. Execute ────────────────────────────────────────────────────
    const startTime = Date.now();
    let execResult;
    try {
      execResult = await executeSolution(sol.id, inputs as Record<string, unknown>);
    } catch (err) {
      // Full failure — refund
      await db
        .update(wallets)
        .set({ balanceCents: wallet.balanceCents, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));
      await db.insert(walletTransactions).values({
        walletId: wallet.id,
        amountCents: sol.priceCents,
        type: "refund",
        description: `Refund: ${sol.slug} (execution error)`,
      });

      const msg = err instanceof Error ? err.message : String(err);
      return c.json(
        apiError("execution_failed", "Solution execution failed. You were not charged.", {
          solution_slug: slug,
          error: msg.slice(0, 200),
          wallet_balance_cents: wallet.balanceCents,
        }),
        500,
      );
    }

    if (!execResult) {
      // No steps — refund
      await db
        .update(wallets)
        .set({ balanceCents: wallet.balanceCents, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));
      await db.insert(walletTransactions).values({
        walletId: wallet.id,
        amountCents: sol.priceCents,
        type: "refund",
        description: `Refund: ${sol.slug} (no steps configured)`,
      });

      return c.json(
        apiError("execution_failed", "Solution has no steps configured. You were not charged.", {
          solution_slug: slug,
          wallet_balance_cents: wallet.balanceCents,
        }),
        503,
      );
    }

    // ── 6. Determine status ───────────────────────────────────────────
    const totalSteps = execResult.step_count;
    const errorCount = execResult.errors.length;
    const successCount = totalSteps - errorCount;

    let status: "completed" | "partial" | "failed";
    if (errorCount === 0) {
      status = "completed";
    } else if (successCount > 0) {
      status = "partial";
    } else {
      status = "failed";
    }

    // Full failure — refund
    if (status === "failed") {
      await db
        .update(wallets)
        .set({ balanceCents: wallet.balanceCents, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));
      await db.insert(walletTransactions).values({
        walletId: wallet.id,
        amountCents: sol.priceCents,
        type: "refund",
        description: `Refund: ${sol.slug} (all steps failed)`,
      });
    }

    const finalBalance = status === "failed" ? wallet.balanceCents : balanceAfter;

    // ── 7. Build response ─────────────────────────────────────────────
    return c.json({
      result: {
        solution_slug: sol.slug,
        status,
        steps: execResult.steps,
        errors: execResult.errors.length > 0 ? execResult.errors : undefined,
        step_count: totalSteps,
        latency_ms: execResult.latency_ms,
        price_cents: status === "failed" ? 0 : sol.priceCents,
        wallet_balance_cents: finalBalance,
      },
      meta: {
        solution_used: sol.slug,
        price_cents: status === "failed" ? 0 : sol.priceCents,
        latency_ms: execResult.latency_ms,
        wallet_balance_cents: finalBalance,
        audit: {
          timestamp: new Date().toISOString(),
          solution: sol.slug,
          step_count: totalSteps,
          errors: errorCount,
          execution_mode: "sync",
          refunded: status === "failed",
        },
      },
    });
  },
);
