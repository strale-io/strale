import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 2026-10-18: the classifier read the sanitized error ───────────────────
//
// The 2026-10-17 classifier fix (an HTML page where JSON was promised is
// upstream, not our bug) passed its unit tests and changed nothing in
// production: the test runner hands the classifier the stored failure_reason,
// which sanitizeErrorMessage has already stripped of `<...>` tags. The Polish
// registry's maintenance page parsed as
//   Unexpected token '<', "\n\n<html>\n<he"... is not valid JSON
// and reached the classifier as
//   Execution error: Unexpected token ' <he"... is not valid JSON
// — no markup left, so it kept being scored capability_bug. These tests drive
// runTests() end to end, so the message the classifier sees is the one the
// runner actually builds.

vi.mock("./upstream-health-gate.js", () => ({
  findUnhealthyUpstream: () => null,
}));

vi.mock("../capabilities/guarded-executor.js", () => ({
  assertGuardedAllow: () => Promise.resolve(undefined),
  isBudgetExhausted: () => Promise.resolve(false),
  CapabilityInvocationRefusedError: class extends Error {},
  CapabilityNotClassifiedError: class extends Error {},
  BudgetExhaustedError: class extends Error {},
}));

const mockExecutor = vi.fn();
vi.mock("../capabilities/index.js", () => ({
  getExecutor: () => mockExecutor,
}));

const insertResultsCalls: Array<Record<string, unknown>> = [];
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
    values: (vals: Record<string, unknown>) => {
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

// The head of the body api-krs.ms.gov.pl served on 2026-10-17/18 (HTTP 200,
// text/html), leading newlines included — they decide what JSON.parse quotes.
const KRS_MAINTENANCE_BODY =
  "\n\n<html>\n<head>\n\t<title>Przerwa techniczna</title>\n</head>\n<body></body>\n</html>\n";

function jsonParseError(body: string): Error {
  try {
    JSON.parse(body);
  } catch (err) {
    return err as Error;
  }
  throw new Error("body unexpectedly parsed");
}

function suiteRow(capabilityType: string) {
  return {
    suite: {
      id: "suite-krs",
      capabilitySlug: "fake-registry-cap",
      testType: "known_answer",
      testName: "Fake Registry — correctness check",
      testMode: "live",
      input: { krs_number: "0000028860" },
      validationRules: { checks: [] },
      baselineOutput: null,
      externalCostCents: 0,
      estimatedCostCents: 0,
      active: true,
      lastClassification: null,
    },
    fieldReliability: null,
    capabilityType,
    outputSchema: null,
  };
}

describe("runTests — classification reads the raw execution error", () => {
  beforeEach(() => {
    mockExecutor.mockReset();
    insertResultsCalls.length = 0;
    suiteRows = [suiteRow("ai_assisted")];
  });

  it("an HTML maintenance page parsed as JSON is upstream_transient, and the stored reason stays sanitized", async () => {
    mockExecutor.mockRejectedValue(jsonParseError(KRS_MAINTENANCE_BODY));

    await runTests({ capabilitySlug: "fake-registry-cap" });

    expect(insertResultsCalls).toHaveLength(1);
    const row = insertResultsCalls[0];
    expect(row.failureClassification).toBe("upstream_transient");
    // What is stored (and shown) is still the sanitized text, markup removed.
    expect(row.failureReason).toBe(`Execution error: Unexpected token ' <he"... is not valid JSON`);
  });

  it("a code error with no markup is still capability_bug", async () => {
    mockExecutor.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'name')"));

    await runTests({ capabilitySlug: "fake-registry-cap" });

    expect(insertResultsCalls[0].failureClassification).toBe("capability_bug");
  });

  it("a deterministic capability serving the same error is still capability_bug", async () => {
    suiteRows = [suiteRow("deterministic")];
    mockExecutor.mockRejectedValue(jsonParseError(KRS_MAINTENANCE_BODY));

    await runTests({ capabilitySlug: "fake-registry-cap" });

    expect(insertResultsCalls[0].failureClassification).toBe("capability_bug");
  });
});
