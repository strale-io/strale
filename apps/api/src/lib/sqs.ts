import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SQSResult {
  score: number;
  label: string;
  factors: {
    correctness: FactorResult;
    schema: FactorResult;
    availability: FactorResult;
    error_handling: FactorResult;
    edge_cases: FactorResult;
  };
  upstream_issues: number;
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

const NEUTRAL_DEFAULT = 70;
const MIN_RUNS = 2;
const ROLLING_RUNS = 3;

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

const UPSTREAM_PATTERNS = [
  /HTTP 429/i,
  /HTTP 503/i,
  /HTTP 502/i,
  /Too Many Requests/i,
  /rate limit/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /timeout/i,
  /upstream/i,
  /Browserless/i,
  /VIES error/i,
  /Navigation timeout/i,
];

function isUpstreamFailure(reason: string | null): boolean {
  if (!reason) return false;
  return UPSTREAM_PATTERNS.some((p) => p.test(reason));
}

function scoreToLabel(score: number, pending: boolean): string {
  if (pending) return "Pending";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Poor";
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
 * Uses rolling 3-run window grouped by DATE_TRUNC('minute').
 */
export async function computeCapabilitySQS(slug: string): Promise<SQSResult> {
  const cacheKey = `sqs:cap:${slug}`;
  const cached = getCachedSQS(cacheKey);
  if (cached) return cached;

  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  // Get the last N distinct run windows for this capability
  const runWindows = await db.execute(sql`
    SELECT DISTINCT DATE_TRUNC('minute', executed_at) AS run_window
    FROM test_results
    WHERE capability_slug = ${slug}
      AND executed_at >= ${cutoff}::timestamptz
    ORDER BY run_window DESC
    LIMIT ${ROLLING_RUNS}
  `);

  const windows = (Array.isArray(runWindows) ? runWindows : (runWindows as any)?.rows ?? []) as any[];

  if (windows.length < MIN_RUNS) {
    const result = makePendingResult();
    setCachedSQS(cacheKey, result);
    return result;
  }

  const oldestWindow = windows[windows.length - 1].run_window;

  // Get all test results from these run windows with test_type info
  const rows = await db.execute(sql`
    SELECT
      ts.test_type,
      tr.passed,
      tr.failure_reason
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
      AND DATE_TRUNC('minute', tr.executed_at) >= ${oldestWindow}::timestamptz
      AND tr.executed_at >= ${cutoff}::timestamptz
  `);

  const testRows = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as any[];

  const result = computeFromRows(testRows, windows.length);
  setCachedSQS(cacheKey, result);
  return result;
}

/**
 * Compute SQS for a solution — weighted average of step SQS scores.
 * If any step has SQS < 60, solution SQS is capped at 74.
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

  // If any step is pending, the solution is pending
  if (stepScores.some((s) => s.pending)) {
    const result = makePendingResult();
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

  // Step floor cap: if any step < 60, solution capped at 74
  const hasWeakStep = stepScores.some((s) => s.score < 60);
  if (hasWeakStep && score > 74) score = 74;

  const upstreamIssues = stepScores.reduce((s, r) => s + r.upstream_issues, 0);
  const runsAnalyzed = Math.min(...stepScores.map((s) => s.runs_analyzed));

  const result: SQSResult = {
    score,
    label: scoreToLabel(score, false),
    factors,
    upstream_issues: upstreamIssues,
    runs_analyzed: runsAnalyzed,
    pending: false,
  };

  setCachedSQS(cacheKey, result);
  return result;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function computeFromRows(
  testRows: Array<{ test_type: string; passed: boolean; failure_reason: string | null }>,
  runsAnalyzed: number,
): SQSResult {
  // Accumulate per-factor counts
  const accum: Record<keyof typeof WEIGHTS, { passed: number; total: number }> = {
    correctness: { passed: 0, total: 0 },
    schema: { passed: 0, total: 0 },
    availability: { passed: 0, total: 0 },
    error_handling: { passed: 0, total: 0 },
    edge_cases: { passed: 0, total: 0 },
  };

  let upstreamIssues = 0;

  for (const row of testRows) {
    const factor = TYPE_TO_FACTOR[row.test_type];
    if (!factor) continue; // unknown test type — skip

    if (row.passed) {
      accum[factor].total++;
      accum[factor].passed++;
    } else if (isUpstreamFailure(row.failure_reason)) {
      // Upstream failures excluded from score
      upstreamIssues++;
    } else {
      // Internal failure — counts against the factor
      accum[factor].total++;
      // passed stays 0
    }
  }

  const factors: SQSResult["factors"] = {
    correctness: buildFactor(accum.correctness, WEIGHTS.correctness),
    schema: buildFactor(accum.schema, WEIGHTS.schema),
    availability: buildFactor(accum.availability, WEIGHTS.availability),
    error_handling: buildFactor(accum.error_handling, WEIGHTS.error_handling),
    edge_cases: buildFactor(accum.edge_cases, WEIGHTS.edge_cases),
  };

  const score = Math.round(
    Object.values(factors).reduce((s, f) => s + f.weighted_contribution, 0) * 10,
  ) / 10;

  return {
    score,
    label: scoreToLabel(score, false),
    factors,
    upstream_issues: upstreamIssues,
    runs_analyzed: runsAnalyzed,
    pending: false,
  };
}

function buildFactor(
  counts: { passed: number; total: number },
  weight: number,
): FactorResult {
  if (counts.total === 0) {
    return {
      rate: NEUTRAL_DEFAULT,
      passed: 0,
      total: 0,
      weight,
      weighted_contribution: NEUTRAL_DEFAULT * weight,
      has_data: false,
    };
  }
  const rate = Math.round((counts.passed / counts.total) * 1000) / 10;
  return {
    rate,
    passed: counts.passed,
    total: counts.total,
    weight,
    weighted_contribution: Math.round(rate * weight * 10) / 10,
    has_data: true,
  };
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

function makePendingResult(): SQSResult {
  const makePendingFactor = (weight: number): FactorResult => ({
    rate: 0,
    passed: 0,
    total: 0,
    weight,
    weighted_contribution: 0,
    has_data: false,
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
    upstream_issues: 0,
    runs_analyzed: 0,
    pending: true,
  };
}
