/**
 * Reliability Profile (RP) — 4 operational factors measuring service dependability.
 *
 * Each factor answers a distinct sub-question about reliability:
 *   current_availability — Is it working RIGHT NOW? (latest test run pass rate)
 *   rolling_success      — What's the recent trend? (10-run recency-weighted average)
 *   upstream_health      — Are external dependencies healthy? (30-day health state)
 *   latency              — Is response time acceptable? (p95 vs type-specific thresholds)
 *
 * Factor weights vary by capability_type:
 *   deterministic:  current_availability 0.10, rolling_success 0.30, upstream_health 0.10, latency 0.50
 *   stable_api:     current_availability 0.30, rolling_success 0.30, upstream_health 0.25, latency 0.15
 *   scraping:       current_availability 0.35, rolling_success 0.30, upstream_health 0.25, latency 0.10
 *   ai_assisted:    current_availability 0.25, rolling_success 0.30, upstream_health 0.25, latency 0.20
 *
 * Circuit breaker penalties apply to RP only.
 * Upstream failures ARE counted as real failures (unlike QP which excludes them).
 */

import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth, testSuites, capabilities } from "../db/schema.js";
import { MIN_RUNS, ROLLING_RUNS, RECENCY_WEIGHTS } from "./sqs-constants.js";
import { computeHealthState, type HealthState } from "./health-state.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CapabilityType = "deterministic" | "stable_api" | "scraping" | "ai_assisted";

export interface RPFactor {
  score: number;    // 0-100
  weight: number;   // factor weight (type-specific)
  detail: string;   // human-readable explanation
  source: string;   // where this data comes from
}

export interface RPResult {
  score: number; // 0-100, weighted composite of the 4 factors
  grade: "A" | "B" | "C" | "D" | "F" | "pending";
  label: string;
  capability_type: CapabilityType;
  factors: {
    current_availability: RPFactor;
    rolling_success: RPFactor;
    upstream_health: RPFactor;
    latency: RPFactor;
  };
  trend: "stable" | "improving" | "declining";
  circuit_breaker: boolean;
  runs_analyzed: number;
  pending: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

type RPWeights = Record<"current_availability" | "rolling_success" | "upstream_health" | "latency", number>;

const RP_WEIGHTS: Record<CapabilityType, RPWeights> = {
  deterministic: {
    current_availability: 0.10,
    rolling_success: 0.30,
    upstream_health: 0.10,
    latency: 0.50,
  },
  stable_api: {
    current_availability: 0.30,
    rolling_success: 0.30,
    upstream_health: 0.25,
    latency: 0.15,
  },
  scraping: {
    current_availability: 0.35,
    rolling_success: 0.30,
    upstream_health: 0.25,
    latency: 0.10,
  },
  ai_assisted: {
    current_availability: 0.25,
    rolling_success: 0.30,
    upstream_health: 0.25,
    latency: 0.20,
  },
};

const FACTOR_KEYS = ["current_availability", "rolling_success", "upstream_health", "latency"] as const;
type RPFactorKey = typeof FACTOR_KEYS[number];

// Latency thresholds: p95 (ms) → score, per capability type
const LATENCY_THRESHOLDS: Record<CapabilityType, [number, number, number]> = {
  //                       excellent  good   acceptable
  deterministic: [100, 500, 2000],
  stable_api:    [1000, 3000, 10000],
  scraping:      [5000, 15000, 30000],
  ai_assisted:   [3000, 10000, 20000],
};

// Health state → score mapping
const HEALTH_STATE_SCORES: Record<HealthState, number> = {
  established: 100,
  stable: 100,
  recovering: 75,
  unstable: 50,
  new: 50,
};

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  return "F";
}

function gradeToLabel(grade: string): string {
  switch (grade) {
    case "A": return "Highly reliable";
    case "B": return "Reliable";
    case "C": return "Degraded reliability";
    case "D": return "Unreliable right now";
    case "F": return "Down";
    default: return "Reliability: pending";
  }
}

// ─── Latency scoring ────────────────────────────────────────────────────────

function scoreLatency(p95Ms: number | null, capType: CapabilityType): { score: number; detail: string } {
  if (p95Ms == null) {
    return { score: 80, detail: "No latency data" };
  }

  const [excellent, good, acceptable] = LATENCY_THRESHOLDS[capType];
  let score: number;
  let label: string;

  if (p95Ms < excellent) { score = 100; label = "Excellent"; }
  else if (p95Ms < good) { score = 85; label = "Normal"; }
  else if (p95Ms < acceptable) { score = 60; label = "Slow"; }
  else { score = 30; label = "Very slow"; }

  return { score, detail: `p95: ${Math.round(p95Ms)}ms (${label})` };
}

