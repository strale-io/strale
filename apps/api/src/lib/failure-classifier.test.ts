/**
 * Regression tests for two failure-classifier.ts pattern gaps (Phase-4 tail
 * fix, 2026-08-17; patterns tightened same day per review LOW-7). Both
 * real-message fixtures fell through every pattern set to `unknown` before
 * this fix, poisoning failure-taxonomy signal for two different reasons:
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
 *
 * The patterns are anchored on the FULL real message shape, not a bare
 * substring — the original (looser) versions risked matching an unrelated
 * message that happened to share a fragment (e.g. "only compliant data
 * path returned HTTP 500", a genuine upstream failure) and misclassifying
 * it with high confidence. The negative tests below pin that these
 * look-alikes correctly fall through to a lower-confidence/different
 * verdict instead.
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

  it("LOW-7: does NOT match a look-alike message missing the real message's full shape", () => {
    // "(40 of 40 calls)" is an older/different phrasing than the current
    // BudgetExhaustedError constructor's "(cost_class, quota_cap=N).
    // Customer traffic is unaffected" — not a real classifyFailure
    // producer today. Pinning that the tightened pattern does NOT
    // high-confidence-classify this as test_infrastructure just because it
    // contains "has exhausted its ... test budget" is the whole point of
    // the LOW-7 tightening.
    const result = classifyFailure(
      "Capability 'greek-company-data' has exhausted its daily test budget (40 of 40 calls).",
      false,
      false,
      "known_answer",
      {},
    );
    expect(result.verdict).not.toBe("test_infrastructure");
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

  it("LOW-7: does NOT misclassify an unrelated failure that merely shares the fragment 'only compliant data path'", () => {
    // The reviewer's exact false-positive case: a genuine upstream failure
    // whose message happens to contain the bare fragment the original
    // (looser) pattern matched on, without any of the real refusal
    // message's surrounding structure.
    const result = classifyFailure(
      "only compliant data path returned HTTP 500",
      /* executionSucceeded */ false,
      /* validationFailed */ false,
      "known_answer",
      {},
    );
    expect(result.verdict).not.toBe("test_design");
  });
});

// 2026-10-17: from 2026-10-16 the Polish KRS API answered every request with
// an HTTP 200 "Przerwa techniczna" (technical break) HTML page. The executor's
// JSON.parse threw this message (Node's own wording, reproduced against the
// captured body), and step 4's `/unexpected token/i` called it capability_bug
// before step 6's HTML patterns could see it — 24 false "internal" verdicts.
const HTML_MAINTENANCE_PAGE_MESSAGE =
  "Execution error: Unexpected token '<', \"\r\n\r\n<html>\r\n<h\"... is not valid JSON";

describe("classifyFailure — HTML page where JSON was promised", () => {
  it("classifies a JSON.parse failure on an HTML page as upstream_transient, not capability_bug", () => {
    const result = classifyFailure(HTML_MAINTENANCE_PAGE_MESSAGE, false, false, "dependency_health", {});
    expect(result.verdict).toBe("upstream_transient");
  });

  it("does the same for a <!DOCTYPE body", () => {
    const result = classifyFailure(
      "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", false, false, "known_answer", {},
    );
    expect(result.verdict).toBe("upstream_transient");
  });

  it("still calls a parse failure without markup evidence a capability_bug", () => {
    const result = classifyFailure(
      "Unexpected token '<', \"<thinking>\"... is not valid JSON", false, false, "known_answer", {},
    );
    expect(result.verdict).toBe("capability_bug");
  });

  it("a deterministic capability still cannot blame an upstream", () => {
    const result = classifyFailure(HTML_MAINTENANCE_PAGE_MESSAGE, false, false, "known_answer", {}, false, "deterministic");
    expect(result.verdict).toBe("capability_bug");
  });
});

describe("classifyFailure — keyword-rank-check refusing an opaque Google redirect", () => {
  // Google's `/goto` wrapper (2026-10-30) leaves a result position's host
  // unknown when Serper's `/resolve` cannot open it. keyword-rank-check then
  // declines to report a rank rather than report a possibly-wrong one. That
  // refusal is correct behaviour and must not be scored against the tool.
  const REFUSAL =
    'Google returned opaque redirect links for result position(s) 4, 5, 6 and Serper\'s link ' +
    "resolution did not return a real URL for them (Serper /resolve returned HTTP 503.). " +
    'Those positions could be "mysite.example", so no ranking is reported rather than a ' +
    "possibly wrong one. Retry shortly; this is a transient upstream condition.";

  it("is upstream_transient, not capability_bug or unknown", () => {
    const result = classifyFailure(REFUSAL, false, false, "known_answer", {});
    expect(result.verdict).toBe("upstream_transient");
  });

  it("is still upstream_transient when no vendor error was appended", () => {
    const result = classifyFailure(
      "Google returned opaque redirect links for result position(s) 4 and Serper's link " +
        "resolution did not return a real URL for them. Retry shortly.",
      false, false, "schema_check", {},
    );
    expect(result.verdict).toBe("upstream_transient");
  });
});
