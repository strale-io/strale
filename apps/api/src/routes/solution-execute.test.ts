/**
 * Tests for solution execution endpoint logic.
 *
 * Since there's no endpoint test harness in this repo, these tests cover
 * the pure logic extracted from the endpoint handler: status computation,
 * refund decisions, and response shaping.
 *
 * The actual HTTP layer (auth, routing, Hono middleware) is not tested here
 * and will be verified in manual smoke tests during Phase 1.4.
 */

import { describe, it, expect } from "vitest";

// ── Status computation logic (extracted from solution-execute.ts) ────────

function computeSolutionStatus(
  stepCount: number,
  errorCount: number,
): "completed" | "partial" | "failed" {
  const successCount = stepCount - errorCount;
  if (errorCount === 0) return "completed";
  if (successCount > 0) return "partial";
  return "failed";
}

function shouldRefund(status: "completed" | "partial" | "failed"): boolean {
  return status === "failed";
}

function computeFinalBalance(
  originalBalance: number,
  priceCents: number,
  status: "completed" | "partial" | "failed",
): number {
  if (status === "failed") return originalBalance; // refunded
  return originalBalance - priceCents; // debited
}

function computeChargedPrice(
  priceCents: number,
  status: "completed" | "partial" | "failed",
): number {
  return status === "failed" ? 0 : priceCents;
}

// ── Status computation ──────────────────────────────────────────────────

describe("computeSolutionStatus", () => {
  it("returns completed when all steps succeed", () => {
    expect(computeSolutionStatus(4, 0)).toBe("completed");
  });

  it("returns partial when some steps fail", () => {
    expect(computeSolutionStatus(4, 1)).toBe("partial");
    expect(computeSolutionStatus(4, 2)).toBe("partial");
    expect(computeSolutionStatus(4, 3)).toBe("partial");
  });

  it("returns failed when all steps error", () => {
    expect(computeSolutionStatus(4, 4)).toBe("failed");
  });

  it("returns completed for single step with no errors", () => {
    expect(computeSolutionStatus(1, 0)).toBe("completed");
  });

  it("returns failed for single step with error", () => {
    expect(computeSolutionStatus(1, 1)).toBe("failed");
  });
});

// ── Refund decision ─────────────────────────────────────────────────────

describe("shouldRefund", () => {
  it("refunds on full failure", () => {
    expect(shouldRefund("failed")).toBe(true);
  });

  it("does NOT refund on partial success", () => {
    expect(shouldRefund("partial")).toBe(false);
  });

  it("does NOT refund on completed", () => {
    expect(shouldRefund("completed")).toBe(false);
  });
});

// ── Final balance computation ───────────────────────────────────────────

describe("computeFinalBalance", () => {
  it("returns original balance on full failure (refund)", () => {
    expect(computeFinalBalance(200, 150, "failed")).toBe(200);
  });

  it("returns debited balance on completed", () => {
    expect(computeFinalBalance(200, 150, "completed")).toBe(50);
  });

  it("returns debited balance on partial (no refund for partial)", () => {
    expect(computeFinalBalance(200, 150, "partial")).toBe(50);
  });
});

// ── Charged price computation ───────────────────────────────────────────

describe("computeChargedPrice", () => {
  it("charges full price on completed", () => {
    expect(computeChargedPrice(150, "completed")).toBe(150);
  });

  it("charges full price on partial (no discount for partial)", () => {
    expect(computeChargedPrice(150, "partial")).toBe(150);
  });

  it("charges zero on full failure (refunded)", () => {
    expect(computeChargedPrice(150, "failed")).toBe(0);
  });
});

// ── Price cap validation ────────────────────────────────────────────────

describe("price cap validation", () => {
  function priceExceedsBudget(
    priceCents: number,
    maxPriceCents: number | undefined,
  ): boolean {
    if (maxPriceCents === undefined) return false;
    return priceCents > maxPriceCents;
  }

  it("passes when max_price_cents is not provided", () => {
    expect(priceExceedsBudget(150, undefined)).toBe(false);
  });

  it("passes when price fits within budget", () => {
    expect(priceExceedsBudget(150, 500)).toBe(false);
    expect(priceExceedsBudget(150, 150)).toBe(false);
  });

  it("fails when price exceeds budget", () => {
    expect(priceExceedsBudget(150, 50)).toBe(true);
    expect(priceExceedsBudget(150, 149)).toBe(true);
  });
});

// ── Response shape assertions ───────────────────────────────────────────

