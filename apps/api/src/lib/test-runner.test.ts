import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── HIGH-1 fix (2026-08-17 review): per-suite budget re-check ─────────────
//
// findOverdueSuites() / shouldSkipForBudget() (test-scheduler.ts) only guard
// the scheduler's call INTO runTests() — a single runTests({capabilitySlug,
// testType}) call reloads ALL test_suites rows matching that pair. danish-
// company-data has 4 duplicate known_answer suites; one runTests() call ran
// all 4, so the scheduler's once-per-batch pre-check couldn't stop suites 3
// and 4 from running straight into BudgetExhaustedError after suites 1 and 2
// spent the budget. This suite proves the fix at the layer that actually
// matters: runSingleTest() (private, exercised here via the public runTests()
// entry point) re-checks isBudgetExhausted() immediately before each suite
// that would reach the executor, and skips silently (no test_results row,
// no push into the run's results) once the counter reports exhausted.
//
// The DB layer is mocked; assertGuardedAllow/isBudgetExhausted are mocked
// (their own correctness has direct unit coverage in
// capabilities/guarded-executor.test.ts) so this suite is free to assert
// purely on the wiring: does runTests() call isBudgetExhausted() before each
// of the 4 duplicate suites, and does it write a test_results row only for
// the ones where it returned false?

const mockIsBudgetExhausted = vi.fn();
const mockAssertGuardedAllow = vi.fn();
vi.mock("../capabilities/guarded-executor.js", () => ({
  assertGuardedAllow: (...args: unknown[]) => mockAssertGuardedAllow(...args),
  isBudgetExhausted: (...args: unknown[]) => mockIsBudgetExhausted(...args),
  CapabilityInvocationRefusedError: class extends Error {},
  CapabilityNotClassifiedError: class extends Error {},
  BudgetExhaustedError: class extends Error {},
}));

const mockExecutor = vi.fn();
vi.mock("../capabilities/index.js", () => ({
  getExecutor: () => mockExecutor,
}));

const insertResultsCalls: unknown[] = [];
let suiteRows: unknown[] = [];
const mockDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => Promise.resolve(suiteRows),
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (vals: unknown) => {
      if (table === testResultsTable) insertResultsCalls.push(vals);
      return Promise.resolve(undefined);
    },
  }),
  update: () => ({
    set: () => ({
      where: () => Promise.resolve(undefined),
    }),
  }),
};
vi.mock("../db/index.js", () => ({ getDb: () => mockDb }));

import { testResults as testResultsTable } from "../db/schema.js";
import {
  shouldRecordTestEvidence,
  runTests,
} from "./test-runner.js";

function fakeSuiteRow(id: string) {
  return {
    suite: {
      id,
      capabilitySlug: "budget-test-cap",
      testType: "negative",
      testName: `duplicate-known-answer-${id}`,
      testMode: "live",
      input: {},
      validationRules: { checks: [] },
      baselineOutput: null,
      externalCostCents: 0,
      estimatedCostCents: 0,
      active: true,
      lastClassification: null,
    },
    fieldReliability: null,
    // "deterministic" avoids withRetry's real backoff delays — this test
    // is about the budget-skip wiring, not retry timing.
    capabilityType: "deterministic",
    outputSchema: null,
  };
}

