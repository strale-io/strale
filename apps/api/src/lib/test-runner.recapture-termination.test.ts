/**
 * Regression test for the "unbounded recapture" finding (Codex closing-pass
 * review, round 2, re-verified and corrected round 3, 2026-08-18).
 *
 * Round 1 closed the counter/cap mechanism (recordFixtureRecaptureFailure,
 * MAX_FIXTURE_RECAPTURE_FAILURES) but the closure table's own caveat was
 * accurate: reaching the cap only quarantined the suite, which
 * minRetestIntervalHours floors at a 168h (weekly) dispatch cadence — a
 * real reduction, but "reduced to weekly" is not "terminates". A direct
 * `runTests({suiteId})` call (admin trigger, manual re-run, or simply
 * waiting a week) still reached the executor with no cap on how many times
 * it could keep failing.
 *
 * Round 2 added a runtime refusal gate in `runSingleTest`: once quarantined
 * specifically for exhausted fixture-recapture attempts (identified by
 * `FIXTURE_RECAPTURE_QUARANTINE_MARKER` on `quarantine_reason`), the suite
 * refuses to attempt ANY further live call, unconditionally, regardless of
 * dispatch cadence or caller — until a human resets `test_status`.
 *
 * Round 3 correction (coordinator, re-reading the property): the
 * requirement is **BOUNDED**, not "exactly 3". A permanently-failing
 * recapture must stop consuming Browserless calls after a finite, small
 * number of attempts; whether that number is `MAX_FIXTURE_RECAPTURE_FAILURES`
 * (3) or `MAX_FIXTURE_RECAPTURE_FAILURES * 2` (6, once `withRetry`'s single
 * internal retry is counted) is immaterial — unbounded is the only
 * unacceptable outcome. This file's assertions are phrased that way: "at
 * most cap × 2 executor calls across N sequential runTests() calls, and
 * ZERO calls once the quarantine marker has landed" — not a specific count.
 * `capabilityType: "stable_api"` is used deliberately (not "deterministic",
 * which was the round-2 version's dodge) so `withRetry`'s real single-retry
 * path is genuinely exercised: `shouldRetry = capType !== "deterministic"`
 * in test-runner.ts, so a "deterministic" capability type never calls
 * `withRetry` at all and the round-2 test never actually covered it.
 *
 * This test drives the full `runTests()` -> `runSingleTest()` path (not
 * just the extracted helper functions test-runner.fixture-lifecycle.test.ts
 * covers) against a fixture-mode suite whose executor ALWAYS fails with a
 * retryable error, calling `runTests()` 4 times in sequence — simulating 4
 * consecutive scheduled dispatches.
 *
 * Standalone-run requirement (Codex round 3, blocking): this file failed
 * standalone (`npx vitest run <this file>` alone) — the canary-mode case
 * hung to the default test timeout because `runSingleTest`'s post-failure
 * self-heal/auto-remediation/upstream-escalation machinery (all STATIC
 * imports in test-runner.ts, real modules unless mocked) ran for real: in
 * particular `self-heal.ts`'s `attemptRemediation` AWAITS
 * `runDependencyHealthChecks()`, which makes real `fetch()` calls to real
 * external providers (observed in logs: etherscan, serper) with their own
 * multi-second timeouts. It only "passed" in a batch run because an
 * earlier sibling test file's `vi.mock("./self-heal.js", ...)` (or similar)
 * happened to already be registered in the same worker and leaked in — a
 * test that passes only in company is worse than no test. Every module
 * `runSingleTest` reaches synchronously after a failure is now mocked
 * below so this file is self-sufficient and deterministic standalone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockAssertGuardedAllow = vi.fn();
const mockIsBudgetExhausted = vi.fn();
vi.mock("../capabilities/guarded-executor.js", () => ({
  assertGuardedAllow: (...args: unknown[]) => mockAssertGuardedAllow(...args),
  isBudgetExhausted: (...args: unknown[]) => mockIsBudgetExhausted(...args),
  CapabilityInvocationRefusedError: class extends Error {},
  CapabilityNotClassifiedError: class extends Error {},
  BudgetExhaustedError: class extends Error {},
}));

let executorCallCount = 0;
let mockExecutorImpl: (() => Promise<unknown>) | null = null;
vi.mock("../capabilities/index.js", () => ({
  getExecutor: () => mockExecutorImpl,
}));

// runSingleTest's pre-flight skips (unconfigured credentials, unhealthy
// upstream) run BEFORE the executor is ever reached — must be neutralized
// so this test actually exercises the recapture-cap/quarantine gate rather
// than being skipped upstream of it every time.
vi.mock("./credential-health.js", () => ({
  getUnconfiguredCapabilities: () => new Set<string>(),
}));
vi.mock("./upstream-health-gate.js", () => ({
  findUnhealthyUpstream: () => null,
  refreshUpstreamMapping: () => Promise.resolve(),
  isCacheExpired: () => false,
}));

// ── Round-3 standalone-hang fix ──────────────────────────────────────────
// Every module runSingleTest reaches SYNCHRONOUSLY (statically imported in
// test-runner.ts) after a failing attempt, so it's on the critical path of
// the `await runTests(...)` calls below and must never be allowed to do
// real work (DB queries, and — the actual hang — real network fetches via
// self-heal's dependency-health check).
vi.mock("./self-heal.js", () => ({
  attemptRemediation: () =>
    Promise.resolve({
      testName: "mock",
      classification: "unknown",
      outcome: "monitoring",
      action: "none",
      detail: "mocked — no real remediation attempted",
    }),
  buildRunSummary: () => ({}),
  formatRunSummary: () => "",
}));
vi.mock("./auto-remediation.js", () => ({
  analyzeAndRemediate: () => Promise.resolve([]),
  applyRemediation: () => Promise.resolve(undefined),
}));
vi.mock("./upstream-tracker.js", () => ({
  checkUpstreamEscalation: () => Promise.resolve(undefined),
}));
vi.mock("./health-monitor.js", () => ({
  logHealthEvent: () => Promise.resolve(undefined),
}));
vi.mock("./meta-monitoring.js", () => ({
  checkNewFailures: () => Promise.resolve({ passed: true, details: "mocked" }),
  checkInfrastructureHealth: () => Promise.resolve({ passed: true, details: "mocked" }),
}));

interface SuiteRow {
  id: string;
  capabilitySlug: string;
  testName: string;
  testType: string;
  input: Record<string, unknown>;
  validationRules: { checks: unknown[] };
  active: boolean;
  testMode: string;
  baselineOutput: unknown;
  baselineCapturedAt: Date | null;
  updatedAt: Date | null;
  fixtureLastRefreshed: Date | null;
  fixtureRecaptureFailures: number;
  testStatus: string;
  quarantineReason: string | null;
  externalCostCents: number;
  lastClassification: unknown;
  estimatedCostCents: number;
}

let suite: SuiteRow;
const insertedResults: Array<Record<string, unknown>> = [];

function isSqlIncrement(value: unknown): boolean {
  // The real code does `sql\`${testSuites.fixtureRecaptureFailures} + 1\``,
  // which drizzle's `sql` tag turns into a SQL object (has queryChunks),
  // never a plain number. Detect "not a primitive" as "this is the
  // increment expression" — good enough for this single-suite mock.
  return typeof value === "object" && value !== null;
}

const mockDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => Promise.resolve([
          {
            suite,
            fieldReliability: null,
            // "stable_api", not "deterministic" (Codex round 3): must
            // actually exercise withRetry's real single-retry path —
            // shouldRetry = capType !== "deterministic" in test-runner.ts.
            capabilityType: "stable_api",
            outputSchema: null,
          },
        ]),
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (vals: Record<string, unknown>) => {
      // Fire-and-forget paths elsewhere in runTests() (recordTestQuality's
      // transactions/transactionQuality inserts, health-event logging, etc.)
      // share this same getDb() mock — only test_results inserts are this
      // test's concern, so filter by table identity, same convention as
      // test-runner.test.ts's mockDb.
      if (table === testResultsTable) insertedResults.push(vals);
      return Promise.resolve(undefined);
    },
  }),
  update: (_table: unknown) => ({
    set: (setArgs: Record<string, unknown>) => ({
      where: (_whereArg: unknown) => {
        for (const [key, value] of Object.entries(setArgs)) {
          if (key === "fixtureRecaptureFailures" && isSqlIncrement(value)) {
            suite.fixtureRecaptureFailures += 1;
          } else {
            (suite as unknown as Record<string, unknown>)[key] = value;
          }
        }
        return {
          then: (resolve: (v: undefined) => void) => resolve(undefined),
          returning: (_shape: unknown) => Promise.resolve([{ count: suite.fixtureRecaptureFailures }]),
        };
      },
    }),
  }),
};
vi.mock("../db/index.js", () => ({ getDb: () => mockDb }));

import { runTests, MAX_FIXTURE_RECAPTURE_FAILURES } from "./test-runner.js";
import { testResults as testResultsTable } from "../db/schema.js";

beforeEach(() => {
  executorCallCount = 0;
  insertedResults.length = 0;
  mockAssertGuardedAllow.mockReset().mockResolvedValue(undefined);
  mockIsBudgetExhausted.mockReset().mockResolvedValue(false);
  // ETIMEDOUT matches retry.ts's DEFAULT_RETRYABLE list — withRetry's real
  // single-retry branch actually fires (round-3 fix: round 2's message
  // "upstream permanently broken (simulated)" matched NO retryable pattern,
  // so withRetry never retried regardless of capabilityType — the
  // "deterministic dodge" wasn't the only thing suppressing retries).
  mockExecutorImpl = () => {
    executorCallCount++;
    return Promise.reject(new Error("ETIMEDOUT: upstream permanently broken (simulated)"));
  };

  suite = {
    id: "suite-recapture-termination",
    capabilitySlug: "screenshot-url",
    testName: "known_answer",
    testType: "known_answer",
    input: {},
    validationRules: { checks: [] },
    active: true,
    testMode: "fixture",
    baselineOutput: null, // no baseline yet -> every call is a recapture attempt
    baselineCapturedAt: null,
    updatedAt: new Date(),
    fixtureLastRefreshed: null,
    fixtureRecaptureFailures: 0,
    testStatus: "normal",
    quarantineReason: null,
    externalCostCents: 0,
    lastClassification: null,
    estimatedCostCents: 0,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Run `runTests()` while flushing withRetry's real setTimeout-based backoff
 * with fake timers, so the retry path executes for real (both the initial
 * attempt and the retry actually call the mocked executor) without the
 * test burning multiple real seconds of wall-clock delay per call.
 */
