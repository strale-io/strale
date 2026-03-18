/**
 * Quality Profile (QP) — Code quality excluding upstream failures.
 *
 * Factors (4, re-weighted from legacy SQS):
 *   correctness  0.50
 *   schema       0.31
 *   error_handling 0.13
 *   edge_cases   0.06
 *
 * Upstream / external-service failures are EXCLUDED entirely —
 * they do not count as either pass or fail.
 *
 * Uses per-factor rolling windows (minute granularity) to allow manual test
 * cycles (2-3 min apart) to each count as distinct qualification windows.
 * High-frequency piggyback tests are still handled correctly because the same
 * minute window collapses multiple rapid calls into one entry.
 */

import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth, testSuites } from "../db/schema.js";
import { MIN_RUNS, ROLLING_RUNS, RECENCY_WEIGHTS } from "./sqs-constants.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QPResult {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F" | "pending";
  label: string; // "Code quality: A" etc.
  factors: {
    correctness: QPFactor;
    schema: QPFactor;
    error_handling: QPFactor;
    edge_cases: QPFactor;
  };
  runs_analyzed: number;
  pending: boolean;
}

interface QPFactor {
  rate: number;
  passed: number;
  total: number;
  weight: number;
  weighted_contribution: number;
  has_data: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const QP_WEIGHTS = {
  correctness: 0.50,
  schema: 0.31,
  error_handling: 0.13,
  edge_cases: 0.06,
} as const;

const QP_FACTOR_KEYS = Object.keys(QP_WEIGHTS) as (keyof typeof QP_WEIGHTS)[];

// MIN_RUNS, ROLLING_RUNS, RECENCY_WEIGHTS imported from sqs-constants.ts

const TYPE_TO_QP_FACTOR: Record<string, keyof typeof QP_WEIGHTS> = {
  known_answer: "correctness",
  piggyback: "correctness",
  regression: "correctness",
  schema_check: "schema",
  negative: "error_handling",
  edge_case: "edge_cases",
};

// Note: dependency_health maps to "availability" in legacy SQS but is
// EXCLUDED from QP — availability is an RP concern.

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

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  return "F";
}

// ─── Core computation ───────────────────────────────────────────────────────

export async function computeQualityProfile(slug: string): Promise<QPResult> {
  const db = getDb();

  // Check for testable suites (QP-relevant types only)
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
    return makePendingQP(0);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  // ── Per-type window detection (minute granularity) ──────────────────────
  // Each test type gets its own rolling window so that high-frequency types
  // (piggyback, which runs on every customer call) cannot push low-frequency
  // types (schema_check every 6-24h, negative, edge_case) out of the window.
  // Minute granularity allows manual qualification cycles (2-3 min apart) to
  // each count as a distinct window, while still collapsing rapid bursts.
  const rawTypeWindows = await db.execute(sql`
    SELECT ts.test_type, DATE_TRUNC('minute', tr.executed_at) AS run_window
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND tr.executed_at >= ${cutoff}::timestamptz
      AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
      AND ts.test_type IN ('known_answer', 'piggyback', 'regression', 'schema_check', 'negative', 'edge_case')
    GROUP BY ts.test_type, DATE_TRUNC('minute', tr.executed_at)
    ORDER BY run_window DESC
  `);

  const typeWindowRows = (
    Array.isArray(rawTypeWindows) ? rawTypeWindows : (rawTypeWindows as any)?.rows ?? []
  ) as { test_type: string; run_window: any }[];

  // Group raw windows by test type (already DESC from query)
  const windowsByType = new Map<string, Date[]>();
  for (const row of typeWindowRows) {
    const list = windowsByType.get(row.test_type) ?? [];
    list.push(new Date(row.run_window));
    windowsByType.set(row.test_type, list);
  }

  // Build per-factor window index maps: timestamp → recency index (0 = most recent)
  // Multiple test types can map to the same factor (e.g., known_answer + piggyback → correctness)
  const factorWindowMaps = new Map<keyof typeof QP_WEIGHTS, Map<number, number>>();
  for (const [testType, factor] of Object.entries(TYPE_TO_QP_FACTOR)) {
    const typeWindows = windowsByType.get(testType) ?? [];
    const existing = factorWindowMaps.get(factor) ?? new Map<number, number>();
    for (const w of typeWindows) {
      if (existing.size >= ROLLING_RUNS) break;
      const ts = w.getTime();
      if (!existing.has(ts)) existing.set(ts, existing.size);
    }
    if (existing.size > 0) factorWindowMaps.set(factor, existing);
  }

  // MIN_RUNS check is based on correctness windows (the most data-rich factor)
  const correctnessMap = factorWindowMaps.get("correctness");
  const corrRuns = correctnessMap?.size ?? 0;
  if (corrRuns < MIN_RUNS) {
    return makePendingQP(corrRuns);
  }

  // Oldest window across all factors — defines the fetch range
  let globalOldest = Date.now();
  for (const [, wmap] of factorWindowMaps) {
    for (const [ts] of wmap) {
      if (ts < globalOldest) globalOldest = ts;
    }
  }
  const oldestWindow = new Date(globalOldest).toISOString();

  // Fetch all test results since the oldest factor window
  const rawRows = await db.execute(sql`
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
      AND ts.test_type IN ('known_answer', 'piggyback', 'regression', 'schema_check', 'negative', 'edge_case')
      AND (
        tr.passed = true
        OR tr.failure_classification IS NULL
        OR tr.failure_classification NOT IN ('test_infrastructure', 'stale_input')
      )
  `);

  const testRows = (
    Array.isArray(rawRows) ? rawRows : (rawRows as any)?.rows ?? []
  ) as any[];

  return computeQPFromRows(testRows, corrRuns, factorWindowMaps);
}

