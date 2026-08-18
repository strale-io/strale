/**
 * Regression tests for health-sweep.ts's exhausted-recapture quarantine
 * exclusion (Codex closing-pass review, round 3, 2026-08-18).
 *
 * `runWeeklyHealthSweep`'s generic quarantine-review sweep (step 4) must
 * never evaluate recovery for, or release, a suite quarantined specifically
 * for exhausted fixture-recapture attempts — that's a human-only reset by
 * design (test-runner.ts's runSingleTest already refuses every further live
 * call for this cause). Before this fix that held true only because
 * checkQuarantineRecovery could never organically find 3 consecutive passes
 * for a suite that never executes again; this test pins the EXPLICIT skip
 * (report.quarantineSkippedNeedsHuman, no checkQuarantineRecovery call, no
 * release) rather than relying on that implicit, fragile invariant.
 *
 * No DB harness exists for this function (5+ sequential queries, several
 * dynamically-imported dependencies) — test-harness exemption, DEC-20260504-A.
 * The mock is call-order-based rather than WHERE-clause-parsing: the
 * function's `db.select().from(testSuites)` calls happen in a fixed,
 * documented sequence (failingSuites, then quarantinedSuites, then
 * upstreamBrokenSuites), so a counter routes each call to its canned
 * result — simpler and just as faithful as parsing drizzle's query
 * builder internals for this file's purpose.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./auto-remediation.js", () => ({
  analyzeAndRemediate: () => Promise.resolve([]),
  applyRemediation: () => Promise.resolve(undefined),
}));
vi.mock("./upstream-tracker.js", () => ({
  runUpstreamEscalationSweep: () => Promise.resolve([]),
}));
vi.mock("./meta-monitoring.js", () => ({
  runWeeklyChecks: () => Promise.resolve([]),
}));

let quarantinedSuiteRows: Array<Record<string, unknown>> = [];
let testSuitesSelectCallCount = 0;
let testResultsSelectCalls = 0;
const updateCalls: Array<{ id: string; set: Record<string, unknown> }> = [];

function extractSuiteIdFromWhere(whereArg: unknown): string | undefined {
  // Best-effort extraction from drizzle's eq(testSuites.id, value) shape —
  // only needed so update-tracking can report which suite id was touched;
  // never load-bearing for pass/fail (the tests assert on set-shape and
  // call COUNTS, not on the extracted id).
  try {
    const chunks = (whereArg as { queryChunks?: unknown[] })?.queryChunks;
    const param = chunks?.find(
      (c) => !!c && typeof c === "object" && (c as { constructor?: { name?: string } }).constructor?.name === "Param",
    ) as { value?: unknown } | undefined;
    return typeof param?.value === "string" ? param.value : undefined;
  } catch {
    return undefined;
  }
}

const mockDb = {
  select: (_fields?: unknown) => ({
    from: (table: unknown) => {
      if (table === testSuitesTable) {
        testSuitesSelectCallCount++;
        return {
          where: (_w: unknown) => {
            if (testSuitesSelectCallCount === 1) return Promise.resolve([]); // failingSuites
            if (testSuitesSelectCallCount === 2) return Promise.resolve(quarantinedSuiteRows); // quarantinedSuites
            return Promise.resolve([]); // upstreamBrokenSuites
          },
        };
      }
      if (table === testResultsTable) {
        testResultsSelectCalls++;
        return {
          where: (_w: unknown) => ({
            orderBy: (_o: unknown) => ({
              // No recent passing results -> checkQuarantineRecovery (when
              // it IS called, for a non-exhausted-recapture suite) never
              // finds recovery evidence either — isolates this test to
              // "was the call made at all", not recovery-decision logic
              // (that's checkQuarantineRecovery's own concern, untested
              // here).
              limit: (_n: unknown) => Promise.resolve([]),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in select().from(): ${String(table)}`);
    },
  }),
  update: (_table: unknown) => ({
    set: (setArgs: Record<string, unknown>) => ({
      where: (whereArg: unknown) => {
        updateCalls.push({ id: extractSuiteIdFromWhere(whereArg) ?? "unknown", set: setArgs });
        return Promise.resolve(undefined);
      },
    }),
  }),
};
vi.mock("../db/index.js", () => ({ getDb: () => mockDb }));

import { runWeeklyHealthSweep } from "./health-sweep.js";
import { testSuites as testSuitesTable, testResults as testResultsTable } from "../db/schema.js";
import { FIXTURE_RECAPTURE_QUARANTINE_MARKER } from "./test-runner.js";

function quarantinedSuite(overrides: Record<string, unknown>) {
  return {
    id: "suite-1",
    capabilitySlug: "screenshot-url",
    active: true,
    testStatus: "quarantined",
    quarantineReason: null,
    lastClassification: null,
    ...overrides,
  };
}

beforeEach(() => {
  quarantinedSuiteRows = [];
  testSuitesSelectCallCount = 0;
  testResultsSelectCalls = 0;
  updateCalls.length = 0;
});

describe("runWeeklyHealthSweep — exhausted-recapture quarantine exclusion (Codex round 3)", () => {
  it("never calls checkQuarantineRecovery (no test_results select) for an exhausted-recapture-quarantined suite", async () => {
    quarantinedSuiteRows = [
      quarantinedSuite({
        id: "suite-exhausted",
        capabilitySlug: "screenshot-url",
        quarantineReason: `${FIXTURE_RECAPTURE_QUARANTINE_MARKER} 3 consecutive failed live recapture attempts — needs human.`,
      }),
    ];

    const report = await runWeeklyHealthSweep();

    expect(testResultsSelectCalls).toBe(0);
    expect(report.quarantineReleased).toEqual([]);
    expect(report.quarantineSkippedNeedsHuman).toEqual(["screenshot-url"]);
  });

  it("never writes an UPDATE (release) for an exhausted-recapture-quarantined suite", async () => {
    quarantinedSuiteRows = [
      quarantinedSuite({
        id: "suite-exhausted",
        capabilitySlug: "screenshot-url",
        quarantineReason: `${FIXTURE_RECAPTURE_QUARANTINE_MARKER} 3 consecutive failed live recapture attempts — needs human.`,
      }),
    ];

    await runWeeklyHealthSweep();

    expect(updateCalls.length).toBe(0);
  });

  it("still evaluates and can release a suite quarantined for an UNRELATED reason — this fix doesn't disable recovery generally", async () => {
    quarantinedSuiteRows = [
      quarantinedSuite({
        id: "suite-other",
        capabilitySlug: "html-to-pdf",
        quarantineReason: "upstream API deprecated, needs manual review",
      }),
    ];

    const report = await runWeeklyHealthSweep();

    // checkQuarantineRecovery WAS invoked (its test_results select fired) —
    // the generic sweep still functions for suites outside this specific cause.
    expect(testResultsSelectCalls).toBe(1);
    expect(report.quarantineSkippedNeedsHuman).toEqual([]);
    // With zero recent results, checkQuarantineRecovery returns false, so
    // it isn't released either — but the KEY assertion is that it was
    // actually EVALUATED, not skipped, unlike the exhausted-recapture case.
    expect(report.quarantineReleased).toEqual([]);
  });

  it("mixed batch: skips the exhausted-recapture suite, still evaluates the other one", async () => {
    quarantinedSuiteRows = [
      quarantinedSuite({
        id: "suite-exhausted",
        capabilitySlug: "screenshot-url",
        quarantineReason: `${FIXTURE_RECAPTURE_QUARANTINE_MARKER} 3 consecutive failed live recapture attempts — needs human.`,
      }),
      quarantinedSuite({
        id: "suite-other",
        capabilitySlug: "html-to-pdf",
        quarantineReason: "upstream API deprecated",
      }),
    ];

    const report = await runWeeklyHealthSweep();

    expect(testResultsSelectCalls).toBe(1); // only for suite-other
    expect(report.quarantineSkippedNeedsHuman).toEqual(["screenshot-url"]);
  });
});
