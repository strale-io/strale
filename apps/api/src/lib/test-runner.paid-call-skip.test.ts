/**
 * Wiring test for lib/paid-call-guard.ts in the scheduled test path
 * (2026-11-02). Drives runTests() -> runSingleTest() with the same mocked
 * harness as test-runner.recapture-refusal-pass.test.ts. The executor makes a
 * "paid" call through the real guard; the run must be skipped with no
 * test_results row (so a negative test cannot pass on it and public surfaces
 * never show it as a failure), and must not touch the fixture-recapture
 * counter. Removing the runWithoutPaidCalls wrap in runSingleTest makes the
 * executor succeed and a row get written, which fails these tests.
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

import { runTests } from "./test-runner.js";
import { testResults as testResultsTable } from "../db/schema.js";
import { assertPaidCallAllowed } from "./paid-call-guard.js";

function baseSuite(testType: string, testMode: string): SuiteRow {
  return {
    id: "suite-paid-call-skip",
    capabilitySlug: "canadian-company-data",
    testName: testType,
    testType,
    input: { company_name: "Shopify" },
    validationRules: { checks: [] },
    active: true,
    testMode,
    baselineOutput: null,
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
}

beforeEach(() => {
  executorCallCount = 0;
  insertedResults.length = 0;
  mockAssertGuardedAllow.mockReset().mockResolvedValue(undefined);
  mockIsBudgetExhausted.mockReset().mockResolvedValue(false);
  // Stands in for canadian-company-data's name path: the first upstream call
  // is a paid Claude request.
  mockExecutorImpl = async () => {
    executorCallCount++;
    assertPaidCallAllowed("anthropic");
    return { output: { company_name: "SHOPIFY INC." }, provenance: { source: "x", fetched_at: "" } };
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const run = () => runTests({ capabilitySlug: suite.capabilitySlug, testType: suite.testType, suiteId: suite.id });

describe("scheduled tests never make a paid call", () => {
  it("known_answer (live): the paid call is stopped and no result row is written", async () => {
    suite = baseSuite("known_answer", "live");
    await run();
    expect(executorCallCount).toBe(1);
    expect(insertedResults).toHaveLength(0);
  });

  it("negative: a stopped paid call is not recorded as a passing refusal", async () => {
    suite = baseSuite("negative", "live");
    await run();
    expect(insertedResults).toHaveLength(0);
  });

  it("fixture mode without a baseline: the stop does not count as a failed recapture", async () => {
    suite = baseSuite("known_answer", "fixture");
    await run();
    expect(insertedResults).toHaveLength(0);
    expect(suite.fixtureRecaptureFailures).toBe(0);
    expect(suite.testStatus).toBe("normal");
  });

  it("control: an executor that makes no paid call still records its result", async () => {
    suite = baseSuite("known_answer", "live");
    mockExecutorImpl = async () => {
      executorCallCount++;
      return { output: { company_name: "SHOPIFY INC." }, provenance: { source: "x", fetched_at: "" } };
    };
    await run();
    expect(insertedResults).toHaveLength(1);
    expect(insertedResults[0].passed).toBe(true);
  });
});
