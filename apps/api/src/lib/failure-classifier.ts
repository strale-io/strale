/**
 * Failure Classification Engine — Adaptive Test Intelligence
 *
 * Classifies every failed test result into one of 7 verdicts so that:
 *   - SQS excludes noise (infra/transient/stale) and counts real signal
 *   - Health sweeps can promote transient → degraded over time
 *   - Dashboards show actionable failure breakdowns
 *
 * Classification precedence (checked in order):
 *   1. test_infrastructure — missing env vars, quota, geo-restriction
 *   2. upstream_transient  — external service temporarily unavailable
 *   3. upstream_changed / test_design — execution OK but validation failed
 *   4. capability_bug      — internal code errors
 *   5. stale_input          — expired dates/years in test input
 *   6. unknown              — none of the above matched
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type FailureClassification =
  | "upstream_transient"
  | "upstream_degraded"
  | "upstream_changed"
  | "test_infrastructure"
  | "test_design"
  | "capability_bug"
  | "stale_input"
  | "unknown";

export interface ClassificationResult {
  verdict: FailureClassification;
  confidence: "high" | "medium" | "low";
  reason: string;
}

// ─── Pattern sets ───────────────────────────────────────────────────────────

const INFRA_ENV_PATTERNS = [
  /COMPANIES_HOUSE_API_KEY/i,
  /SERPER_API_KEY/i,
  /ANTHROPIC_API_KEY/i,
  /PAGESPEED_API_KEY/i,
  /AVIATIONSTACK_API_KEY/i,
  /ADZUNA_APP_ID/i,
  /OPENSANCTIONS_API_KEY/i,
  /BROWSERLESS_URL/i,
  /missing.*api.*key/i,
  /no api key/i,
  /env.*not.*set/i,
  /api.?key.*required/i,
  /api.?key.*not.*configured/i,
  /subscription.?required/i,
  /HTTP 401.*api key/i,                   // API rejecting due to missing key
  /HTTP 401.*unauthorized.*key/i,
  /is required for/i,                      // "SERPER_API_KEY is required for..."
];

const INFRA_QUOTA_PATTERNS = [
  /quota.?exceeded/i,
  /billing/i,
  /subscription required/i,
  /account.*limit/i,
];

const INFRA_GEO_PATTERNS = [
  /geo.?restrict/i,
  /not available in your region/i,
  /ECB.*restrict/i,
];

// Browserless billing/quota (our infrastructure) — NOT target site failures.
// Browserless 500 and navigation timeouts go to upstream_transient below.
const INFRA_BROWSERLESS_PATTERNS = [
  /Browserless.*HTTP 401/i,        // quota exhausted ("units usage limit")
  /Browserless.*HTTP 403/i,        // auth/billing issue
  /units.*usage.*limit/i,          // "You've reached the units usage limit"
  /upgrade to a paid plan/i,       // Browserless free-plan messaging
];

const UPSTREAM_TRANSIENT_PATTERNS = [
  /HTTP 429/i,
  /HTTP 502/i,
  /HTTP 503/i,
  /HTTP 504/i,
  /Too Many Requests/i,
  /rate limit/i,
  /service unavailable/i,
  /temporarily unavailable/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /timeout/i,
  /fetch failed/i,
  /socket hang up/i,
  /network error/i,
  /aborted/i,
  /UNABLE_TO_GET_ISSUER_CERT/i,
  /Connection error/i,             // generic connection failure to external service
  /VIES error: MS_MAX_CONCURRENT/i, // EU VAT validation service rate limit
  /VIES error: MS_UNAVAILABLE/i,   // VIES member state server down
  /VIES error: SERVER_BUSY/i,      // VIES server overloaded
  /VIES error: GLOBAL_MAX_CONCURRENT/i, // VIES overall rate limit
  // Browserless forwarding target-site failures (not Browserless billing):
  /Browserless.*HTTP 5\d\d/i,      // target site loading failure (Browserless wraps it)
  /Browserless.*error/i,           // generic Browserless error (usually target site)
  /Navigation timeout/i,           // target site too slow to respond
  /ERR_CERT/i,                     // target site SSL certificate issue
  /ERR_NAME_NOT_RESOLVED/i,        // target site DNS failure
  /net::ERR_/i,                    // any Chromium network error from target site
];

const CAPABILITY_BUG_PATTERNS = [
  /No executor registered/i,
  /TypeError/i,
  /ReferenceError/i,
  /Cannot read properties/i,
  /is not a function/i,
  /unexpected token/i,
  /SyntaxError/i,
  /RangeError/i,
  /Maximum call stack/i,
  /JSON\.parse/i,                  // JSON parse failures (LLM response extraction)
  /Unexpected end of JSON/i,
  /Invalid JSON/i,
];

// Executor-thrown input validation errors — test sent bad input, executor correctly rejected it.
// These are test_design issues (the negative/edge_case test worked as intended).
const INPUT_REJECTION_PATTERNS = [
  /Missing required input field/i,
  /Missing required field/i,
  /required.*field/i,
  /invalid input/i,
  /must provide/i,
  /is required/i,
  /expected.*string.*got/i,
  /expected.*number.*got/i,
];

// Upstream returned empty/HTML instead of expected data — transient
const UPSTREAM_EMPTY_PATTERNS = [
  /Empty response/i,
  /No data returned/i,
  /No results found/i,
  /<!DOCTYPE/i,                   // HTML error page instead of JSON
  /<html/i,                       // HTML error page
  /Unexpected token.*</i,         // JSON.parse on HTML
  /unexpected.*<.*position 0/i,   // JSON.parse on HTML at position 0
];

// Upstream API returned data but specific fields are wrong/missing
const VALIDATION_ASSERTION_PATTERNS = [
  /expected non-null/i,           // field was null when guaranteed
  /expected true, got false/i,    // boolean assertion failed
  /expected false, got true/i,
  /expected.*got/i,               // generic value mismatch
  /not_null.*failed/i,
];

const DATE_FIELD_PATTERNS = /year|date|from_date|to_date|check_date|expires|valid_until|expiry/i;

// ─── Classifier ─────────────────────────────────────────────────────────────

/**
 * Classify a test failure into one of 7 verdicts.
 *
 * @param failureReason  - The error/failure message string
 * @param executionSucceeded - True if the capability returned a result (no throw)
 * @param validationFailed   - True if the result was returned but checks didn't pass
 * @param testType           - The test type (schema_check, known_answer, etc.)
 * @param testInput          - The test input object (checked for stale dates)
 * @param previouslyPassed   - True if this test suite has passed before (from last_classification)
 * @param capabilityType     - The capability type (deterministic, stable_api, scraping, ai_assisted)
 */
