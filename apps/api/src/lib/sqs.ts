import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth, testSuites } from "../db/schema.js";
import { computeQualityProfile, type QPResult } from "./quality-profile.js";
import { computeReliabilityProfile, type RPResult, type RPContext } from "./reliability-profile.js";
import { computeMatrixSQS, type MatrixSQSResult } from "./sqs-matrix.js";
import { MIN_RUNS, ROLLING_RUNS, RECENCY_WEIGHTS } from "./sqs-constants.js";
import { getCapabilityQuality } from "./quality-aggregation.js";
import { getTestResultsForSlug } from "./trust-helpers.js";

// ─── Types ──────────────────────────────────────────────────────────────────

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
  piggyback: "correctness",
  regression: "correctness",
  schema_check: "schema",
  dependency_health: "availability",
  negative: "error_handling",
  edge_case: "edge_cases",
};

const EXTERNAL_SERVICE_PATTERNS = [
  /HTTP 429/i, /HTTP 503/i, /HTTP 502/i,
  /Too Many Requests/i, /rate limit/i,
  /ECONNRESET/i, /ECONNREFUSED/i, /ETIMEDOUT/i,
  /timeout/i, /upstream/i, /Browserless/i,
  /VIES error/i, /Navigation timeout/i,
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

// ─── Cache ──────────────────────────────────────────────────────────────────

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

// ─── Core computation ───────────────────────────────────────────────────────

/**
 * Compute SQS for a single capability.
 * Uses rolling 10-run window with recency-weighted scoring.
 * Returns pending until all 5 factors have data and >= 5 runs exist.
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
        OR tr.failure_classification IN ('upstream_degraded', 'upstream_changed', 'capability_bug')
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

/**
 * Compute SQS for a solution — floor-aware weighted average of step scores.
 * Score cannot exceed lowest step SQS + 20.
 */
export async function computeSolutionSQS(
  stepSlugs: string[],
): Promise<SQSResult> {
  const cacheKey = `sqs:sol:${stepSlugs.sort().join(",")}`;
  const cached = getCachedSQS(cacheKey);
  if (cached) return cached;

  const stepScores = await Promise.all(
    stepSlugs.map((slug) => computeCapabilitySQS(slug)),
  );

  // If any step is Unverified, the solution is Unverified
  if (stepScores.some((s) => s.label === "Unverified")) {
    const result = makeUnverifiedResult();
    setCachedSQS(cacheKey, result);
    return result;
  }

  // If any step is Building track record, the solution is Building track record
  if (stepScores.some((s) => s.label === "Building track record")) {
    const result = makeBuildingTrackRecordResult(0);
    setCachedSQS(cacheKey, result);
    return result;
  }

  // If any step is pending, the solution is pending
  if (stepScores.some((s) => s.pending)) {
    const result = makePendingResult(0);
    setCachedSQS(cacheKey, result);
    return result;
  }

  // Weighted average by test count per step
  const totalTests = stepScores.reduce((s, r) => {
    const factorTests = Object.values(r.factors).reduce((a, f) => a + f.total, 0);
    return s + Math.max(factorTests, 1);
  }, 0);

  // Aggregate each factor across steps (weighted by test count)
  const factors: SQSResult["factors"] = {
    correctness: aggregateFactor(stepScores, "correctness", totalTests),
    schema: aggregateFactor(stepScores, "schema", totalTests),
    availability: aggregateFactor(stepScores, "availability", totalTests),
    error_handling: aggregateFactor(stepScores, "error_handling", totalTests),
    edge_cases: aggregateFactor(stepScores, "edge_cases", totalTests),
  };

  let score = Object.values(factors).reduce((s, f) => s + f.weighted_contribution, 0);
  score = Math.round(score * 10) / 10;

  // Floor-aware cap: score cannot exceed lowest step SQS + 20
  const lowestStepScore = Math.min(...stepScores.map((s) => s.score));
  const floorCap = lowestStepScore + 20;
  if (score > floorCap) score = floorCap;

  score = Math.max(0, Math.min(100, score));

  const externalServiceIssues = stepScores.reduce((s, r) => s + r.external_service_issues, 0);
  const runsAnalyzed = Math.min(...stepScores.map((s) => s.runs_analyzed));

  // Solution trend: majority of step trends
  const trendCounts = { improving: 0, declining: 0, stable: 0 };
  for (const s of stepScores) trendCounts[s.trend]++;
  const trend: SQSResult["trend"] =
    trendCounts.improving > trendCounts.declining && trendCounts.improving > trendCounts.stable
      ? "improving"
      : trendCounts.declining > trendCounts.improving && trendCounts.declining > trendCounts.stable
        ? "declining"
        : "stable";

  // Solution circuit_breaker: true if any step has active penalty
  const circuitBreaker = stepScores.some((s) => s.circuit_breaker);

  const result: SQSResult = {
    score,
    label: scoreToLabel(score, false),
    factors,
    trend,
    circuit_breaker: circuitBreaker,
    external_service_issues: externalServiceIssues,
    runs_analyzed: runsAnalyzed,
    pending: false,
  };

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
    } else {
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].total++;
      windowTotal.set(runIndex, (windowTotal.get(runIndex) ?? 0) + 1);
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

  for (let i = 0; i < Math.min(runsAnalyzed, 10); i++) {
    const total = windowTotal.get(i) ?? 0;
    if (total === 0) continue;
    const rate = ((windowPassed.get(i) ?? 0) / total) * 100;
    if (i < 5) { recentSum += rate; recentCount++; }
    else { olderSum += rate; olderCount++; }
  }

  if (recentCount === 0 || olderCount === 0) return "stable";

  const diff = (recentSum / recentCount) - (olderSum / olderCount);
  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
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

// ─── Dual-profile SQS ──────────────────────────────────────────────────────

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
 * Compute dual-profile SQS for a single capability.
 * Returns QP, RP, and the matrix-combined score.
 */
export async function computeDualProfileSQS(slug: string): Promise<DualProfileSQSResult> {
  const cacheKey = `dual:${slug}`;
  const cached = dualCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) return cached.data;

  // Fetch RP context data in parallel with QP and legacy
  const [qp, legacy, testResultsData, qualityMetrics] = await Promise.all([
    computeQualityProfile(slug),
    computeCapabilitySQS(slug),
    getTestResultsForSlug(slug),
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
