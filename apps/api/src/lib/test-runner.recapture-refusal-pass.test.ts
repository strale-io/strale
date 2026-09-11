/**
 * Regression test for the wrongly-quarantined-refusal-suite incident
 * (found 2026-09-11, fixed same day). See test-runner.ts's
 * fixture-recapture-tracking comment (around `recordFixtureRecaptureFailure`'s
 * call site in `runSingleTest`) and browserless-suite-migration.ts's
 * `REFUSAL_ONLY_TYPES` doc comment for the full account.
 *
 * `negative`/`edge_case`/`known_bad` test types verify that a capability
 * correctly REFUSES bad input. `validateResult` marks that refusal
 * `passed: true` with `capResult === null` — there is never any output on
 * their expected-pass path. The pre-fix condition
 * (`!(passed && capResult?.output)`) counted every one of those correct,
 * PASSING refusals as a failed fixture-recapture attempt, so three
 * consecutive passing scheduled runs quarantined the suite exactly as fast
 * as three genuine failures would have — verified against production: all
 * 32 non-`dependency_health` rows quarantined under
 * `FIXTURE_RECAPTURE_QUARANTINE_MARKER` had exactly
 * `MAX_FIXTURE_RECAPTURE_FAILURES` consecutive `passed: true` / no-output
 * `test_results` rows immediately before the quarantine, never a
 * `passed: false` one.
 *
 * This file drives the full `runTests()` -> `runSingleTest()` path (same
 * harness style as `test-runner.recapture-termination.test.ts`, which this
 * file is a sibling to and must keep passing unmodified) against a
 * fixture-mode `negative`-type suite whose executor ALWAYS throws — the
 * textbook "capability correctly rejected bad input" case.
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

vi.mock("./credential-health.js", () => ({
  getUnconfiguredCapabilities: () => new Set<string>(),
}));
vi.mock("./upstream-health-gate.js", () => ({
  findUnhealthyUpstream: () => null,
  refreshUpstreamMapping: () => Promise.resolve(),
  isCacheExpired: () => false,
}));
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
  autoRemediationLog: unknown;
}

let suite: SuiteRow;
const insertedResults: Array<Record<string, unknown>> = [];

function isSqlIncrement(value: unknown): boolean {
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
            capabilityType: "stable_api",
            outputSchema: null,
          },
        ]),
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (vals: Record<string, unknown>) => {
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
  // The capability correctly rejects bad input by throwing — exactly what a
  // negative/edge_case/known_bad test expects on a PASS.
  mockExecutorImpl = () => {
    executorCallCount++;
    return Promise.reject(new Error("'url' is required."));
  };

  suite = {
    id: "suite-recapture-refusal-pass",
    capabilitySlug: "accessibility-audit",
    testName: "negative",
    testType: "negative",
    input: {},
    validationRules: { checks: [] },
    active: true,
    testMode: "fixture",
    baselineOutput: null, // never capturable — a passing refusal has no output
    baselineCapturedAt: null,
    updatedAt: new Date(),
    fixtureLastRefreshed: null,
    fixtureRecaptureFailures: 0,
    testStatus: "normal",
    quarantineReason: null,
    externalCostCents: 0,
    lastClassification: null,
    estimatedCostCents: 0,
    autoRemediationLog: null,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a passing refusal-type fixture suite is never counted as a failed recapture (2026-09-11 fix)", () => {
  it("does not raise fixture_recapture_failures on a single passing negative-test run", async () => {
    await runTests({
      capabilitySlug: suite.capabilitySlug,
      testType: suite.testType,
      suiteId: suite.id,
    });

    expect(executorCallCount).toBe(1);
    const row = insertedResults[0];
    expect(row.passed).toBe(true); // negative test: executor threw -> correctly rejected -> PASS
    expect(suite.fixtureRecaptureFailures).toBe(0); // the bug: this used to be 1
    expect(suite.testStatus).toBe("normal");
  });

  it("does not quarantine after MAX_FIXTURE_RECAPTURE_FAILURES consecutive passing runs", async () => {
    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES; i++) {
      await runTests({
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        suiteId: suite.id,
      });
    }
    expect(insertedResults.length).toBe(MAX_FIXTURE_RECAPTURE_FAILURES);
    expect(insertedResults.every((r) => r.passed === true)).toBe(true);
    expect(suite.fixtureRecaptureFailures).toBe(0);
    expect(suite.testStatus).toBe("normal"); // the bug: this used to be "quarantined" here
    expect(suite.quarantineReason).toBeNull();

    // A further run still reaches the executor — never gated, because it was
    // never (wrongly) quarantined.
    await runTests({
      capabilitySlug: suite.capabilitySlug,
      testType: suite.testType,
      suiteId: suite.id,
    });
    expect(executorCallCount).toBe(MAX_FIXTURE_RECAPTURE_FAILURES + 1);
  });

  it("known_bad: a thrown rejection also passes and does not count toward the cap", async () => {
    suite.testType = "known_bad";
    suite.testName = "known_bad";
    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES; i++) {
      await runTests({
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        suiteId: suite.id,
      });
    }
    expect(suite.fixtureRecaptureFailures).toBe(0);
    expect(suite.testStatus).toBe("normal");
  });

  it("edge_case: a thrown rejection also passes and does not count toward the cap", async () => {
    suite.testType = "edge_case";
    suite.testName = "edge_case";
    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES; i++) {
      await runTests({
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        suiteId: suite.id,
      });
    }
    expect(suite.fixtureRecaptureFailures).toBe(0);
    expect(suite.testStatus).toBe("normal");
  });

  it("a genuinely FAILING known_answer recapture on the same fixture-mode plumbing still raises the counter and still quarantines at the cap (unchanged behavior)", async () => {
    suite.testType = "known_answer";
    suite.testName = "known_answer";
    // known_answer has no early "executionError -> passed:true" branch in
    // validateResult, so a throwing executor is a genuine failure here.
    for (let i = 0; i < MAX_FIXTURE_RECAPTURE_FAILURES; i++) {
      await runTests({
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        suiteId: suite.id,
      });
      expect(suite.fixtureRecaptureFailures).toBe(i + 1);
    }
    expect(suite.testStatus).toBe("quarantined");
    expect(suite.quarantineReason).toMatch(/fixture_recapture_exhausted:/);
  });
});

/**
 * 2026-09-12: the general runtime rule (`convertRefusalOnlyFixtureToCanary`
 * in test-runner.ts) that closes the defect class instead of just the
 * counter symptom above. Fixture mode requires a capturable baseline; a
 * refusal-only outcome can never have one, so leaving a passing
 * refusal-type suite on `test_mode = 'fixture'` after the counter fix above
 * means it would call its executor forever with zero cap (a passing run
 * never increments `fixture_recapture_failures`). This suite moves out of
 * fixture mode on its first qualifying pass.
 *
 * Planted (per DEC-20260504-A): commented out the
 * `else if (suite.testMode === "fixture" && passed && !capResult?.output)`
 * branch in test-runner.ts's runSingleTest, re-ran this describe block —
 * both "moved to canary" tests failed (`suite.testMode` stayed `"fixture"`,
 * `autoRemediationLog` stayed `null`), the "stays in fixture mode" test
 * still passed (it exercises the unrelated `captureBaseline` path). Restored
 * the branch — all three green again.
 */