export function classifyFailure(
  failureReason: string | null,
  executionSucceeded: boolean,
  validationFailed: boolean,
  testType: string,
  testInput: Record<string, unknown>,
  previouslyPassed = false,
  capabilityType?: string,
): ClassificationResult {
  const reason = failureReason ?? "";

  // ── 1. TEST_INFRASTRUCTURE ─────────────────────────────────────────────
  // Missing env vars, quota, geo-restriction, Browserless infra issues
  if (matchesAny(reason, INFRA_ENV_PATTERNS)) {
    return {
      verdict: "test_infrastructure",
      confidence: "high",
      reason: `Missing environment variable or API key: ${truncate(reason, 120)}`,
    };
  }

  if (matchesAny(reason, INFRA_QUOTA_PATTERNS)) {
    return {
      verdict: "test_infrastructure",
      confidence: "high",
      reason: `Quota or billing issue: ${truncate(reason, 120)}`,
    };
  }

  if (matchesAny(reason, INFRA_GEO_PATTERNS)) {
    return {
      verdict: "test_infrastructure",
      confidence: "high",
      reason: `Geo-restricted API: ${truncate(reason, 120)}`,
    };
  }

  if (matchesAny(reason, INFRA_BROWSERLESS_PATTERNS)) {
    return {
      verdict: "test_infrastructure",
      confidence: "high",
      reason: `Browserless infrastructure issue: ${truncate(reason, 120)}`,
    };
  }

  // ── 2. UPSTREAM_TRANSIENT ──────────────────────────────────────────────
  // External service temporarily unavailable (timeouts, connection errors, 5xx)
  if (matchesAny(reason, UPSTREAM_TRANSIENT_PATTERNS)) {
    return validateByCapabilityType({
      verdict: "upstream_transient",
      confidence: "high",
      reason: `External service issue: ${truncate(reason, 120)}`,
    }, capabilityType);
  }

  // ── 3. UPSTREAM_CHANGED / TEST_DESIGN ──────────────────────────────────
  // Execution succeeded but validation failed — either the API changed or test is wrong
  if (executionSucceeded && validationFailed) {
    if (previouslyPassed) {
      return validateByCapabilityType({
        verdict: "upstream_changed",
        confidence: "medium",
        reason: `Validation failed on previously-passing test: ${truncate(reason, 120)}`,
      }, capabilityType);
    }
    return {
      verdict: "test_design",
      confidence: "medium",
      reason: `Validation failed (test has never passed): ${truncate(reason, 120)}`,
    };
  }

  // ── 4. CAPABILITY_BUG ─────────────────────────────────────────────────
  // Internal code errors — highest signal, fully counts against SQS
  if (!executionSucceeded && matchesAny(reason, CAPABILITY_BUG_PATTERNS)) {
    return {
      verdict: "capability_bug",
      confidence: "high",
      reason: `Internal code error: ${truncate(reason, 120)}`,
    };
  }

  // ── 5. INPUT REJECTION (test_design) ──────────────────────────────────
  // Executor correctly rejected invalid input — this is the test working as designed
  if (!executionSucceeded && matchesAny(reason, INPUT_REJECTION_PATTERNS)) {
    return {
      verdict: "test_design",
      confidence: "high",
      reason: `Executor rejected input (expected for negative/edge_case tests): ${truncate(reason, 120)}`,
    };
  }

  // ── 6. UPSTREAM EMPTY/HTML (upstream_transient) ─────────────────────
  // Upstream returned empty body, HTML error page, or unparseable response
  if (matchesAny(reason, UPSTREAM_EMPTY_PATTERNS)) {
    return validateByCapabilityType({
      verdict: "upstream_transient",
      confidence: "medium",
      reason: `Upstream returned empty or invalid response: ${truncate(reason, 120)}`,
    }, capabilityType);
  }

  // ── 7. VALIDATION ASSERTION FAILURES (upstream_changed) ──────────────
  // Execution succeeded but a specific field check failed (value wrong, field missing)
  // If not caught by the executionSucceeded && validationFailed check above,
  // these are from error messages that include assertion details
  if (matchesAny(reason, VALIDATION_ASSERTION_PATTERNS)) {
    if (previouslyPassed) {
      return validateByCapabilityType({
        verdict: "upstream_changed",
        confidence: "medium",
        reason: `Field assertion failed (was previously passing): ${truncate(reason, 120)}`,
      }, capabilityType);
    }
    return {
      verdict: "test_design",
      confidence: "medium",
      reason: `Field assertion failed (test has never passed): ${truncate(reason, 120)}`,
    };
  }

  // ── 8. STALE_INPUT ─────────────────────────────────────────────────────
  // Input contains expired temporal data (past dates/years)
  if (hasStaleInput(testInput)) {
    return {
      verdict: "stale_input",
      confidence: "medium",
      reason: `Test input contains expired date/year: ${truncate(reason, 120)}`,
    };
  }

  // ── 9. QUOTA_EXCEEDED fallback ──────────────────────────────────────────
  // Catch quota patterns that don't match exact INFRA_QUOTA phrasing
  if (/QUOTA_EXCEEDED/i.test(reason) || /limit.*exceeded/i.test(reason)) {
    return {
      verdict: "test_infrastructure",
      confidence: "medium",
      reason: `API quota exceeded: ${truncate(reason, 120)}`,
    };
  }

  // ── 10. UNKNOWN ────────────────────────────────────────────────────────
  return validateByCapabilityType({
    verdict: "unknown",
    confidence: "low",
    reason: truncate(reason, 200) || "No failure reason provided",
  }, capabilityType);
}