// ─── Core computation ───────────────────────────────────────────────────────

/**
 * Additional context needed by RP that isn't derivable from test results alone.
 * Passed in by computeDualProfileSQS to avoid duplicate DB queries.
 */
export interface RPContext {
  /** 30-day test history for health state computation */
  history30d: Array<{ date: string; pass_rate: number }>;
  /** p95 response time in ms from transaction_quality (null if no data) */
  p95ResponseTimeMs: number | null;
}

export async function computeReliabilityProfile(
  slug: string,
  context?: RPContext,
): Promise<RPResult> {
  const db = getDb();

  // Get capability_type
  const [cap] = await db
    .select({ capabilityType: capabilities.capabilityType })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  const capType = (cap?.capabilityType as CapabilityType) ?? "stable_api";

  // Check for testable suites
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
    return makePendingRP(0, capType);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  // ── Get test run windows (hour granularity) ────────────────────────────
  const rawWindows = await db.execute(sql`
    SELECT DATE_TRUNC('hour', tr.executed_at) AS run_window
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${cutoff}::timestamptz
      AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    GROUP BY DATE_TRUNC('hour', tr.executed_at)
    ORDER BY run_window DESC
    LIMIT ${ROLLING_RUNS}
  `);

  const windowRows = (
    Array.isArray(rawWindows) ? rawWindows : (rawWindows as any)?.rows ?? []
  ) as { run_window: any }[];

  if (windowRows.length < MIN_RUNS) {
    return makePendingRP(windowRows.length, capType);
  }

  // Map window timestamps to run indices (0 = most recent)
  const windowIndexMap = new Map<number, number>();
  for (let i = 0; i < windowRows.length; i++) {
    windowIndexMap.set(new Date(windowRows[i].run_window).getTime(), i);
  }

  const oldestWindow = new Date(windowRows[windowRows.length - 1].run_window).toISOString();

  // ── Get ALL test results (RP counts upstream failures) ─────────────────
  const rows = await db.execute(sql`
    SELECT
      tr.passed,
      tr.failure_reason,
      DATE_TRUNC('hour', tr.executed_at) AS run_window
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND DATE_TRUNC('hour', tr.executed_at) >= ${oldestWindow}::timestamptz
      AND tr.executed_at >= ${cutoff}::timestamptz
      AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
      AND (
        tr.passed = true
        OR tr.failure_classification IS NULL
        OR tr.failure_classification NOT IN ('test_infrastructure', 'test_design', 'stale_input')
      )
  `);

  const testRows = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as {
    passed: boolean;
    failure_reason: string | null;
    run_window: any;
  }[];

  // Get circuit breaker state
  const [health] = await db
    .select({ consecutiveFailures: capabilityHealth.consecutiveFailures })
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  // ── Compute the 4 operational factors ──────────────────────────────────

  // Factor 1: current_availability — latest run pass rate
  const latestWindowTs = windowRows[0].run_window;
  const latestWindowTime = new Date(latestWindowTs).getTime();
  const latestWindowRows = testRows.filter(
    (r) => new Date(r.run_window).getTime() === latestWindowTime,
  );
  const latestPassed = latestWindowRows.filter((r) => r.passed).length;
  const latestTotal = latestWindowRows.length;
  const currentAvailScore = latestTotal > 0
    ? Math.round((latestPassed / latestTotal) * 1000) / 10
    : 0;

  const currentAvailability: RPFactor = {
    score: currentAvailScore,
    weight: RP_WEIGHTS[capType].current_availability,
    detail: `${latestPassed}/${latestTotal} tests passed in latest run`,
    source: "latest_test_run",
  };

  // Factor 2: rolling_success — recency-weighted success across all windows
  let weightedPassSum = 0;
  let weightedTotalSum = 0;
  const windowPassedMap = new Map<number, number>();
  const windowTotalMap = new Map<number, number>();

  for (const row of testRows) {
    const runIndex = windowIndexMap.get(new Date(row.run_window).getTime()) ?? -1;
    if (runIndex < 0) continue;

    const recencyWeight = RECENCY_WEIGHTS[runIndex] ?? 0.30;
    weightedTotalSum += recencyWeight;
    windowTotalMap.set(runIndex, (windowTotalMap.get(runIndex) ?? 0) + 1);

    if (row.passed) {
      weightedPassSum += recencyWeight;
      windowPassedMap.set(runIndex, (windowPassedMap.get(runIndex) ?? 0) + 1);
    }
  }

  const rollingSuccessScore = weightedTotalSum > 0
    ? Math.round((weightedPassSum / weightedTotalSum) * 1000) / 10
    : 0;

  const rollingSuccess: RPFactor = {
    score: rollingSuccessScore,
    weight: RP_WEIGHTS[capType].rolling_success,
    detail: `${rollingSuccessScore}% success over last ${windowRows.length} runs`,
    source: "10_run_weighted_average",
  };

  // Factor 3: upstream_health — from 30-day health state
  let healthState: HealthState;
  if (context?.history30d) {
    healthState = computeHealthState(context.history30d);
  } else {
    // Fallback: compute from test results in this function
    // Build daily pass rates from the test rows we already have
    const dailyMap = new Map<string, { passed: number; total: number }>();
    for (const row of testRows) {
      const date = new Date(row.run_window).toISOString().slice(0, 10);
      const day = dailyMap.get(date) ?? { passed: 0, total: 0 };
      day.total++;
      if (row.passed) day.passed++;
      dailyMap.set(date, day);
    }
    const history = [...dailyMap.entries()]
      .map(([date, d]) => ({ date, pass_rate: (d.passed / d.total) * 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    healthState = computeHealthState(history);
  }

  const upstreamHealthScore = HEALTH_STATE_SCORES[healthState];
  const upstreamHealth: RPFactor = {
    score: upstreamHealthScore,
    weight: RP_WEIGHTS[capType].upstream_health,
    detail: `health_state: ${healthState}`,
    source: "30d_health_assessment",
  };

  // Factor 4: latency — p95 response time
  const { score: latencyScore, detail: latencyDetail } = scoreLatency(
    context?.p95ResponseTimeMs ?? null,
    capType,
  );
  const latencyFactor: RPFactor = {
    score: latencyScore,
    weight: RP_WEIGHTS[capType].latency,
    detail: latencyDetail,
    source: "p95_response_time",
  };

  // ── Composite score ────────────────────────────────────────────────────

  const factors: RPResult["factors"] = {
    current_availability: currentAvailability,
    rolling_success: rollingSuccess,
    upstream_health: upstreamHealth,
    latency: latencyFactor,
  };

  let score = 0;
  for (const key of FACTOR_KEYS) {
    score += factors[key].score * factors[key].weight;
  }
  score = Math.round(score * 10) / 10;

  // ── Circuit breaker penalties (RP only) ────────────────────────────────
  let circuitBreakerActive = false;

  const cbConsecutiveFailures = health?.consecutiveFailures ?? 0;

  // 3 consecutive failures → RP −30 (floor 20)
  if (cbConsecutiveFailures >= 3) {
    score = Math.max(score - 30, 20);
    circuitBreakerActive = true;
  }

  // Sort all rows by run_window for streak detection
  const allRows = [...testRows].sort(
    (a, b) => new Date(b.run_window).getTime() - new Date(a.run_window).getTime(),
  );

  // 5 consecutive test failures → −20 (floor 30)
  if (allRows.length >= 5 && allRows.slice(0, 5).every((r) => !r.passed)) {
    score = Math.max(score - 20, 30);
    circuitBreakerActive = true;
  }

  // Recovery: 3 consecutive passes clear penalty
  if (circuitBreakerActive && allRows.length >= 3) {
    if (allRows.slice(0, 3).every((r) => r.passed)) {
      circuitBreakerActive = false;
      // Re-compute base score without penalties
      score = 0;
      for (const key of FACTOR_KEYS) {
        score += factors[key].score * factors[key].weight;
      }
      score = Math.round(score * 10) / 10;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  // ── Trend ──────────────────────────────────────────────────────────────
  const trend = computeTrend(windowPassedMap, windowTotalMap, windowRows.length);

  const grade = scoreToGrade(score);

  return {
    score,
    grade,
    label: gradeToLabel(grade),
    capability_type: capType,
    factors,
    trend,
    circuit_breaker: circuitBreakerActive,
    runs_analyzed: windowRows.length,
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

function makePendingRP(runsAnalyzed: number, capType: CapabilityType): RPResult {
  const weights = RP_WEIGHTS[capType];
  const makeFactor = (key: RPFactorKey): RPFactor => ({
    score: 0, weight: weights[key], detail: "Pending", source: "none",
  });

  return {
    score: 0,
    grade: "pending",
    label: "Reliability: pending",
    capability_type: capType,
    factors: {
      current_availability: makeFactor("current_availability"),
      rolling_success: makeFactor("rolling_success"),
      upstream_health: makeFactor("upstream_health"),
      latency: makeFactor("latency"),
    },
    trend: "stable",
    circuit_breaker: false,
    runs_analyzed: runsAnalyzed,
    pending: true,
  };
}
