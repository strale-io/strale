/**
 * SCORING INTEGRITY RULES
 *
 * 1. SQS must reflect the user's reality.
 *    If a capability can't execute, the score must be low —
 *    regardless of WHY it can't execute.
 *
 * 2. Only genuine upstream failures are excluded.
 *    "Upstream" means: an external service that Strale does not control
 *    returned an error (timeout, rate limit, 5xx).
 *    Infrastructure misconfig (missing API keys, wrong env) is NOT
 *    upstream — it's Strale's responsibility.
 *
 * 3. No case-by-case exclusions.
 *    Adding patterns to EXTERNAL_SERVICE_PATTERNS to fix a specific
 *    capability's score is prohibited. New patterns must apply to a
 *    general class of external service failures.
 *
 * 4. Changes to this file require methodology review.
 *    Any PR touching scoring logic must be reviewed against the
 *    SQS Constitution before merging.
 */

import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth, testSuites } from "../db/schema.js";
import { computeQualityProfile, type QPResult } from "./quality-profile.js";
import { computeReliabilityProfile, type RPResult, type RPContext } from "./reliability-profile.js";
import { computeMatrixSQS, type MatrixSQSResult } from "./sqs-matrix.js";
import { MIN_RUNS, ROLLING_RUNS, RECENCY_WEIGHTS } from "./sqs-constants.js";
import { getCapabilityQuality } from "./quality-aggregation.js";
import { getTestResultsForSlug, type TestResultsData } from "./trust-helpers.js";

// ═══════════════════════════════════════════════════════════════════════════
// SQS SCORING — ARCHITECTURE NOTE
//
// This file contains TWO scoring models:
//
// 1. LEGACY: Single-composite 5-factor weighted model
//    - Entry: computeCapabilitySQS()
//    - Type: SQSResult
//    - Status: OBSOLETE for external use. Still called internally by
//      computeDualProfileSQS() to produce `legacy_score` for regression
//      comparison. Do NOT call directly from new code.
//
// 2. CURRENT: Dual-profile model (Quality Profile + Reliability Profile + Matrix)
//    - Entry: computeDualProfileSQS()
//    - Type: DualProfileSQSResult
//    - Status: CANONICAL. Used exclusively by all trust API endpoints.
//    - Depends on: quality-profile.ts, reliability-profile.ts, sqs-matrix.ts
//
// See Notion: "SQS Codebase Map — Legacy vs Current Architecture"
// See Notion: "SQS Constitution" for scoring philosophy
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ──────────────────────────────────────────────────────────────────

// LEGACY result type — kept for computeCapabilitySQS() which feeds legacy_score.
// New code should use DualProfileSQSResult.
export interface SQSResult {
  score: number;          // integer 0-100
  label: string;          // "Excellent" | "Good" | "Fair" | "Poor" | "Degraded" | "Pending"
  factors: {
    correctness: FactorResult;
    schema: FactorResult;
    availability: FactorResult;
    error_handling: FactorResult;
    edge_cases: FactorResult;
  };
  trend: "stable" | "improving" | "declining";
  circuit_breaker: boolean;
  external_service_issues: number;
  runs_analyzed: number;
  pending: boolean;
}

interface FactorResult {
  rate: number;
  passed: number;
  total: number;
  weight: number;
  weighted_contribution: number;
  has_data: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** @deprecated Legacy weights — used only by computeCapabilitySQS() for legacy_score. */
const WEIGHTS = {
  correctness: 0.40,
  schema: 0.25,
  availability: 0.20,
  error_handling: 0.10,
  edge_cases: 0.05,
} as const;

const FACTOR_KEYS = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];

// MIN_RUNS, ROLLING_RUNS, RECENCY_WEIGHTS imported from sqs-constants.ts

// test_type → SQS factor mapping
const TYPE_TO_FACTOR: Record<string, keyof typeof WEIGHTS> = {
  known_answer: "correctness",
  known_bad: "correctness",
  piggyback: "correctness",
  regression: "correctness",
  schema_check: "schema",
  dependency_health: "availability",
  negative: "error_handling",
  edge_case: "edge_cases",
};

