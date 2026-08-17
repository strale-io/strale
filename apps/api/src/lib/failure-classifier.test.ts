/**
 * Regression tests for two failure-classifier.ts pattern gaps (Phase-4 tail
 * fix, 2026-08-17). Both real-message fixtures fell through every pattern
 * set to `unknown` before this fix, poisoning failure-taxonomy signal for
 * two different reasons:
 *
 *   1. Scheduler-side budget exhaustion (`BudgetExhaustedError` from
 *      `guarded-executor.ts`) is the PLATFORM declining to run a test — not
 *      a capability or upstream signal. It belongs in `test_infrastructure`
 *      alongside the other INFRA_* patterns, not `unknown`.
 *
 *   2. polish-company-data's deliberate compliance refusal (no KRS number
 *      given, so it refuses name-based search rather than hit a
 *      non-compliant source) is a correct refusal, not a fault — same
 *      `test_design` class as INPUT_REJECTION_PATTERNS, just without the
 *      "required"/"invalid input"/"must provide" phrasing those patterns
 *      look for.
 *
 * Fixtures below are copied verbatim from the real throw sites (not
 * paraphrased) so the regex match is proven against production message
 * shape, not an idealized one.
 */

import { describe, expect, it } from "vitest";
import { classifyFailure } from "./failure-classifier.js";

// Verbatim from guarded-executor.ts's BudgetExhaustedError constructor:
//   `Capability '${slug}' has exhausted its ${meta.quota_window} test budget ` +
//   `(${meta.cost_class}, quota_cap=${meta.quota_cap}). Customer traffic is ` +
//   `unaffected; Strale's own test/CI usage must wait for the next window.`
const BUDGET_EXHAUSTION_MESSAGE =
  "Capability 'danish-company-data' has exhausted its daily test budget " +
  "(free_quota, quota_cap=2). Customer traffic is unaffected; Strale's own " +
  "test/CI usage must wait for the next window.";

// Verbatim from polish-company-data.ts:150-157.
const POLISH_COMPLIANCE_REFUSAL_MESSAGE =
  "Polish company name search is unavailable: the only compliant data path is the KRS API by registration number. " +
  "Provide a 10-digit KRS number (e.g. '0000028860' for ORLEN S.A.). " +
  "Look up KRS numbers at https://wyszukiwarka-krs.ms.gov.pl/.";

describe("classifyFailure — budget exhaustion (Phase-4 tail fix)", () => {
  it("classifies the real BudgetExhaustedError message as test_infrastructure, not unknown", () => {
    const result = classifyFailure(
      BUDGET_EXHAUSTION_MESSAGE,
      /* executionSucceeded */ false,
      /* validationFailed */ false,
      "dependency_health",
      {},
    );
    expect(result.verdict).toBe("test_infrastructure");
    expect(result.confidence).toBe("high");
  });

  it("also matches the shorter '(N of N calls)' budget-exhaustion phrasing", () => {
    const result = classifyFailure(
      "Capability 'greek-company-data' has exhausted its daily test budget (40 of 40 calls).",
      false,
      false,
      "known_answer",
      {},
    );
    expect(result.verdict).toBe("test_infrastructure");
  });
});

describe("classifyFailure — compliance refusal (Phase-4 tail fix)", () => {
  it("classifies polish-company-data's real compliance-refusal message as test_design, not unknown", () => {
    const result = classifyFailure(
      POLISH_COMPLIANCE_REFUSAL_MESSAGE,
      /* executionSucceeded */ false,
      /* validationFailed */ false,
      "negative",
      {},
    );
    expect(result.verdict).toBe("test_design");
    expect(result.confidence).toBe("high");
  });
});