function computeQPFromRows(
  testRows: { test_type: string; passed: boolean; failure_reason: string | null; run_window: any }[],
  runsAnalyzed: number,
  factorWindowMaps: Map<keyof typeof QP_WEIGHTS, Map<number, number>>,
): QPResult {
  const accum: Record<keyof typeof QP_WEIGHTS, { weightedPassed: number; weightedTotal: number; passed: number; total: number }> = {
    correctness: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    schema: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    error_handling: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
    edge_cases: { weightedPassed: 0, weightedTotal: 0, passed: 0, total: 0 },
  };

  for (const row of testRows) {
    const factor = TYPE_TO_QP_FACTOR[row.test_type];
    if (!factor) continue; // dependency_health excluded from QP

    // Exclude upstream failures entirely from QP
    if (!row.passed && isExternalServiceFailure(row.failure_reason)) continue;

    // Use the per-factor window map so each factor's recency is computed independently
    const wmap = factorWindowMaps.get(factor);
    if (!wmap) continue;

    const runIndex = wmap.get(new Date(row.run_window).getTime()) ?? -1;
    if (runIndex < 0) continue; // outside this factor's rolling window

    const recencyWeight = RECENCY_WEIGHTS[runIndex] ?? 0.30;

    if (row.passed) {
      accum[factor].weightedPassed += recencyWeight;
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].passed++;
      accum[factor].total++;
    } else {
      accum[factor].weightedTotal += recencyWeight;
      accum[factor].total++;
    }
  }

  // Need at least correctness + one other factor with data
  const factorsWithData = QP_FACTOR_KEYS.filter((k) => accum[k].total > 0);
  if (factorsWithData.length < 2 || accum.correctness.total === 0) {
    return makePendingQP(runsAnalyzed);
  }

  // Build factors — re-weight proportionally for factors with data
  let activeWeightSum = 0;
  for (const key of QP_FACTOR_KEYS) {
    if (accum[key].weightedTotal > 0) activeWeightSum += QP_WEIGHTS[key];
  }

  const factors: QPResult["factors"] = {} as any;
  for (const key of QP_FACTOR_KEYS) {
    const a = accum[key];
    if (a.weightedTotal > 0) {
      const rate = Math.round((a.weightedPassed / a.weightedTotal) * 1000) / 10;
      const normalizedWeight = QP_WEIGHTS[key] / activeWeightSum;
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

  // No circuit breaker penalties on QP (those go to RP)
  score = Math.max(0, Math.min(100, score));

  const grade = scoreToGrade(score);

  return {
    score,
    grade,
    label: `Code quality: ${grade}`,
    factors,
    runs_analyzed: runsAnalyzed,
    pending: false,
  };
}

function makePendingQP(runsAnalyzed: number): QPResult {
  const makeFactor = (weight: number): QPFactor => ({
    rate: 0, passed: 0, total: 0,
    weight, weighted_contribution: 0, has_data: false,
  });

  return {
    score: 0,
    grade: "pending",
    label: "Code quality: pending",
    factors: {
      correctness: makeFactor(QP_WEIGHTS.correctness),
      schema: makeFactor(QP_WEIGHTS.schema),
      error_handling: makeFactor(QP_WEIGHTS.error_handling),
      edge_cases: makeFactor(QP_WEIGHTS.edge_cases),
    },
    runs_analyzed: runsAnalyzed,
    pending: true,
  };
}