/**
 * Post-classification validation: deterministic capabilities (zero external
 * dependencies) should never be classified as upstream failures. If pattern
 * matching produced an upstream verdict for a deterministic capability,
 * reclassify it — the failure is internal by definition.
 */
function validateByCapabilityType(
  result: ClassificationResult,
  capabilityType?: string,
): ClassificationResult {
  if (capabilityType !== "deterministic") return result;

  if (result.verdict === "upstream_transient" || result.verdict === "upstream_degraded") {
    return {
      verdict: "capability_bug",
      confidence: "medium",
      reason: `Reclassified: deterministic capability cannot have upstream failures. Original: ${result.reason}`,
    };
  }

  if (result.verdict === "upstream_changed") {
    return {
      verdict: "test_design",
      confidence: "medium",
      reason: `Reclassified: deterministic capability output is code-controlled. Original: ${result.reason}`,
    };
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function hasStaleInput(input: Record<string, unknown>): boolean {
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  for (const [key, value] of Object.entries(input)) {
    if (!DATE_FIELD_PATTERNS.test(key)) continue;

    if (typeof value === "number" && value >= 2000 && value < currentYear) {
      return true;
    }

    if (typeof value === "string") {
      // Check YYYY format
      if (/^\d{4}$/.test(value) && parseInt(value, 10) < currentYear) {
        return true;
      }
      // Check YYYY-MM-DD or ISO date format
      if (/^\d{4}-\d{2}/.test(value) && value < today) {
        return true;
      }
    }
  }

  return false;
}
