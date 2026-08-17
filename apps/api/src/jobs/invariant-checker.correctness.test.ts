/**
 * Regression tests for the algorithmic-correctness floor's denominator.
 *
 * Measured against production 2026-08-17: ten capabilities were emitting
 * "ALGORITHMIC CORRECTNESS VIOLATION … correctness 0%" every ~36 minutes for
 * over 24 hours, while answering correctly when called directly on prod. The
 * failures being counted were a test-budget guard, an expired vendor token, and
 * upstream 5xx/429s — none of which is evidence about the capability's logic.
 *
 * Every case below uses a real failure_reason string copied from
 * `test_results.failure_reason` in production, so these tests pin behaviour
 * against what the system actually produces rather than against invented text.
 *
 * Discrimination: against the un-fixed code (which counted every failing row,
 * i.e. `rate = passed / rows.length` and quoted all failures), the environmental
 * cases below compute 0% and would fire — each `expect` here inverts that.
 */
import { describe, it, expect } from "vitest";
import {
  scoreCorrectness,
  isEnvironmentalFailure,
  ENVIRONMENTAL_FAILURE_CLASSES,
  type CorrectnessTestRow,
} from "./invariant-checker.js";

/** Verbatim from production `test_results.failure_reason`, 2026-08-17. */
const PROD_REASONS = {
  quotaExhausted:
    "Execution error: Capability 'swedish-company-data' has exhausted its daily test budget (free_quota, quota_cap=1000). Customer traffic is unaffected; Strale's own tests are throttled.",
  tokenRejected:
    "Execution error: CourtListener rejected the token (HTTP 403). Verify COURTLISTENER_API_TOKEN.",
  upstream500: "Execution error: The Gazette API returned HTTP 500.",
  upstream429:
    "Execution error: GDELT API returned HTTP 429. The news search service may be temporarily unavailable. Please try again.",
  timeout: "Execution error: The operation was aborted due to timeout",
  // Capability-attributable: the fixture or the contract is ours either way.
  missingField: "guaranteed_field_missing:best_match",
  allNull:
    "high_null_ratio: 100% of declared fields returned null (6/6). Null fields: name, region, alpha_2, alpha_3, schengen, eu_member",
  wrongValue: "is_reachable: expected 'true', got 'false'",
} as const;

const fail = (reason: string, name = "t"): CorrectnessTestRow => ({
  test_name: name,
  passed: false,
  failure_reason: reason,
});
const pass = (name = "t"): CorrectnessTestRow => ({
  test_name: name,
  passed: true,
  failure_reason: null,
});

describe("isEnvironmentalFailure — production failure strings", () => {
  it.each([
    ["test-budget exhaustion", PROD_REASONS.quotaExhausted],
    ["rejected vendor token", PROD_REASONS.tokenRejected],
    ["upstream 500", PROD_REASONS.upstream500],
    ["upstream 429", PROD_REASONS.upstream429],
    ["timeout", PROD_REASONS.timeout],
  ])("treats %s as environmental", (_label, reason) => {
    expect(isEnvironmentalFailure(reason)).toBe(true);
  });

  it.each([
    ["a missing guaranteed field", PROD_REASONS.missingField],
    ["an all-null response", PROD_REASONS.allNull],
    ["a wrong value", PROD_REASONS.wrongValue],
  ])("keeps %s attributable to the capability", (_label, reason) => {
    expect(isEnvironmentalFailure(reason)).toBe(false);
  });

  it("treats a missing reason as attributable, not as a free pass", () => {
    // An unexplained failure must never be excused. Defaulting the other way
    // would let any unclassified error silence the floor.
    expect(isEnvironmentalFailure(null)).toBe(false);
    expect(isEnvironmentalFailure(undefined)).toBe(false);
    expect(isEnvironmentalFailure("")).toBe(false);
  });

  it("excludes caller_input and tos_policy from the environmental set", () => {
    // A known-answer fixture is OUR input. "The caller sent something bad"
    // means we wrote a bad fixture, which is ours to fix.
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has("caller_input")).toBe(false);
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has("tos_policy")).toBe(false);
    expect(ENVIRONMENTAL_FAILURE_CLASSES.has("internal")).toBe(false);
  });
});

