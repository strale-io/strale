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

describe("suitesTestedFromResults (closing review round — heartbeat accounting)", () => {
  it("derives 'tested' from executed results, not batch arithmetic — the reviewer's exact trace", async () => {
    const { suitesTestedFromResults } = await import("./test-scheduler.js");
    // 4 duplicate suites, budget for 2: two execute (say both pass), the
    // runner internally skips two, the scheduler skips 3 later batch
    // entries. The OLD formula (batch 4 − outer skips 3) reported 1.
    // The truth is the number of results that exist: 2.
    expect(suitesTestedFromResults(2, 0)).toBe(2);
    expect(suitesTestedFromResults(1, 1)).toBe(2);
    expect(suitesTestedFromResults(0, 0)).toBe(0);
  });

  it("pollCycle's summary uses the results-derived helper, never batch subtraction", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./test-scheduler.ts", import.meta.url), "utf8");
    expect(src).toContain("suitesTestedFromResults(totalPassed, totalFailed)");
    expect(src).not.toMatch(/runnableSuites\.length\s*-\s*skippedBudgetExhausted/);
  });
});

describe("suite-scoped batch execution (HIGH-1, Codex 2026-08-18 review)", () => {
  // pollCycle() itself has no DB harness (raw postgres advisory-lock client,
  // live HTTP per capability, 5-10 minute cycles — test-harness exemption,
  // DEC-20260504-A), so this pins the wiring shape directly against source,
  // the same technique the block above uses for the heartbeat-accounting
  // fix. The behavioral proof that suiteId actually narrows execution (not
  // just that it's threaded through) lives in test-runner.test.ts's
  // "runTests — suiteId scoping" describe block, which mocks the DB layer
  // runTests() itself talks to.
  it("findOverdueSuites' SQL selects each suite's own id, not just (slug, testType)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./test-scheduler.ts", import.meta.url), "utf8");
    expect(src).toContain('ts.id::text AS "suiteId"');
  });

  it("the OverdueSuite type and its mapper carry suiteId through from the query", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./test-scheduler.ts", import.meta.url), "utf8");
    // Interface declares it (was slug/testType/lastRunAt only, pre-fix).
    expect(src).toMatch(/interface OverdueSuite \{[^}]*suiteId: string;[^}]*\}/s);
    // The row mapper actually populates it from the query result.
    expect(src).toMatch(/return resultRows\.map\(\(r: any\) => \(\{[^}]*suiteId: r\.suiteId,[^}]*\}\)\);/s);
  });

  it("pollCycle's runTests() call passes the specific overdue suite's id — the actual fix to the former N x N call site", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./test-scheduler.ts", import.meta.url), "utf8");
    // Pre-fix this call read exactly:
    //   runTests({ capabilitySlug: suite.slug, testType: suite.testType })
    // — no suite-level narrowing, so it reloaded every suite sharing that
    // (slug, testType) pair on every one of the batch's N due-suite rows.
    expect(src).toMatch(
      /runTests\(\{\s*capabilitySlug:\s*suite\.slug,\s*testType:\s*suite\.testType,\s*suiteId:\s*suite\.suiteId,?\s*\}\)/,
    );
  });
});