describe("runTests — per-suite budget re-check (HIGH-1, 2026-08-17 review)", () => {
  beforeEach(() => {
    mockIsBudgetExhausted.mockReset();
    mockAssertGuardedAllow.mockReset().mockResolvedValue(undefined);
    mockExecutor.mockReset().mockRejectedValue(new Error("simulated executor error"));
    insertResultsCalls.length = 0;
    suiteRows = [
      fakeSuiteRow("suite-1"),
      fakeSuiteRow("suite-2"),
      fakeSuiteRow("suite-3"),
      fakeSuiteRow("suite-4"),
    ];
  });

  it("4 duplicate suites, budget for 2 → exactly 2 test_results rows, 2 silent skips, 0 BudgetExhausted rows", async () => {
    // isBudgetExhausted mirrors what the REAL counter would report after
    // the first two suites' assertGuardedAllow calls (mocked here, but in
    // production that's assertBudgetAvailable's atomic increment) spend
    // the daily budget_cap=2: available for suite 1 and 2, exhausted for
    // suite 3 and 4 — all within this ONE runTests() call.
    mockIsBudgetExhausted
      .mockResolvedValueOnce(false) // suite-1: budget available
      .mockResolvedValueOnce(false) // suite-2: budget available
      .mockResolvedValueOnce(true)  // suite-3: exhausted — must skip
      .mockResolvedValueOnce(true); // suite-4: exhausted — must skip

    const summary = await runTests({ capabilitySlug: "budget-test-cap", testType: "negative" });

    // isBudgetExhausted was consulted once per suite — the actual fix.
    expect(mockIsBudgetExhausted).toHaveBeenCalledTimes(4);

    // Only the first 2 suites ever reached the executor.
    expect(mockExecutor).toHaveBeenCalledTimes(2);

    // Only 2 test_results rows were written — the 2 skipped suites wrote
    // NOTHING (no row at all, not even a failed/BudgetExhausted one).
    expect(insertResultsCalls).toHaveLength(2);

    // None of the 2 written rows carry a BudgetExhausted failure —
    // negative-test-type + thrown executor error is a PASS by design
    // (validateResult's early return), proving the 2 that ran did so
    // via the real executor path, not a swallowed budget refusal.
    for (const row of insertResultsCalls as Array<{ passed: boolean; failureReason: string | null }>) {
      expect(row.passed).toBe(true);
      expect(row.failureReason).toBeNull();
    }

    // The run summary only counts the 2 that actually ran — the 2 skips
    // are invisible to the summary, matching "no test_results row,
    // log-only" (same shape as the pre-existing unconfigured/unhealthy
    // skip categories a few lines above this check in test-runner.ts).
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
  });

  it("budget available for all 4 → all 4 run, isBudgetExhausted still consulted per suite", async () => {
    mockIsBudgetExhausted.mockResolvedValue(false);

    const summary = await runTests({ capabilitySlug: "budget-test-cap", testType: "negative" });

    expect(mockIsBudgetExhausted).toHaveBeenCalledTimes(4);
    expect(mockExecutor).toHaveBeenCalledTimes(4);
    expect(insertResultsCalls).toHaveLength(4);
    expect(summary.total).toBe(4);
  });
});

// Phase 3 Harden Fix A regression tests. The Phase 2 incident
// (memo: docs/research/2026-05-07-dk-phase2-understand.md on branch
// investigation/dk-phase-2-understand) traced a false breaker recovery
// to an edge_case test "passing" via a thrown CVR quota error. The gate
// now requires known_answer + executionError===null.

describe("shouldRecordTestEvidence — Phase 3 Fix A", () => {
  it("returns true for known_answer that genuinely passed with no execution error", () => {
    expect(shouldRecordTestEvidence(true, "known_answer", null)).toBe(true);
  });

  it("returns false for edge_case even when validateResult marked passed=true", () => {
    // The DK incident: edge_case "CVR with leading zeros" threw the CVR
    // quota error, validateResult returned passed=true (any error is
    // edge_case-acceptable), the old gate fired recordTestEvidence, and the
    // breaker walked open → half_open → closed via test-runner false signal.
    expect(shouldRecordTestEvidence(true, "edge_case", null)).toBe(false);
    expect(
      shouldRecordTestEvidence(
        true,
        "edge_case",
        "The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.",
      ),
    ).toBe(false);
  });

  it("returns false for known_answer when execution threw — defensive guard against future validateResult quirks", () => {
    expect(
      shouldRecordTestEvidence(true, "known_answer", "any thrown error string"),
    ).toBe(false);
  });

  it("returns false for known_answer that did not pass", () => {
    expect(shouldRecordTestEvidence(false, "known_answer", null)).toBe(false);
    expect(shouldRecordTestEvidence(false, "known_answer", "some error")).toBe(false);
  });

  it("returns false for non-known_answer test types regardless of pass state", () => {
    for (const testType of [
      "schema_check",
      "negative",
      "dependency_health",
      "regression",
      "known_bad",
      "piggyback",
    ]) {
      expect(shouldRecordTestEvidence(true, testType, null)).toBe(false);
      expect(shouldRecordTestEvidence(false, testType, null)).toBe(false);
    }
  });
});

// Fix B — feeding test failures into the circuit breaker — is deliberately
// not implemented; see the note at its former call site in test-runner.ts and
// platform-refusal-breaker.test.ts for the guard that would be required if it
// is ever revisited.

