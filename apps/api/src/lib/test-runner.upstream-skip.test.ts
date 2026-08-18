import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 2026-08-18: chromium-health.ts dead-import investigation ──────────────
//
// Pins the behavior of runTests()'s per-suite loop at the exact call site
// (findUnhealthyUpstream) that supersedes chromium-health.ts's removed,
// never-wired isBrowserlessCapability()/probeChromiumHealth() imports:
//   1. Browserless (or any mapped upstream) down → suite silently skipped,
//      no test_results row, no entry in the run summary.
//   2. Upstream healthy → suite executes normally.
//   3. The health check itself throwing → fails OPEN (suite still runs),
//      matching Test Infrastructure Cost Principle A's spirit and the
//      graceful-degradation pattern test-scheduler.ts's own provider-health
//      filter already uses ("if health check fails, run all tests").
//   4. A capability with no mapped upstream is never skipped by this gate,
//      regardless of what findUnhealthyUpstream would say for OTHER slugs.
//
// upstream-health-gate.ts itself (mocked here) is unit-tested directly in
// upstream-health-gate.test.ts, including the manifest-driven (not
// capability_type) slug derivation. This file is purely about the wiring
// inside test-runner.ts's loop.

const mockFindUnhealthyUpstream = vi.fn();
vi.mock("./upstream-health-gate.js", () => ({
  findUnhealthyUpstream: (...args: unknown[]) => mockFindUnhealthyUpstream(...args),
}));

const mockAssertGuardedAllow = vi.fn();
const mockIsBudgetExhausted = vi.fn();
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
let suiteRows: Array<{
  suite: {
    id: string;
    capabilitySlug: string;
    testType: string;
    testName: string;
    testMode: string;
    input: Record<string, unknown>;
    validationRules: { checks: unknown[] };
    baselineOutput: null;
    externalCostCents: number;
    estimatedCostCents: number;
    active: boolean;
    lastClassification: null;
  };
  fieldReliability: null;
  capabilityType: string;
  outputSchema: null;
}> = [];

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
import { runTests } from "./test-runner.js";

function fakeSuiteRow(slug: string) {
  return {
    suite: {
      id: `suite-${slug}`,
      capabilitySlug: slug,
      testType: "negative",
      testName: `test-${slug}`,
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
    capabilityType: "ai_assisted",
    outputSchema: null,
  };
}

describe("runTests — findUnhealthyUpstream skip gate (supersedes chromium-health.ts's dead imports)", () => {
  beforeEach(() => {
    mockFindUnhealthyUpstream.mockReset();
    mockAssertGuardedAllow.mockReset().mockResolvedValue(undefined);
    mockIsBudgetExhausted.mockReset().mockResolvedValue(false);
    mockExecutor.mockReset().mockResolvedValue({
      output: { ok: true },
      provenance: { source: "test", fetched_at: new Date().toISOString() },
    });
    insertResultsCalls.length = 0;
    suiteRows = [fakeSuiteRow("fake-browserless-test-cap")];
  });

  it("Browserless down → suite skipped silently: no test_results row, no result entry, executor never called", async () => {
    mockFindUnhealthyUpstream.mockReturnValue("browserless");

    const summary = await runTests({ capabilitySlug: "fake-browserless-test-cap" });

    expect(mockExecutor).not.toHaveBeenCalled();
    expect(insertResultsCalls.length).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.results).toEqual([]);
  });

  it("Browserless up → suite executes normally and records a result", async () => {
    mockFindUnhealthyUpstream.mockReturnValue(null);

    const summary = await runTests({ capabilitySlug: "fake-browserless-test-cap" });

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(insertResultsCalls.length).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(1);
  });

  it("findUnhealthyUpstream throwing → fails open: suite still runs, doesn't abort the batch", async () => {
    mockFindUnhealthyUpstream.mockImplementation(() => {
      throw new Error("simulated upstream-health-gate malfunction");
    });

    const summary = await runTests({ capabilitySlug: "fake-browserless-test-cap" });

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(insertResultsCalls.length).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.passed).toBe(1);
  });

  it("a capability with no mapped upstream is never skipped by this gate", async () => {
    // findUnhealthyUpstream itself would return null for any slug with no
    // known upstream dependency — simulated directly since the mapping
    // logic is upstream-health-gate.ts's own responsibility (tested there).
    suiteRows = [fakeSuiteRow("some-capability-with-no-upstream")];
    mockFindUnhealthyUpstream.mockImplementation((slug: string) =>
      slug === "fake-browserless-test-cap" ? "browserless" : null,
    );

    const summary = await runTests({ capabilitySlug: "some-capability-with-no-upstream" });

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(insertResultsCalls.length).toBe(1);
    expect(summary.total).toBe(1);
  });
});
