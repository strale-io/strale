/**
 * Regression test for the "unbounded recapture" re-verification (Codex
 * closing-pass review, round 2, 2026-08-18).
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
 * Round 2 adds a runtime refusal gate in `runSingleTest`: once quarantined
 * specifically for exhausted fixture-recapture attempts (identified by
 * `FIXTURE_RECAPTURE_QUARANTINE_MARKER` on `quarantine_reason`), the suite
 * refuses to attempt ANY further live call, unconditionally, regardless of
 * dispatch cadence or caller — until a human resets `test_status`.
 *
 * This test drives the full `runTests()` -> `runSingleTest()` path (not
 * just the extracted helper functions test-runner.fixture-lifecycle.test.ts
 * covers) against a fixture-mode suite whose executor ALWAYS fails, calling
 * it 4 times in sequence — simulating 4 consecutive scheduled dispatches —
 * and asserts the executor is invoked exactly 3 times (attempts 1-3, each
 * incrementing the failure counter; the 3rd trips the quarantine) and ZERO
 * times on the 4th call, which must resolve via the refusal path instead.
 *
 * Self-contained local mocks (module-scoped, vitest mocks are per test
 * file — does not interact with test-runner.test.ts's separate, larger
 * mock in the same directory). The mock DB is intentionally minimal: ONE
 * mutable suite row, `select` always returns it (no column-aware WHERE
 * parsing — unnecessary with a single suite in scope), `update` mutates
 * the row in place (including emulating the `col + 1` SQL increment) so
 * failure count and quarantine state genuinely persist call-to-call, the
 * same way they would against a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
            capabilityType: "deterministic", // skip withRetry's real backoff delay
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

import { runTests } from "./test-runner.js";
import { testResults as testResultsTable } from "../db/schema.js";

beforeEach(() => {
  executorCallCount = 0;
  insertedResults.length = 0;
  mockAssertGuardedAllow.mockReset().mockResolvedValue(undefined);
  mockIsBudgetExhausted.mockReset().mockResolvedValue(false);
  mockExecutorImpl = () => {
    executorCallCount++;
    return Promise.reject(new Error("upstream permanently broken (simulated)"));
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

describe("unbounded-recapture termination (Codex review round 2 re-verification)", () => {
  it("caps at exactly 3 live executor attempts, then refuses on the 4th call — zero further live executions", async () => {
    // Attempt 1: fails, counter -> 1.
    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(executorCallCount).toBe(1);
    expect(suite.fixtureRecaptureFailures).toBe(1);
    expect(suite.testStatus).toBe("normal");

    // Attempt 2: fails, counter -> 2.
    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(executorCallCount).toBe(2);
    expect(suite.fixtureRecaptureFailures).toBe(2);
    expect(suite.testStatus).toBe("normal");

    // Attempt 3: fails, counter -> 3 -> hits the cap -> quarantines.
    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(executorCallCount).toBe(3);
    expect(suite.fixtureRecaptureFailures).toBe(3);
    expect(suite.testStatus).toBe("quarantined");
    expect(suite.quarantineReason).toMatch(/fixture_recapture_exhausted:/);

    // Attempt 4: the suite is quarantined for this exact cause — must
    // refuse WITHOUT calling the executor at all. This is the assertion
    // the review asked for by name: "zero further live executions after
    // the third."
    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(executorCallCount).toBe(3); // unchanged — no 4th call reached the executor
  });

  it("the refusal on the 4th call still writes a test_results row (visible, not silent)", async () => {
    for (let i = 0; i < 4; i++) {
      await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    }
    const refusalRow = insertedResults.find(
      (r) => typeof r.failureReason === "string" && (r.failureReason as string).includes("fixture_recapture_quarantined"),
    );
    expect(refusalRow).toBeTruthy();
    expect(refusalRow!.passed).toBe(false);
  });

  it("every attempted failure writes a distinct test_results row across all 4 calls, none of which is a false pass", async () => {
    for (let i = 0; i < 4; i++) {
      await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    }
    expect(insertedResults.length).toBe(4);
    expect(insertedResults.every((r) => r.passed === false)).toBe(true);
  });

  it("round-2 gap fix: a MISSING executor also counts toward the cap, not just a throwing one", async () => {
    mockExecutorImpl = null; // getExecutor returns undefined — the early-return branch

    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(suite.fixtureRecaptureFailures).toBe(1);

    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(suite.fixtureRecaptureFailures).toBe(2);

    await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    expect(suite.fixtureRecaptureFailures).toBe(3);
    expect(suite.testStatus).toBe("quarantined");
  });

  it("a canary-mode (non-fixture) suite is never gated by this mechanism, even while failing repeatedly", async () => {
    suite.testMode = "canary";
    for (let i = 0; i < 5; i++) {
      await runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });
    }
    expect(executorCallCount).toBe(5); // every call reached the executor — canary suites keep their genuine live signal
    expect(suite.fixtureRecaptureFailures).toBe(0); // the counter is fixture-mode-scoped only
    expect(suite.testStatus).toBe("normal");
  });
});
