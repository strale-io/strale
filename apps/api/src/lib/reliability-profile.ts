/**
 * Reliability Profile (RP) — Includes ALL failures (upstream counted).
 *
 * All 5 factors are used, but weights vary by capability_type:
 *
 *   deterministic:  correctness 0.50, schema 0.25, availability 0.05, error_handling 0.15, edge_cases 0.05
 *   stable_api:     correctness 0.35, schema 0.20, availability 0.25, error_handling 0.10, edge_cases 0.10
 *   scraping:       correctness 0.25, schema 0.15, availability 0.40, error_handling 0.10, edge_cases 0.10
 *   ai_assisted:    correctness 0.40, schema 0.20, availability 0.15, error_handling 0.15, edge_cases 0.10
 *
 * Circuit breaker penalties apply to RP only.
 */

import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth, testSuites, capabilities } from "../db/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CapabilityType = "deterministic" | "stable_api" | "scraping" | "ai_assisted";

export interface RPResult {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F" | "pending";
  label: string;
  capability_type: CapabilityType;
  factors: {
    correctness: RPFactor;
    schema: RPFactor;
    availability: RPFactor;
    error_handling: RPFactor;
    edge_cases: RPFactor;
  };
  trend: "stable" | "improving" | "declining";
  circuit_breaker: boolean;
  runs_analyzed: number;
  pending: boolean;
}

interface RPFactor {
  rate: number;
  passed: number;
  total: number;
  weight: number;
  weighted_contribution: number;
  has_data: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RP_WEIGHTS: Record<CapabilityType, Record<string, number>> = {
  deterministic: {
    correctness: 0.50, schema: 0.25, availability: 0.05,
    error_handling: 0.15, edge_cases: 0.05,
  },
  stable_api: {
    correctness: 0.35, schema: 0.20, availability: 0.25,
    error_handling: 0.10, edge_cases: 0.10,
  },
  scraping: {
    correctness: 0.25, schema: 0.15, availability: 0.40,
    error_handling: 0.10, edge_cases: 0.10,
  },
  ai_assisted: {
    correctness: 0.40, schema: 0.20, availability: 0.15,
    error_handling: 0.15, edge_cases: 0.10,
  },
};

const FACTOR_KEYS = ["correctness", "schema", "availability", "error_handling", "edge_cases"] as const;

const MIN_RUNS = 5;
const ROLLING_RUNS = 10;
const RECENCY_WEIGHTS = [1.00, 0.95, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30];

const TYPE_TO_FACTOR: Record<string, typeof FACTOR_KEYS[number]> = {
  known_answer: "correctness",
  piggyback: "correctness",
  regression: "correctness",
  schema_check: "schema",
  dependency_health: "availability",
  negative: "error_handling",
  edge_case: "edge_cases",
};

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  return "F";
}

// ─── Core computation ───────────────────────────────────────────────────────