const EXTERNAL_SERVICE_PATTERNS = [
  /HTTP 408/i, /HTTP 429/i, /HTTP 5\d{2}/i,
  /Too Many Requests/i, /rate limit/i, /QUOTA_EXCEEDED/i,
  /ECONNRESET/i, /ECONNREFUSED/i, /ETIMEDOUT/i, /ENOTFOUND/i,
  /timeout/i, /upstream/i, /Browserless/i,
  /VIES error/i, /Navigation timeout/i,
  /fetch failed/i,
  /Etherscan/i, /etherscan\.io/i,
  /cloudflare-eth/i, /llamarpc/i,
  // NOTE: "no api key" and "is required for" are intentionally NOT here.
  // Missing API keys are Strale's infrastructure responsibility — the score
  // must reflect that the capability cannot serve users. See Scoring Integrity Rules.
];

function isExternalServiceFailure(reason: string | null): boolean {
  if (!reason) return false;
  return EXTERNAL_SERVICE_PATTERNS.some((p) => p.test(reason));
}

function scoreToLabel(score: number, pending: boolean, qualifier?: "building" | "unverified"): string {
  if (qualifier === "unverified") return "Unverified";
  if (qualifier === "building") return "Building track record";
  if (pending) return "Pending";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Poor";
  return "Degraded";
}

// ─── Cache (write-path only) ────────────────────────────────────────────────
// Used by test runner + refresh job when computing scores to persist to DB.
// Read-path endpoints use DB columns and don't call these functions.

const SQS_CACHE_TTL_MS = 10 * 60 * 1000;
const sqsCache = new Map<string, { data: SQSResult; expiresAt: number }>();

function getCachedSQS(key: string): SQSResult | null {
  const entry = sqsCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { sqsCache.delete(key); return null; }
  return entry.data;
}