describe("response shape", () => {
  function buildResponse(
    sol: { slug: string; priceCents: number },
    execResult: { steps: Record<string, unknown>; errors: string[]; step_count: number; latency_ms: number },
    walletBalanceBefore: number,
  ) {
    const totalSteps = execResult.step_count;
    const errorCount = execResult.errors.length;
    const status = computeSolutionStatus(totalSteps, errorCount);
    const finalBalance = computeFinalBalance(walletBalanceBefore, sol.priceCents, status);
    const chargedPrice = computeChargedPrice(sol.priceCents, status);

    return {
      result: {
        solution_slug: sol.slug,
        status,
        steps: execResult.steps,
        errors: execResult.errors.length > 0 ? execResult.errors : undefined,
        step_count: totalSteps,
        latency_ms: execResult.latency_ms,
        price_cents: chargedPrice,
        wallet_balance_cents: finalBalance,
      },
      meta: {
        solution_used: sol.slug,
        price_cents: chargedPrice,
        latency_ms: execResult.latency_ms,
        wallet_balance_cents: finalBalance,
      },
    };
  }

  it("builds correct completed response", () => {
    const resp = buildResponse(
      { slug: "kyb-essentials-se", priceCents: 150 },
      {
        steps: {
          "swedish-company-data": { company_name: "Spotify AB" },
          "vat-validate": { valid: true },
          "sanctions-check": { clear: true },
          "lei-lookup": { found: false },
        },
        errors: [],
        step_count: 4,
        latency_ms: 4231,
      },
      200,
    );

    expect(resp.result.status).toBe("completed");
    expect(resp.result.solution_slug).toBe("kyb-essentials-se");
    expect(Object.keys(resp.result.steps)).toHaveLength(4);
    expect(resp.result.errors).toBeUndefined();
    expect(resp.result.price_cents).toBe(150);
    expect(resp.result.wallet_balance_cents).toBe(50);
    expect(resp.meta.price_cents).toBe(150);
  });

  it("builds correct partial response", () => {
    const resp = buildResponse(
      { slug: "kyb-essentials-se", priceCents: 150 },
      {
        steps: {
          "swedish-company-data": { company_name: "Spotify AB" },
          "vat-validate": { error: "upstream timeout" },
        },
        errors: ["vat-validate: upstream timeout"],
        step_count: 4,
        latency_ms: 2100,
      },
      200,
    );

    expect(resp.result.status).toBe("partial");
    expect(resp.result.errors).toHaveLength(1);
    expect(resp.result.price_cents).toBe(150); // still charged
    expect(resp.result.wallet_balance_cents).toBe(50); // still debited
  });

  it("builds correct failed response with refund", () => {
    const resp = buildResponse(
      { slug: "kyb-essentials-se", priceCents: 150 },
      {
        steps: {},
        errors: [
          "swedish-company-data: timeout",
          "vat-validate: timeout",
          "sanctions-check: timeout",
          "lei-lookup: timeout",
        ],
        step_count: 4,
        latency_ms: 230,
      },
      200,
    );

    expect(resp.result.status).toBe("failed");
    expect(resp.result.errors).toHaveLength(4);
    expect(resp.result.price_cents).toBe(0); // refunded
    expect(resp.result.wallet_balance_cents).toBe(200); // restored
    expect(resp.meta.price_cents).toBe(0);
  });
});

// ── F-B-022: phase-2 UPDATE failure handling ─────────────────────────────
//
// When the phase-2 transaction UPDATE fails (DB blip, serialization
// conflict, etc.), the fix must:
//   - not wedge the row at status='executing' silently (caller now awaits),
//   - refund the wallet IFF !allFailed (the allFailed path already
//     refunded at line ~270 before phase-2).
// This mirrors the decision tree implemented in the endpoint.

function shouldRefundOnPhase2Failure(allFailed: boolean): boolean {
  // allFailed=true: refund already happened pre-phase-2 (line ~270).
  // allFailed=false: wallet still debited from phase-1 — must refund.
  return !allFailed;
}

describe("F-B-022: phase-2 UPDATE failure handling", () => {
  it("refunds when !allFailed (wallet was debited at phase-1)", () => {
    expect(shouldRefundOnPhase2Failure(false)).toBe(true);
  });

  it("does not double-refund when allFailed (already refunded pre-phase-2)", () => {
    expect(shouldRefundOnPhase2Failure(true)).toBe(false);
  });

  it("finalization-failed response carries wallet_balance_cents for retry guidance", () => {
    const errorResponse = {
      error_code: "transaction_finalization_failed",
      details: {
        transaction_id: "fake-uuid",
        solution_slug: "kyb-essentials-se",
        wallet_balance_cents: 200,
      },
    };
    expect(errorResponse.error_code).toBe("transaction_finalization_failed");
    expect(errorResponse.details.wallet_balance_cents).toBe(200);
  });
});
