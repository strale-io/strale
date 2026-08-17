/**
 * Regression tests for the scheduler's mid-batch budget skip (Phase-4 tail
 * fix, 2026-08-17).
 *
 * `findOverdueSuites()`'s SQL exclusion (in this same file) already keeps
 * budget-exhausted capabilities out of a poll cycle's batch — but only as a
 * snapshot taken once at the start of the cycle. Confirmed live against
 * prod (read-only query): danish-company-data has 4 duplicate
 * `known_answer` test suites whose per-suite stagger hash
 * (`hashtext(slug || ':' || test_type)`) collides on the identical minute
 * (same slug, same test_type string). The snapshot query said "budget
 * available" and returned all of that capability's suites in one batch; the
 * scheduler's sequential for-loop then spent the daily budget_cap=2 on the
 * first couple of suites and ran the rest straight into
 * `assertBudgetAvailable`'s `BudgetExhaustedError` — 15 of 17 attempts in
 * 24h, all 9 seconds apart in a single burst, each one a FAILED
 * `test_results` row poisoning pass-rate metrics.
 *
 * `shouldSkipForBudget()` is the fix: a per-suite re-check, called
 * immediately before the `runTests()` call that would otherwise run to a
 * guaranteed failure. These tests pin its two outcomes (skip vs proceed)
 * and its fail-open behavior when the peek itself errors — a peek failure
 * must never block real testing.
 *
 * No DB harness exists for test-scheduler.ts's pollCycle (raw postgres
 * client for the advisory lock, live HTTP calls per capability, 5-10 minute
 * cycles) — test-harness exemption, DEC-20260504-A. `shouldSkipForBudget`
 * is extracted specifically so the new code path is unit-testable without
 * that machinery; the wiring point (this function called inside pollCycle's
 * for-loop, `continue`-ing before any `runTests()` call — i.e. no
 * `test_results` row) is verified by reading test-scheduler.ts directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsBudgetExhausted = vi.fn();
vi.mock("../capabilities/guarded-executor.js", () => ({
  isBudgetExhausted: (slug: string) => mockIsBudgetExhausted(slug),
}));

import { shouldSkipForBudget } from "./test-scheduler.js";

beforeEach(() => {
  mockIsBudgetExhausted.mockReset();
});

describe("shouldSkipForBudget (Phase-4 tail fix)", () => {
  it("skips (returns true) when the capability's budget is exhausted", async () => {
    mockIsBudgetExhausted.mockResolvedValueOnce(true);
    await expect(shouldSkipForBudget("danish-company-data")).resolves.toBe(true);
    expect(mockIsBudgetExhausted).toHaveBeenCalledWith("danish-company-data");
  });

  it("does not skip (returns false) when budget is available", async () => {
    mockIsBudgetExhausted.mockResolvedValueOnce(false);
    await expect(shouldSkipForBudget("danish-company-data")).resolves.toBe(false);
  });

  it("fails open (returns false, does not throw) when the peek itself errors", async () => {
    mockIsBudgetExhausted.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(shouldSkipForBudget("danish-company-data")).resolves.toBe(false);
  });
});