async function runTestsFlushingRetryDelay(): Promise<void> {
  vi.useFakeTimers();
  try {
    const promise = runTests({
      capabilitySlug: suite.capabilitySlug,
      testType: suite.testType,
      suiteId: suite.id,
    });
    // withRetry's delay is baseDelayMs(2000) * 2^0 + up to 20% jitter for a
    // single retry (maxRetries: 1) — 5s covers it with headroom.
    await vi.advanceTimersByTimeAsync(5000);
    await promise;
  } finally {
    vi.useRealTimers();
  }
}

describe("unbounded-recapture is now BOUNDED (Codex review, round 2 fix + round 3 correction)", () => {
  it("bounds total live executor calls to at most cap×2 across 4 sequential runs, and ZERO once quarantined — with withRetry's real retry path active", async () => {
    // Attempts 1..MAX_FIXTURE_RECAPTURE_FAILURES: each is one runSingleTest
    // invocation. withRetry (maxRetries: 1) means EACH invocation can call
    // the executor up to twice (initial + one retry) since our mock always
    // rejects with a retryable error.
    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES; i++) {
      await runTestsFlushingRetryDelay();
      expect(suite.fixtureRecaptureFailures).toBe(i + 1);
    }
    expect(suite.testStatus).toBe("quarantined");
    expect(suite.quarantineReason).toMatch(/fixture_recapture_exhausted:/);
    const callsBeforeQuarantine = executorCallCount;
    // The bound this test exists to pin: at most cap × 2 real calls, never
    // unbounded. (In this always-retryable-failure scenario it will in
    // practice equal cap × 2 exactly, but the property under test is the
    // upper bound, not the exact count — see this file's header.)
    expect(callsBeforeQuarantine).toBeLessThanOrEqual(MAX_FIXTURE_RECAPTURE_FAILURES * 2);
    expect(callsBeforeQuarantine).toBeGreaterThan(0);

    // One more call (the 4th `runTests()` invocation): the suite is
    // quarantined for this exact cause — must refuse WITHOUT calling the
    // executor at all. This is the "zero further live executions" half of
    // the bounded property.
    await runTestsFlushingRetryDelay();
    expect(executorCallCount).toBe(callsBeforeQuarantine); // unchanged — the 4th call never reached the executor

    // A 5th call for good measure — still zero, not just "one more skip".
    await runTestsFlushingRetryDelay();
    expect(executorCallCount).toBe(callsBeforeQuarantine);
  }, 20_000);

  it("the refusal after quarantine still writes a test_results row (visible, not silent)", async () => {
    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES + 1; i++) {
      await runTestsFlushingRetryDelay();
    }
    const refusalRow = insertedResults.find(
      (r) => typeof r.failureReason === "string" && (r.failureReason as string).includes("fixture_recapture_quarantined"),
    );
    expect(refusalRow).toBeTruthy();
    expect(refusalRow!.passed).toBe(false);
  }, 20_000);

  it("every attempted recapture writes exactly one test_results row per runTests() call, none of which is a false pass", async () => {
    const totalCalls = MAX_FIXTURE_RECAPTURE_FAILURES + 1;
    for (let i = 0; i < totalCalls; i++) {
      await runTestsFlushingRetryDelay();
    }
    // One row per runTests() call regardless of how many raw executor
    // calls withRetry made inside it — the recapture-failure counter (and
    // the test_results row) is per-attempt, not per-raw-call.
    expect(insertedResults.length).toBe(totalCalls);
    expect(insertedResults.every((r) => r.passed === false)).toBe(true);
  }, 20_000);

  it("round-2 gap fix still holds: a MISSING executor also counts toward the cap, not just a throwing one", async () => {
    mockExecutorImpl = null; // getExecutor returns undefined — the early-return branch, no withRetry involved

    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES; i++) {
      await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
      expect(suite.fixtureRecaptureFailures).toBe(i + 1);
    }
    expect(suite.testStatus).toBe("quarantined");
  });

  it("a canary-mode (non-fixture) suite is never gated by this mechanism, even while failing repeatedly", async () => {
    suite.testMode = "canary";
    for (let i = 0; i < 5; i++) {
      await runTestsFlushingRetryDelay();
    }
    expect(executorCallCount).toBeGreaterThan(0); // every call reached the executor — canary suites keep their genuine live signal
    expect(suite.fixtureRecaptureFailures).toBe(0); // the counter is fixture-mode-scoped only
    expect(suite.testStatus).toBe("normal");
  }, 20_000);
});