describe("a passing refusal-type fixture suite moves to canary, exactly once (2026-09-12 runtime rule)", () => {
  it("converts test_mode to canary on the first passing run with no output, and records why", async () => {
    await runTests({
      capabilitySlug: suite.capabilitySlug,
      testType: suite.testType,
      suiteId: suite.id,
    });

    expect(suite.testMode).toBe("canary");
    const log = suite.autoRemediationLog as Array<Record<string, unknown>>;
    expect(log).toHaveLength(1);
    expect(log[0].rule).toBe("fixture_refusal_only_no_baseline_possible");
    expect(log[0].applied).toBe(true);
    // Never (wrongly) counted toward the recapture-failure cap either.
    expect(suite.fixtureRecaptureFailures).toBe(0);
    expect(suite.testStatus).toBe("normal");
  });

  it("never loops: a suite already converted to canary is not converted again on a later pass", async () => {
    await runTests({
      capabilitySlug: suite.capabilitySlug,
      testType: suite.testType,
      suiteId: suite.id,
    });
    expect(suite.testMode).toBe("canary");
    const logAfterFirst = (suite.autoRemediationLog as Array<Record<string, unknown>>).length;
    expect(logAfterFirst).toBe(1);

    // Further scheduled dispatches still reach the executor (canary mode is
    // a bounded live check, not a skip) but the conversion guard is gated on
    // `testMode === "fixture"`, which is no longer true — no repeat log
    // entry, no re-conversion.
    for (let i = 0; i < 3; i++) {
      await runTests({
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        suiteId: suite.id,
      });
    }
    expect(suite.testMode).toBe("canary");
    expect((suite.autoRemediationLog as Array<Record<string, unknown>>).length).toBe(1);
  });
});

describe("a fixture-mode suite that passes WITH output still captures a baseline and stays in fixture mode", () => {
  it("known_answer: a real output on a pass captures the baseline; test_mode is untouched", async () => {
    suite.testType = "known_answer";
    suite.testName = "known_answer";
    mockExecutorImpl = () => {
      executorCallCount++;
      return Promise.resolve({
        output: { company_name: "Test AB", org_number: "5591234567" },
        provenance: { source: "test", fetched_at: new Date().toISOString() },
      });
    };

    await runTests({
      capabilitySlug: suite.capabilitySlug,
      testType: suite.testType,
      suiteId: suite.id,
    });

    expect(insertedResults[0].passed).toBe(true);
    // captureBaseline fired (fire-and-forget, but the mock's update() applies
    // synchronously) — baseline_output is now set.
    expect(suite.baselineOutput).toEqual({ company_name: "Test AB", org_number: "5591234567" });
    // The conversion branch above never fires when there IS output — the
    // suite stays in fixture mode, exactly the shape captureBaseline exists
    // to serve.
    expect(suite.testMode).toBe("fixture");
    expect(suite.autoRemediationLog).toBeNull();
  });
});
