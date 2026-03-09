import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CapabilityQualityMetrics {
  capabilitySlug: string;
  successRate: number | null;
  avgResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
  schemaConformanceRate: number | null;
  avgFieldCompletenessPct: number | null;
  totalTransactions30d: number;
  totalTransactionsAll: number;
  lastUpdated: string;
}

export interface SolutionQualityMetrics {
  solutionSlug: string;
  successRate: number | null;
  avgResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
  schemaConformanceRate: number | null;
  avgFieldCompletenessPct: number | null;
  totalTransactions30d: number;
  totalTransactionsAll: number;
  steps: CapabilityQualityMetrics[];
  lastUpdated: string;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Capability aggregation ─────────────────────────────────────────────────

export async function getCapabilityQuality(
  capabilitySlug: string,
): Promise<CapabilityQualityMetrics> {
  const cacheKey = `quality:${capabilitySlug}`;
  const cached = getCached<CapabilityQualityMetrics>(cacheKey);
  if (cached) return cached;

  const metrics = await computeCapabilityQuality(capabilitySlug);
  setCache(cacheKey, metrics);
  return metrics;
}

async function computeCapabilityQuality(
  capabilitySlug: string,
): Promise<CapabilityQualityMetrics> {
  const db = getDb();
  const now = new Date().toISOString();

  // Single query: weighted rolling metrics for last 30 days
  // Recent 7 days get weight 3, older 23 days get weight 1
  // Latency metrics (avg, p95) use the most recent 50 transactions to avoid
  // historical outliers from early test development inflating current scores
  const [metrics] = await db.execute<{
    success_rate: string | null;
    avg_response_time_ms: string | null;
    p95_response_time_ms: string | null;
    schema_conformance_rate: string | null;
    avg_field_completeness_pct: string | null;
    total_30d: string;
    total_all: string;
  }>(sql`
    WITH quality_rows AS (
      SELECT
        tq.response_time_ms,
        tq.schema_conformant,
        tq.field_completeness_pct,
        tq.error_type,
        tq.created_at,
        CASE
          WHEN tq.created_at >= NOW() - INTERVAL '7 days' THEN 3.0
          ELSE 1.0
        END AS weight
      FROM transaction_quality tq
      JOIN transactions t ON t.id = tq.transaction_id
      JOIN capabilities c ON c.id = t.capability_id
      WHERE c.slug = ${capabilitySlug}
        AND tq.created_at >= NOW() - INTERVAL '30 days'
    ),
    all_count AS (
      SELECT COUNT(*)::text AS total
      FROM transaction_quality tq
      JOIN transactions t ON t.id = tq.transaction_id
      JOIN capabilities c ON c.id = t.capability_id
      WHERE c.slug = ${capabilitySlug}
    ),
    aggregated AS (
      SELECT
        CASE WHEN SUM(weight) > 0
          THEN ROUND(SUM(CASE WHEN error_type IS NULL THEN weight ELSE 0 END) / SUM(weight) * 100, 2)
          ELSE NULL
        END AS success_rate,
        CASE WHEN SUM(weight) > 0
          THEN ROUND(SUM(CASE WHEN schema_conformant THEN weight ELSE 0 END) / SUM(weight) * 100, 2)
          ELSE NULL
        END AS schema_conformance_rate,
        CASE WHEN SUM(weight) > 0
          THEN ROUND(SUM(field_completeness_pct::numeric * weight) / SUM(weight), 2)
          ELSE NULL
        END AS avg_field_completeness_pct,
        COUNT(*)::text AS total_30d
      FROM quality_rows
    ),
    recent_latency AS (
      SELECT response_time_ms
      FROM quality_rows
      ORDER BY created_at DESC
      LIMIT 50
    ),
    latency_stats AS (
      SELECT
        ROUND(AVG(response_time_ms))::text AS avg_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::text AS p95_ms
      FROM recent_latency
    )
    SELECT
      a.success_rate::text,
      ls.avg_ms AS avg_response_time_ms,
      ls.p95_ms AS p95_response_time_ms,
      a.schema_conformance_rate::text,
      a.avg_field_completeness_pct::text,
      a.total_30d,
      ac.total AS total_all
    FROM aggregated a
    CROSS JOIN all_count ac
    CROSS JOIN latency_stats ls
  `);

  const rows = Array.isArray(metrics) ? metrics : (metrics as any)?.rows ?? [metrics];
  const row = rows[0] ?? {};

  return {
    capabilitySlug,
    successRate: row.success_rate != null ? parseFloat(row.success_rate) : null,
    avgResponseTimeMs:
      row.avg_response_time_ms != null
        ? parseInt(row.avg_response_time_ms, 10)
        : null,
    p95ResponseTimeMs:
      row.p95_response_time_ms != null
        ? parseInt(row.p95_response_time_ms, 10)
        : null,
    schemaConformanceRate:
      row.schema_conformance_rate != null
        ? parseFloat(row.schema_conformance_rate)
        : null,
    avgFieldCompletenessPct:
      row.avg_field_completeness_pct != null
        ? parseFloat(row.avg_field_completeness_pct)
        : null,
    totalTransactions30d: parseInt(row.total_30d ?? "0", 10),
    totalTransactionsAll: parseInt(row.total_all ?? "0", 10),
    lastUpdated: now,
  };
}

// ─── Solution aggregation ───────────────────────────────────────────────────

export async function getSolutionQuality(
  solutionSlug: string,
): Promise<SolutionQualityMetrics | null> {
  const cacheKey = `quality:solution:${solutionSlug}`;
  const cached = getCached<SolutionQualityMetrics>(cacheKey);
  if (cached) return cached;

  const metrics = await computeSolutionQuality(solutionSlug);
  if (metrics) setCache(cacheKey, metrics);
  return metrics;
}

/**
 * Compute parallel-aware latency for a solution.
 * Steps in the same parallelGroup run concurrently → take max of the group.
 * Sequential steps (parallelGroup = null) → add their full latency.
 * Solution latency = sum of group maximums + sequential step latencies.
 */
function computeParallelAwareLatency(
  stepMetrics: CapabilityQualityMetrics[],
  parallelGroups: (number | null)[],
  getValue: (m: CapabilityQualityMetrics) => number | null,
): number | null {
  // Collect parallel group values and sequential values
  const groupValues = new Map<number, number[]>();
  let sequentialTotal = 0;
  let hasData = false;

  for (let i = 0; i < stepMetrics.length; i++) {
    const val = getValue(stepMetrics[i]);
    if (val == null) continue;
    hasData = true;

    const pg = parallelGroups[i];
    if (pg != null) {
      const existing = groupValues.get(pg) ?? [];
      existing.push(val);
      groupValues.set(pg, existing);
    } else {
      sequentialTotal += val;
    }
  }

  if (!hasData) return null;

  // Parallel groups contribute only their slowest member
  let parallelTotal = 0;
  for (const values of groupValues.values()) {
    parallelTotal += Math.max(...values);
  }

  return sequentialTotal + parallelTotal;
}

async function computeSolutionQuality(
  solutionSlug: string,
): Promise<SolutionQualityMetrics | null> {
  const db = getDb();

  // Look up solution steps to get capability slugs and parallel group info
  const stepRows = await db.execute<{
    capability_slug: string;
    parallel_group: number | null;
  }>(sql`
    SELECT ss.capability_slug, ss.parallel_group
    FROM solution_steps ss
    JOIN solutions s ON s.id = ss.solution_id
    WHERE s.slug = ${solutionSlug}
    ORDER BY ss.step_order
  `);

  const rows = Array.isArray(stepRows)
    ? stepRows
    : (stepRows as any)?.rows ?? [];

  if (rows.length === 0) return null;

  const capabilitySlugs = rows.map(
    (r: { capability_slug: string }) => r.capability_slug,
  );
  const parallelGroups = rows.map(
    (r: { parallel_group: number | null }) => r.parallel_group,
  );

  // Get quality metrics for each step capability
  const stepMetrics = await Promise.all(
    capabilitySlugs.map((slug: string) => getCapabilityQuality(slug)),
  );

  // Aggregate across steps
  const now = new Date().toISOString();
  const stepsWithData = stepMetrics.filter(
    (s) => s.totalTransactions30d > 0,
  );

  if (stepsWithData.length === 0) {
    return {
      solutionSlug,
      successRate: null,
      avgResponseTimeMs: null,
      p95ResponseTimeMs: null,
      schemaConformanceRate: null,
      avgFieldCompletenessPct: null,
      totalTransactions30d: 0,
      totalTransactionsAll: 0,
      steps: stepMetrics,
      lastUpdated: now,
    };
  }

  // Solution success = product of step success rates (all must succeed)
  const successRates = stepsWithData
    .map((s) => s.successRate)
    .filter((r): r is number => r != null);
  const solutionSuccessRate =
    successRates.length > 0
      ? parseFloat(
          (
            successRates.reduce((acc, r) => acc * (r / 100), 1) * 100
          ).toFixed(2),
        )
      : null;

  // Solution response time — parallel-aware: steps in the same parallelGroup
  // contribute only the max latency of that group (they run concurrently).
  // Sequential steps (parallelGroup = null) contribute their full latency.
  const solutionAvgResponseTimeMs = computeParallelAwareLatency(
    stepMetrics, parallelGroups, (s) => s.avgResponseTimeMs,
  );
  const solutionP95 = computeParallelAwareLatency(
    stepMetrics, parallelGroups, (s) => s.p95ResponseTimeMs,
  );

  // Schema conformance = average across steps
  const schemaRates = stepsWithData
    .map((s) => s.schemaConformanceRate)
    .filter((r): r is number => r != null);
  const solutionSchemaRate =
    schemaRates.length > 0
      ? parseFloat(
          (
            schemaRates.reduce((a, b) => a + b, 0) / schemaRates.length
          ).toFixed(2),
        )
      : null;

  // Field completeness = average across steps
  const completeness = stepsWithData
    .map((s) => s.avgFieldCompletenessPct)
    .filter((r): r is number => r != null);
  const solutionCompleteness =
    completeness.length > 0
      ? parseFloat(
          (
            completeness.reduce((a, b) => a + b, 0) / completeness.length
          ).toFixed(2),
        )
      : null;

  // Transaction counts: use the minimum across steps (bottleneck)
  const counts30d = stepsWithData.map((s) => s.totalTransactions30d);
  const countsAll = stepsWithData.map((s) => s.totalTransactionsAll);

  return {
    solutionSlug,
    successRate: solutionSuccessRate,
    avgResponseTimeMs: solutionAvgResponseTimeMs,
    p95ResponseTimeMs: solutionP95,
    schemaConformanceRate: solutionSchemaRate,
    avgFieldCompletenessPct: solutionCompleteness,
    totalTransactions30d: Math.min(...counts30d),
    totalTransactionsAll: Math.min(...countsAll),
    steps: stepMetrics,
    lastUpdated: now,
  };
}