export async function computeReliabilityProfile(slug: string): Promise<RPResult> {
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
    return makePendingRP(windows.length, capType);
  }

  const windowIndexMap = new Map<number, number>();
  for (let i = 0; i < windows.length; i++) {
    windowIndexMap.set(new Date(windows[i].run_window).getTime(), i);
  }

  const oldestWindow = windows[windows.length - 1].run_window;

  // Get ALL test results — RP counts upstream failures as failures
  // Only exclude noise (test_infrastructure, test_design, stale_input)
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
        OR tr.failure_classification NOT IN ('test_infrastructure', 'test_design', 'stale_input')
      )
  `);

  const testRows = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as any[];

  // Get circuit breaker state
  const [health] = await db
    .select({ consecutiveFailures: capabilityHealth.consecutiveFailures })
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  return computeRPFromRows(
    testRows,
    windows.length,
    windowIndexMap,
    capType,
    health?.consecutiveFailures ?? 0,
  );
}

function computeRPFromRows(
  testRows: { test_type: string; passed: boolean; failure_reason: string | null; run_window: any }[],
  runsAnalyzed: number,
  windowIndexMap: Map<number, number>,
  capType: CapabilityType,
  cbConsecutiveFailures: number,
): RPResult {
  const weights = RP_WEIGHTS[capType];

  const accum: Record<string, { weightedPassed: number; weightedTotal: number; passed: number; total: number }> = {};
  for (const key of FACTOR_KEYS) {
    accum[key] = { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 };
  }

  // Per-window tracking for trend
  const windowPassed = new Map<number, number>();
  const windowTotal = new Map<number, number>();

  for (const row of testRows) {
    const factor = TYPE_TO_FACTOR[row.test_type];
    if (!factor) continue;

    const runIndex = windowIndexMap.get(new Date(row.run_window).getTime()) ?? -1;
    if (runIndex < 0) continue;

    const recencyWeight = RECENCY_WEIGHTS[runIndex] ?? 0.30;

    // RP counts ALL failures (including upstream) — no exclusion
    if (row.passed) {
      accum[factor].weightedPassed += recencyWeight;
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].passed++;
      accum[factor].total++;
      windowPassed.set(runIndex, (windowPassed.get(runIndex) ?? 0) + 1);
      windowTotal.set(runIndex, (windowTotal.get(runIndex) ?? 0) + 1);
    } else {
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].total++;
      windowTotal.set(runIndex, (windowTotal.get(runIndex) ?? 0) + 1);
    }
  }

  // Need at least availability + one other factor
  const factorsWithData = FACTOR_KEYS.filter((k) => accum[k].total > 0);
  if (factorsWithData.length < 2) {
    return makePendingRP(runsAnalyzed, capType);
  }

  // Build factors with type-specific weights, re-weighted for missing factors
  let activeWeightSum = 0;
  for (const key of FACTOR_KEYS) {
    if (accum[key].weightedTotal > 0) activeWeightSum += weights[key];
  }

  const factors: RPResult["factors"] = {} as any;
  for (const key of FACTOR_KEYS) {
    const a = accum[key];
    if (a.weightedTotal > 0) {
      const rate = Math.round((a.weightedPassed / a.weightedTotal) * 1000) / 10;
      const normalizedWeight = weights[key] / activeWeightSum;
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

  // ── Circuit breaker penalties (RP only) ──────────────────────────────────
  let circuitBreakerActive = false;

  // 3 consecutive failures → RP −30 (floor 20)
  if (cbConsecutiveFailures >= 3) {
    score = Math.max(score - 30, 20);
    circuitBreakerActive = true;
  }

  // Correctness streak check (5 consecutive correctness failures → −20, floor 30)
  const nonNoiseRows = testRows
    .filter((r) => TYPE_TO_FACTOR[r.test_type])
    .sort((a, b) => new Date(b.run_window).getTime() - new Date(a.run_window).getTime());

  const correctnessRows = nonNoiseRows.filter(
    (r) => TYPE_TO_FACTOR[r.test_type] === "correctness",
  );
  if (correctnessRows.length >= 5 && correctnessRows.slice(0, 5).every((r) => !r.passed)) {
    score = Math.max(score - 20, 30);
    circuitBreakerActive = true;
  }

  // Schema break (latest schema_check failed → −15, floor 40)
  const schemaRows = nonNoiseRows.filter(
    (r) => TYPE_TO_FACTOR[r.test_type] === "schema",
  );
  if (schemaRows.length > 0 && !schemaRows[0].passed) {
    score = Math.max(score - 15, 40);
    circuitBreakerActive = true;
  }

  // Recovery: 3 consecutive passes clear penalty
  if (circuitBreakerActive && nonNoiseRows.length >= 3) {
    if (nonNoiseRows.slice(0, 3).every((r) => r.passed)) {
      circuitBreakerActive = false;
      score = Math.round(
        Object.values(factors).reduce((s, f) => s + f.weighted_contribution, 0) * 10,
      ) / 10;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  // ── Trend ──────────────────────────────────────────────────────────────
  const trend = computeTrend(windowPassed, windowTotal, runsAnalyzed);

  const grade = scoreToGrade(score);

  return {
    score,
    grade,
    label: `Reliability: ${grade}`,
    capability_type: capType,
    factors,
    trend,
    circuit_breaker: circuitBreakerActive,
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

function makePendingRP(runsAnalyzed: number, capType: CapabilityType): RPResult {
  const weights = RP_WEIGHTS[capType];
  const makeFactor = (key: string): RPFactor => ({
    rate: 0, passed: 0, total: 0,
    weight: weights[key], weighted_contribution: 0, has_data: false,
  });

  return {
    score: 0,
    grade: "pending",
    label: "Reliability: pending",
    capability_type: capType,
    factors: {
      correctness: makeFactor("correctness"),
      schema: makeFactor("schema"),
      availability: makeFactor("availability"),
      error_handling: makeFactor("error_handling"),
      edge_cases: makeFactor("edge_cases"),
    },
    trend: "stable",
    circuit_breaker: false,
    runs_analyzed: runsAnalyzed,
    pending: false,
  };
}