function setCachedSQS(key: string, data: SQSResult): void {
  sqsCache.set(key, { data, expiresAt: Date.now() + SQS_CACHE_TTL_MS });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEGACY SINGLE-COMPOSITE MODEL
// Used ONLY by computeDualProfileSQS() for the legacy_score field.
// Do NOT call these functions from any endpoint or new code.
// The canonical scoring model is dual-profile (QP/RP + matrix).
// Read-path endpoints use DB columns; these functions are write-path only.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @deprecated Used only by computeDualProfileSQS() for legacy_score regression tracking.
 * Do NOT call directly — use computeDualProfileSQS() for the write path,
 * or read from DB columns (matrixSqs, qpScore, rpScore, trend) for the read path.
 */
export async function computeCapabilitySQS(slug: string): Promise<SQSResult> {
  const cacheKey = `sqs:cap:${slug}`;
  const cached = getCachedSQS(cacheKey);
  if (cached) return cached;

  const db = getDb();

  // ── Check for "Unverified" state ──────────────────────────────────────
  // If ALL active test suites are infra_limited or quarantined, the capability
  // is structurally untestable — return Unverified.
  const activeSuites = await db
    .select({ id: testSuites.id })
    .from(testSuites)
    .where(and(
      eq(testSuites.capabilitySlug, slug),
      eq(testSuites.active, true),
      inArray(testSuites.testStatus, ["normal", "env_dependent", "upstream_broken"]),
    ))
    .limit(1);

  if (activeSuites.length === 0) {
    // Check if there are ANY active suites at all (to distinguish "no suites" from "all excluded")
    const anySuites = await db
      .select({ id: testSuites.id })
      .from(testSuites)
      .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
      .limit(1);

    if (anySuites.length > 0) {
      const result = makeUnverifiedResult();
      setCachedSQS(cacheKey, result);
      return result;
    }
    // No suites at all — standard pending
    const result = makePendingResult(0);
    setCachedSQS(cacheKey, result);
    return result;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  // Get the last N distinct run windows for this capability
  // Exclude test suites that are infra_limited or quarantined
  const runWindows = await db.execute(sql`
    SELECT DISTINCT DATE_TRUNC('minute', tr.executed_at) AS run_window
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${cutoff}::timestamptz
      AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    ORDER BY run_window DESC
    LIMIT ${ROLLING_RUNS}
  `);

  const windows = (Array.isArray(runWindows) ? runWindows : (runWindows as any)?.rows ?? []) as any[];

  if (windows.length < MIN_RUNS) {
    // "Building track record" if we have some data but not enough
    if (windows.length > 0) {
      const result = makeBuildingTrackRecordResult(windows.length);
      setCachedSQS(cacheKey, result);
      return result;
    }
    const result = makePendingResult(windows.length);
    setCachedSQS(cacheKey, result);
    return result;
  }

  // Map window timestamps to run indices (0 = most recent)
  const windowIndexMap = new Map<number, number>();
  for (let i = 0; i < windows.length; i++) {
    windowIndexMap.set(new Date(windows[i].run_window).getTime(), i);
  }

  const oldestWindow = windows[windows.length - 1].run_window;

  // Get all test results with run_window
  // Exclude: infra_limited/quarantined suites, and classified noise failures
  const rows = await db.execute(sql`
    SELECT
      ts.test_type,
      tr.passed,
      tr.failure_reason,
      DATE_TRUNC('minute', tr.executed_at) AS run_window
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND DATE_TRUNC('minute', tr.executed_at) >= ${oldestWindow}::timestamptz
      AND tr.executed_at >= ${cutoff}::timestamptz
      AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
      AND (
        tr.passed = true
        OR tr.failure_classification IS NULL
        OR tr.failure_classification NOT IN ('test_infrastructure', 'stale_input')
      )
  `);

  const testRows = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as any[];

  // Get circuit breaker consecutive failures
  const [health] = await db
    .select({ consecutiveFailures: capabilityHealth.consecutiveFailures })
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  const result = computeFromRows(
    testRows,
    windows.length,
    windowIndexMap,
    health?.consecutiveFailures ?? 0,
  );
  setCachedSQS(cacheKey, result);
  return result;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

interface TestRow {
  test_type: string;
  passed: boolean;
  failure_reason: string | null;
  run_window: any;
}

interface FactorAccum {
  weightedPassed: number;
  weightedTotal: number;
  passed: number;
  total: number;
}

// LEGACY helper — accumulates the old 5-factor model. Used by computeCapabilitySQS().
function computeFromRows(
  testRows: TestRow[],
  runsAnalyzed: number,
  windowIndexMap: Map<number, number>,
  cbConsecutiveFailures: number,
): SQSResult {
  const accum: Record<keyof typeof WEIGHTS, FactorAccum> = {
    correctness: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    schema: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    availability: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    error_handling: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    edge_cases: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
  };

  let externalServiceIssues = 0;

  // Track external service failures per factor so we can fall back
  // to counting them as failures when a factor has zero real data
  const externalPerFactor: Record<keyof typeof WEIGHTS, { count: number; weightedTotal: number }> = {
    correctness: { count: 0, weightedTotal: 0 },
    schema: { count: 0, weightedTotal: 0 },
    availability: { count: 0, weightedTotal: 0 },
    error_handling: { count: 0, weightedTotal: 0 },
    edge_cases: { count: 0, weightedTotal: 0 },
  };

  // Per-window pass tracking for trend computation
  const windowPassed = new Map<number, number>();
  const windowTotal = new Map<number, number>();

  for (const row of testRows) {
    const factor = TYPE_TO_FACTOR[row.test_type];
    if (!factor) continue;

    const runIndex = windowIndexMap.get(new Date(row.run_window).getTime()) ?? -1;
    if (runIndex < 0) continue;

    const recencyWeight = RECENCY_WEIGHTS[runIndex] ?? 0.30;

    if (row.passed) {
      accum[factor].weightedPassed += recencyWeight;
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].passed++;
      accum[factor].total++;
      windowPassed.set(runIndex, (windowPassed.get(runIndex) ?? 0) + 1);
      windowTotal.set(runIndex, (windowTotal.get(runIndex) ?? 0) + 1);
    } else if (isExternalServiceFailure(row.failure_reason)) {
      externalServiceIssues++;
      externalPerFactor[factor].count++;
      externalPerFactor[factor].weightedTotal += recencyWeight;
    } else {
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].total++;
      windowTotal.set(runIndex, (windowTotal.get(runIndex) ?? 0) + 1);
    }
  }

  // For factors with zero real data but external-service-only failures,
  // count those failures so the factor registers as "has data" (at 0% rate)
  // rather than hiding behind "Building track record".
  for (const key of FACTOR_KEYS) {
    if (accum[key].total === 0 && externalPerFactor[key].count > 0) {
      accum[key].total = externalPerFactor[key].count;
      accum[key].weightedTotal = externalPerFactor[key].weightedTotal;
      // passed stays 0 — rate will be 0%
    }
  }

  // "Building track record" if not all 5 factors have test data yet
  const allFactorsHaveData = FACTOR_KEYS.every((k) => accum[k].total > 0);
  if (!allFactorsHaveData) {
    return makeBuildingTrackRecordResult(runsAnalyzed);
  }

  // Build factors — exclude missing factors, re-weight proportionally
  let activeWeightSum = 0;
  for (const key of FACTOR_KEYS) {
    if (accum[key].weightedTotal > 0) activeWeightSum += WEIGHTS[key];
  }

  const factors: SQSResult["factors"] = {} as any;
  for (const key of FACTOR_KEYS) {
    const a = accum[key];
    if (a.weightedTotal > 0) {
      const rate = Math.round((a.weightedPassed / a.weightedTotal) * 1000) / 10;
      const normalizedWeight = WEIGHTS[key] / activeWeightSum;
      factors[key] = {
        rate,
        passed: a.passed,
        total: a.total,
        weight: Math.round(normalizedWeight * 1000) / 1000,
        weighted_contribution: Math.round(rate * normalizedWeight * 10) / 10,
        has_data: true,
      };
    } else {
      factors[key] = {
        rate: 0, passed: 0, total: 0,
        weight: 0, weighted_contribution: 0, has_data: false,
      };
    }
  }

  let score = Math.round(
    Object.values(factors).reduce((s, f) => s + f.weighted_contribution, 0) * 10,
  ) / 10;

  // ── Circuit breaker penalties ──────────────────────────────────────────
  let circuitBreakerActive = false;

  // Sort non-upstream test results by recency for pattern detection
  const nonUpstreamRows = testRows
    .filter((r) => TYPE_TO_FACTOR[r.test_type] && !isExternalServiceFailure(r.failure_reason))
    .sort((a, b) => new Date(b.run_window).getTime() - new Date(a.run_window).getTime());

  // Trigger 1: 3 consecutive total execution failures → score = max(computed − 30, 20)
  if (cbConsecutiveFailures >= 3) {
    score = Math.max(score - 30, 20);
    circuitBreakerActive = true;
  }

  // Trigger 2: 5 consecutive correctness test failures → score = max(computed − 20, 30)
  const correctnessRows = nonUpstreamRows.filter(
    (r) => TYPE_TO_FACTOR[r.test_type] === "correctness",
  );
  if (correctnessRows.length >= 5 && correctnessRows.slice(0, 5).every((r) => !r.passed)) {
    score = Math.max(score - 20, 30);
    circuitBreakerActive = true;
  }

  // Trigger 3: Schema break (latest schema_check failed) → score = max(computed − 15, 40)
  const schemaRows = nonUpstreamRows.filter(
    (r) => TYPE_TO_FACTOR[r.test_type] === "schema",
  );
  if (schemaRows.length > 0 && !schemaRows[0].passed) {
    score = Math.max(score - 15, 40);
    circuitBreakerActive = true;
  }

  // Recovery: 3 consecutive passes clear the penalty
  if (circuitBreakerActive && nonUpstreamRows.length >= 3) {
    if (nonUpstreamRows.slice(0, 3).every((r) => r.passed)) {
      circuitBreakerActive = false;
      // Re-compute base score without penalties
      score = Math.round(
        Object.values(factors).reduce((s, f) => s + f.weighted_contribution, 0) * 10,
      ) / 10;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  // ── Trend: compare last 5 vs previous 5 windows ───────────────────────
  const trend = computeTrend(windowPassed, windowTotal, runsAnalyzed);

  return {
    score,
    label: scoreToLabel(score, false),
    factors,
    trend,
    circuit_breaker: circuitBreakerActive,
    external_service_issues: externalServiceIssues,
    runs_analyzed: runsAnalyzed,
    pending: false,
  };
}

function computeTrend(
  windowPassed: Map<number, number>,
  windowTotal: Map<number, number>,
  runsAnalyzed: number,
): "stable" | "improving" | "declining" {
  if (runsAnalyzed < 6) return "stable";

  let recentSum = 0, recentCount = 0;
  let olderSum = 0, olderCount = 0;
  let recentFailures = 0;

  for (let i = 0; i < Math.min(runsAnalyzed, 10); i++) {
    const total = windowTotal.get(i) ?? 0;
    if (total === 0) continue;
    const passed = windowPassed.get(i) ?? 0;
    const rate = (passed / total) * 100;
    if (i < 5) {
      recentSum += rate;
      recentCount++;
      recentFailures += (total - passed);
    } else {
      olderSum += rate;
      olderCount++;
    }
  }

  if (recentCount === 0 || olderCount === 0) return "stable";

  const diff = (recentSum / recentCount) - (olderSum / olderCount);
  if (diff > 5) return "improving";
  // Require both a significant rate drop AND minimum 3 failures in recent window.
  // This prevents 1-2 test failures at a high-pass-rate capability from triggering
  // "declining" — single failures are noise, not signal. (DEC-20260320-J)
  if (diff < -5 && recentFailures >= 3) return "declining";
  return "stable";
}

function aggregateFactor(
  stepScores: SQSResult[],
  factor: keyof SQSResult["factors"],
  totalTests: number,
): FactorResult {
  const weight = WEIGHTS[factor];
  let weightedRate = 0;
  let totalPassed = 0;
  let totalCount = 0;
  let anyHasData = false;

  for (const step of stepScores) {
    const f = step.factors[factor];
    const stepTests = Object.values(step.factors).reduce((a, x) => a + x.total, 0);
    const stepWeight = Math.max(stepTests, 1) / totalTests;
    weightedRate += f.rate * stepWeight;
    totalPassed += f.passed;
    totalCount += f.total;
    if (f.has_data) anyHasData = true;
  }

  const rate = Math.round(weightedRate * 10) / 10;
  return {
    rate,
    passed: totalPassed,
    total: totalCount,
    weight,
    weighted_contribution: Math.round(rate * weight * 10) / 10,
    has_data: anyHasData,
  };
}

/**
 * Estimate how long until a capability qualifies for a real SQS score.
 * Returns null if already qualified, otherwise an estimate string like "~18h".
 */
export async function estimateQualificationTime(slug: string): Promise<string | null> {
  const db = getDb();

  // Count distinct test types that have at least one test suite
  const factorCoverage = await db.execute(sql`
    SELECT DISTINCT ts.test_type
    FROM test_suites ts
    WHERE ts.capability_slug = ${slug} AND ts.active = true
  `);
  const testTypes = (Array.isArray(factorCoverage) ? factorCoverage : (factorCoverage as any)?.rows ?? []) as any[];
  const coveredFactors = new Set<string>();
  for (const row of testTypes) {
    const factor = TYPE_TO_FACTOR[row.test_type];
    if (factor) coveredFactors.add(factor);
  }

  // Count existing test runs
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const runCountResult = await db.execute(sql`
    SELECT COUNT(DISTINCT DATE_TRUNC('minute', executed_at)) AS run_count
    FROM test_results
    WHERE capability_slug = ${slug}
      AND executed_at >= ${cutoff}::timestamptz
  `);
  const runRows = (Array.isArray(runCountResult) ? runCountResult : (runCountResult as any)?.rows ?? []) as any[];
  const existingRuns = Number(runRows[0]?.run_count ?? 0);

  const allFactorsCovered = FACTOR_KEYS.every((k) => coveredFactors.has(k));

  // Already qualified
  if (allFactorsCovered && existingRuns >= MIN_RUNS) return null;

  // Estimate: scheduler runs tier A every 6h, tier B every 24h, tier C every 72h.
  // Most capabilities have a mix. Conservative estimate: one run per 6h cycle.
  const runsNeeded = Math.max(MIN_RUNS - existingRuns, 0);
  const hoursForRuns = runsNeeded * 6;

  // If missing factor coverage, add time for next scheduled test generation
  const missingFactors = FACTOR_KEYS.filter((k) => !coveredFactors.has(k));
  const hoursForFactors = missingFactors.length > 0 ? 6 : 0; // assume next cycle picks them up

  const totalHours = Math.max(hoursForRuns, hoursForFactors);

  if (totalHours === 0) return "< 6h";
  return `~${totalHours}h`;
}

function makePendingResult(runsAnalyzed = 0): SQSResult {
  const makePendingFactor = (weight: number): FactorResult => ({
    rate: 0, passed: 0, total: 0,
    weight, weighted_contribution: 0, has_data: false,
  });

  return {
    score: 0,
    label: "Pending",
    factors: {
      correctness: makePendingFactor(WEIGHTS.correctness),
      schema: makePendingFactor(WEIGHTS.schema),
      availability: makePendingFactor(WEIGHTS.availability),
      error_handling: makePendingFactor(WEIGHTS.error_handling),
      edge_cases: makePendingFactor(WEIGHTS.edge_cases),
    },
    trend: "stable",
    circuit_breaker: false,
    external_service_issues: 0,
    runs_analyzed: runsAnalyzed,
    pending: true,
  };
}

function makeBuildingTrackRecordResult(runsAnalyzed = 0): SQSResult {
  const makeFactor = (weight: number): FactorResult => ({
    rate: 0, passed: 0, total: 0,
    weight, weighted_contribution: 0, has_data: false,
  });

  return {
    score: 0,
    label: "Building track record",
    factors: {
      correctness: makeFactor(WEIGHTS.correctness),
      schema: makeFactor(WEIGHTS.schema),
      availability: makeFactor(WEIGHTS.availability),
      error_handling: makeFactor(WEIGHTS.error_handling),
      edge_cases: makeFactor(WEIGHTS.edge_cases),
    },
    trend: "stable",
    circuit_breaker: false,
    external_service_issues: 0,
    runs_analyzed: runsAnalyzed,
    pending: true, // Frontend treats this like pending
  };
}

// D-3: computeLegacySQS alias removed — no callers found. Use computeCapabilitySQS directly.

// ─── CURRENT: Dual-Profile SQS (CANONICAL) ──────────────────────────────
// THE production scoring entry point. All trust API endpoints use this.
// Computes QP (quality-profile.ts) + RP (reliability-profile.ts),
// combines via matrix (sqs-matrix.ts), and includes legacy_score for comparison.

// CURRENT — the canonical result type for all SQS computations.
export interface DualProfileSQSResult {
  /** Matrix SQS score (0-100, the new canonical score) */
  score: number;
  label: string;
  qp: QPResult;
  rp: RPResult;
  matrix: MatrixSQSResult;
  /** Legacy SQS for comparison during transition */
  legacy_score: number;
}

// In-process cache for dual-profile SQS (same TTL as legacy SQS cache)
const dualCache = new Map<string, { data: DualProfileSQSResult; expiresAt: number }>();

/**
 * Compute dual-profile SQS for a single capability. (CURRENT — canonical entry point)
 * Returns QP, RP, and the matrix-combined score.
 */
export async function computeDualProfileSQS(
  slug: string,
  prefetchedTestResults?: TestResultsData,
): Promise<DualProfileSQSResult> {
  const cacheKey = `dual:${slug}`;
  const cached = dualCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) return cached.data;

  // Fetch RP context data in parallel with QP and legacy
  // If test results are pre-fetched (batch callers), skip the per-slug query
  const [qp, legacy, testResultsData, qualityMetrics] = await Promise.all([
    computeQualityProfile(slug),
    computeCapabilitySQS(slug),
    prefetchedTestResults ? Promise.resolve(prefetchedTestResults) : getTestResultsForSlug(slug),
    getCapabilityQuality(slug),
  ]);

  // Build RP context from fetched data
  const rpContext: RPContext = {
    history30d: testResultsData.history_30d ?? [],
    p95ResponseTimeMs: qualityMetrics.p95ResponseTimeMs,
  };

  const rp = await computeReliabilityProfile(slug, rpContext);

  const matrix = computeMatrixSQS(qp, rp);

  const result: DualProfileSQSResult = {
    score: matrix.score,
    label: matrix.label,
    qp,
    rp,
    matrix,
    legacy_score: legacy.score,
  };

  dualCache.set(cacheKey, { data: result, expiresAt: Date.now() + SQS_CACHE_TTL_MS });
  return result;
}

// Re-export profile types for consumers
export type { QPResult, RPResult, MatrixSQSResult };

function makeUnverifiedResult(): SQSResult {
  const makeFactor = (weight: number): FactorResult => ({
    rate: 0, passed: 0, total: 0,
    weight, weighted_contribution: 0, has_data: false,
  });

  return {
    score: 0,
    label: "Unverified",
    factors: {
      correctness: makeFactor(WEIGHTS.correctness),
      schema: makeFactor(WEIGHTS.schema),
      availability: makeFactor(WEIGHTS.availability),
      error_handling: makeFactor(WEIGHTS.error_handling),
      edge_cases: makeFactor(WEIGHTS.edge_cases),
    },
    trend: "stable",
    circuit_breaker: false,
    external_service_issues: 0,
    runs_analyzed: 0,
    pending: true,
  };
}
