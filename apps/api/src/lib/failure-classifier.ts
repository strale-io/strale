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
 */
export function classifyFailure(
  failureReason: string | null,
  executionSucceeded: boolean,
  validationFailed: boolean,
  testType: string,
  testInput: Record<string, unknown>,
  previouslyPassed = false,
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
    return {
      verdict: "upstream_transient",
      confidence: "high",
      reason: `External service issue: ${truncate(reason, 120)}`,
    };
  }

  // ── 3. UPSTREAM_CHANGED / TEST_DESIGN ──────────────────────────────────
  // Execution succeeded but validation failed — either the API changed or test is wrong
  if (executionSucceeded && validationFailed) {
    if (previouslyPassed) {
      return {
        verdict: "upstream_changed",
        confidence: "medium",
        reason: `Validation failed on previously-passing test: ${truncate(reason, 120)}`,
      };
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

  // ── 5. STALE_INPUT ─────────────────────────────────────────────────────
  // Input contains expired temporal data (past dates/years)
  if (hasStaleInput(testInput)) {
    return {
      verdict: "stale_input",
      confidence: "medium",
      reason: `Test input contains expired date/year: ${truncate(reason, 120)}`,
    };
  }

  // ── 6. UNKNOWN ─────────────────────────────────────────────────────────
  return {
    verdict: "unknown",
    confidence: "low",
    reason: truncate(reason, 200) || "No failure reason provided",
  };
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
