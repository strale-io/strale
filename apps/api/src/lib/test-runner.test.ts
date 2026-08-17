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

// Recursively walks a composed drizzle `and(eq(...), eq(...))` condition
// object for embedded bind values (`Param` instances), the same technique
// do.spend-cap.test.ts uses for raw sql`` tags — here applied to the
// query-builder's `.where(and(...))` shape, where interpolated values are
// wrapped one level deeper (SQL -> Param) than a raw tagged template.
// Used both to assert the built condition really carries a suiteId filter
// AND (in the mock `.where()` below) to make the mock behave like a real
// DB: return only the row(s) matching that id when one is present.
function findParams(node: unknown, acc: unknown[], depth = 0): void {
  if (depth > 20 || node == null || typeof node !== "object") return;
  const ctorName = (node as { constructor?: { name?: string } }).constructor?.name;
  if (ctorName === "Param") {
    acc.push((node as { value: unknown }).value);
    return;
  }
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    for (const c of chunks) findParams(c, acc, depth + 1);
  }
}

const insertResultsCalls: unknown[] = [];
let suiteRows: Array<{ suite: { id: string } }> = [];
const whereCalls: unknown[] = [];
const mockDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: (condition: unknown) => {
          whereCalls.push(condition);
          // Mirror real Postgres behavior: if the composed condition
          // carries a bind value matching one of our fake suite ids, only
          // that row would ever come back from the actual `test_suites`
          // table. Suite-id-agnostic callers (no suiteId passed) see every
          // row, exactly as before this fix — the pre-existing
          // (capabilitySlug, testType) behavior is untouched.
          const params: unknown[] = [];
          findParams(condition, params);
          const matchingIds = suiteRows
            .map((r) => r.suite.id)
            .filter((id) => params.includes(id));
          const filtered =
            matchingIds.length > 0
              ? suiteRows.filter((r) => matchingIds.includes(r.suite.id))
              : suiteRows;
          return Promise.resolve(filtered);
        },
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
    whereCalls.length = 0;
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

// ─── Suite-scoped execution (Codex review, 2026-08-18) ──────────────────────
//
// HIGH-1: findOverdueSuites() (test-scheduler.ts) emits one row per due
// SUITE, but the scheduler used to call runTests({capabilitySlug, testType})
// per row without narrowing to that specific suite — and runTests() with
// only (capabilitySlug, testType) reloads and re-executes EVERY active
// suite sharing that pair. With N same-type suites all due in one poll
// cycle, that produced N x N executions per cadence (danish-company-data's
// 4 duplicate known_answer suites: a 4-entry batch ran 16 executions against
// a 100/day budget — the exact quadratic blowup this section proves fixed).
//
// The fix is TestRunOptions.suiteId: an additive filter that, when present,
// narrows the query to exactly one test_suites row. These tests prove two
// things at the layer that actually matters (the built SQL condition + the
// suites that get executed), not just the scheduler's call-site shape:
//   1. passing suiteId narrows execution to exactly that suite, even when
//      3 siblings sharing (capabilitySlug, testType) are also due.
//   2. omitting suiteId is unchanged — every existing (slug[, testType])
//      caller (manual-test-rerun.ts, event-triggers.ts, internal-tests.ts
//      route) still gets every matching suite, so this is additive, not a
//      breaking narrowing of default behavior.
//   3. the danish-4-duplicate scenario, run the way the scheduler now runs
//      it (one runTests() call per overdue suite, suiteId set each time),
//      does exactly 4 executions for 4 due suites — linear, not 16.
describe("runTests — suiteId scoping (HIGH-1, Codex 2026-08-18 review)", () => {
  beforeEach(() => {
    mockIsBudgetExhausted.mockReset();
    mockAssertGuardedAllow.mockReset().mockResolvedValue(undefined);
    mockExecutor.mockReset().mockRejectedValue(new Error("simulated executor error"));
    insertResultsCalls.length = 0;
    whereCalls.length = 0;
    suiteRows = [
      fakeSuiteRow("suite-1"),
      fakeSuiteRow("suite-2"),
      fakeSuiteRow("suite-3"),
      fakeSuiteRow("suite-4"),
    ];
  });

  it("passing suiteId narrows the built WHERE condition to that suite's id", async () => {
    mockIsBudgetExhausted.mockResolvedValue(false);

    await runTests({ capabilitySlug: "budget-test-cap", testType: "negative", suiteId: "suite-2" });

    expect(whereCalls).toHaveLength(1);
    const params: unknown[] = [];
    findParams(whereCalls[0], params);
    expect(params).toContain("suite-2");
  });

  it("suiteId scopes execution to exactly that one suite, even with 3 due siblings sharing (slug, testType)", async () => {
    mockIsBudgetExhausted.mockResolvedValue(false);

    const summary = await runTests({
      capabilitySlug: "budget-test-cap",
      testType: "negative",
      suiteId: "suite-2",
    });

    // Only suite-2's executor call happened — not all 4.
    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(insertResultsCalls).toHaveLength(1);
    expect(summary.total).toBe(1);
  });

  it("omitting suiteId preserves the pre-fix (capabilitySlug, testType) behavior — every matching suite runs", async () => {
    mockIsBudgetExhausted.mockResolvedValue(false);

    const summary = await runTests({ capabilitySlug: "budget-test-cap", testType: "negative" });

    expect(mockExecutor).toHaveBeenCalledTimes(4);
    expect(insertResultsCalls).toHaveLength(4);
    expect(summary.total).toBe(4);

    // No id-scoping param was ever built for this call.
    const params: unknown[] = [];
    findParams(whereCalls[0], params);
    for (const row of suiteRows) expect(params).not.toContain(row.suite.id);
  });

  it("the danish-4-duplicate scenario becomes LINEAR: 4 overdue suites, one runTests() call each (as the fixed scheduler now does) → exactly 4 executions total, not 16", async () => {
    mockIsBudgetExhausted.mockResolvedValue(false);

    // Simulates pollCycle()'s for-loop: one runTests() call per overdue
    // suite row, each now carrying that row's own suiteId — the exact
    // fix to test-scheduler.ts's loop at (formerly) line 733.
    const overdueBatch = suiteRows.map((r) => r.suite.id);
    let totalExecuted = 0;
    for (const suiteId of overdueBatch) {
      mockExecutor.mockClear();
      const summary = await runTests({
        capabilitySlug: "budget-test-cap",
        testType: "negative",
        suiteId,
      });
      totalExecuted += summary.total;
    }

    expect(overdueBatch).toHaveLength(4);
    expect(totalExecuted).toBe(4); // linear: 4 due suites -> 4 executions
    // Pre-fix this would have been 16 (each of the 4 loop iterations
    // re-running all 4 suites) — asserting the exact pre-fix number here
    // as a named contrast, not just "not 16".
    expect(totalExecuted).not.toBe(4 * 4);
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