describe("scoreCorrectness", () => {
  it("does not fire when every failure is a throttled test budget", () => {
    // swedish-company-data, 2026-08-16/17: 37 such failures, reported as 5%.
    const rows = [...Array(19)].map(() => fail(PROD_REASONS.quotaExhausted));
    const r = scoreCorrectness([pass(), ...rows]);

    expect(r.environmentalFailures).toHaveLength(19);
    expect(r.attributableFailures).toHaveLength(0);
    // Un-fixed code: 1/20 = 5%, well under the 85% floor → Tier-1 alert.
    expect(r.correctnessRate).toBe(100);
    expect(r.correctnessRate).toBeGreaterThanOrEqual(85);
  });

  it("does not fire when every failure is an expired vendor token", () => {
    // us-court-search: 26 failures in 48h, reported as 0%.
    const rows = [...Array(20)].map(() => fail(PROD_REASONS.tokenRejected));
    const r = scoreCorrectness(rows);

    expect(r.attributableFailures).toHaveLength(0);
    expect(r.passed).toBe(0);
    // Nothing judgeable: denominator 0. The caller reports this at Tier 2
    // rather than as a code defect.
    expect(r.passed + r.attributableFailures.length).toBe(0);
  });

  it("still fires when the capability's own contract is broken", () => {
    // iso-country-lookup's shape: every declared field null, 24 times.
    const rows = [...Array(20)].map(() => fail(PROD_REASONS.allNull));
    const r = scoreCorrectness(rows);

    expect(r.attributableFailures).toHaveLength(20);
    expect(r.environmentalFailures).toHaveLength(0);
    expect(r.correctnessRate).toBe(0);
    expect(r.correctnessRate).toBeLessThan(85);
  });

  it("judges a real defect on the surviving rows, not on the padded total", () => {
    // The case the fix must not get wrong: a capability that is genuinely
    // broken WHILE its upstream is also flaky. Excluding environmental rows
    // from the denominator (rather than scoring them as passes) is what keeps
    // this visible.
    const rows = [
      pass(),
      fail(PROD_REASONS.missingField),
      fail(PROD_REASONS.missingField),
      fail(PROD_REASONS.missingField),
      ...[...Array(10)].map(() => fail(PROD_REASONS.upstream500)),
    ];
    const r = scoreCorrectness(rows);

    expect(r.environmentalFailures).toHaveLength(10);
    // 1 pass / (1 pass + 3 real failures) = 25%.
    expect(r.correctnessRate).toBe(25);
    expect(r.correctnessRate).toBeLessThan(85);
    // Had environmental rows been counted as passes, this would read 11/14 =
    // 79%, and had they stayed in the denominator as failures, 1/14 = 7%.
    // Both are wrong about a capability with a 3-in-4 real failure rate.
    expect(r.correctnessRate).not.toBe(79);
    expect(r.correctnessRate).not.toBe(7);
  });

  it("quotes only capability-attributable failures back to the operator", () => {
    const rows = [
      fail(PROD_REASONS.upstream429, "news-known-answer"),
      fail(PROD_REASONS.missingField, "id-known-answer"),
    ];
    const r = scoreCorrectness(rows);

    expect(r.attributableFailures.map((x) => x.test_name)).toEqual(["id-known-answer"]);
    expect(r.environmentalFailures.map((x) => x.test_name)).toEqual(["news-known-answer"]);
  });

  it("is unchanged for a healthy capability", () => {
    const r = scoreCorrectness([...Array(20)].map(() => pass()));
    expect(r.correctnessRate).toBe(100);
    expect(r.attributableFailures).toHaveLength(0);
    expect(r.environmentalFailures).toHaveLength(0);
  });
});
