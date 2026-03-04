import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  solutions,
  solutionSteps,
  capabilities,
  capabilityLimitations,
} from "../db/schema.js";
import {
  getCapabilityQuality,
  getSolutionQuality,
} from "../lib/quality-aggregation.js";
import { determineBadge, getTestResultsForSlug } from "../lib/trust-helpers.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const internalTrustRoute = new Hono<AppEnv>();

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry<T> { data: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}
function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getLimitationsForSlug(slug: string) {
  const db = getDb();
  const rows = await db
    .select({
      text: capabilityLimitations.limitationText,
      category: capabilityLimitations.category,
      severity: capabilityLimitations.severity,
      affectedPercentage: capabilityLimitations.affectedPercentage,
      workaround: capabilityLimitations.workaround,
    })
    .from(capabilityLimitations)
    .where(
      and(
        eq(capabilityLimitations.capabilitySlug, slug),
        eq(capabilityLimitations.active, true),
      ),
    )
    .orderBy(asc(capabilityLimitations.sortOrder));

  return rows.map((r) => ({
    text: r.text,
    category: r.category,
    severity: r.severity,
    affected_percentage: r.affectedPercentage
      ? parseFloat(r.affectedPercentage)
      : null,
    workaround: r.workaround,
  }));
}

// ─── GET /v1/internal/trust/capabilities/:slug ──────────────────────────────

internalTrustRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:cap:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const [quality, testResultsData, limitations] = await Promise.all([
    getCapabilityQuality(slug),
    getTestResultsForSlug(slug),
    getLimitationsForSlug(slug),
  ]);

  const customerTxns = Math.max(
    0,
    quality.totalTransactionsAll - (testResultsData.total_tests > 0 ? quality.totalTransactionsAll : 0),
  );
  // For now, all transactions are test transactions since no customer traffic yet
  const testTxns = quality.totalTransactionsAll;

  const { badge, badge_label } = determineBadge(
    testTxns,
    0, // No customer transactions tracking yet
    quality.successRate,
  );

  const dataSource =
    testTxns > 0 && customerTxns > 0
      ? "blended"
      : testTxns > 0
        ? "internal_testing"
        : "none";

  const result = {
    capability_slug: slug,
    trust_summary: {
      badge,
      badge_label,
      overall: {
        success_rate: quality.successRate,
        avg_response_time_ms: quality.avgResponseTimeMs,
        p95_response_time_ms: quality.p95ResponseTimeMs,
        schema_conformance_rate: quality.schemaConformanceRate,
        avg_field_completeness_pct: quality.avgFieldCompletenessPct,
        total_transactions: quality.totalTransactionsAll,
        customer_transactions: 0,
        test_transactions: testTxns,
        data_source: dataSource,
      },
      test_results: testResultsData,
      limitations,
    },
    methodology_url: "https://strale.dev/trust/methodology",
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── GET /v1/internal/trust/solutions/:slug ─────────────────────────────────

internalTrustRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:sol:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();

  // Look up solution steps with capability names
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      parallelGroup: solutionSteps.parallelGroup,
      capabilityName: capabilities.name,
    })
    .from(solutionSteps)
    .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
    .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(eq(solutions.slug, slug))
    .orderBy(asc(solutionSteps.stepOrder));

  if (steps.length === 0) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  // Get solution-level quality
  const solutionQuality = await getSolutionQuality(slug);

  // Build per-step data in parallel
  const stepData = await Promise.all(
    steps.map(async (step) => {
      const [quality, testResultsData, limitations] = await Promise.all([
        getCapabilityQuality(step.capabilitySlug),
        getTestResultsForSlug(step.capabilitySlug),
        getLimitationsForSlug(step.capabilitySlug),
      ]);

      return {
        capability_slug: step.capabilitySlug,
        capability_name: step.capabilityName ?? step.capabilitySlug,
        step_order: step.stepOrder,
        parallel_group: step.parallelGroup,
        quality: {
          success_rate: quality.successRate,
          avg_response_time_ms: quality.avgResponseTimeMs,
          p95_response_time_ms: quality.p95ResponseTimeMs,
          schema_conformance_rate: quality.schemaConformanceRate,
          avg_field_completeness_pct: quality.avgFieldCompletenessPct,
          total_transactions_30d: quality.totalTransactions30d,
          total_transactions_all: quality.totalTransactionsAll,
        },
        test_results: {
          last_run: testResultsData.last_run,
          total_tests: testResultsData.total_tests,
          passed: testResultsData.passed,
          failed: testResultsData.failed,
          pass_rate: testResultsData.pass_rate,
          avg_response_time_ms: testResultsData.avg_response_time_ms,
        },
        limitations,
      };
    }),
  );

  // Aggregate test results across steps
  const allTestPassed = stepData.reduce((s, d) => s + d.test_results.passed, 0);
  const allTestFailed = stepData.reduce((s, d) => s + d.test_results.failed, 0);
  const allTestTotal = stepData.reduce((s, d) => s + d.test_results.total_tests, 0);
  const allTestWithResults = allTestPassed + allTestFailed;
  const allTestResponseTime = stepData.reduce(
    (s, d) =>
      s + (d.test_results.avg_response_time_ms ?? 0) * (d.test_results.passed + d.test_results.failed),
    0,
  );
  const testLastRuns = stepData
    .map((d) => d.test_results.last_run)
    .filter((t): t is string => t !== null)
    .sort();
  const lastTestRun = testLastRuns[testLastRuns.length - 1] ?? null;

  // Aggregate 30-day history across all step capabilities
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const capSlugs = steps.map((s) => s.capabilitySlug);
  const historyRows = await db.execute(sql`
    SELECT
      DATE(tr.executed_at AT TIME ZONE 'UTC') AS date,
      ROUND(SUM(CASE WHEN tr.passed THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)::text AS pass_rate,
      ROUND(AVG(tr.response_time_ms))::text AS avg_response_time_ms
    FROM test_results tr
    WHERE tr.capability_slug IN (${sql.join(capSlugs.map((s) => sql`${s}`), sql`, `)})
      AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    GROUP BY DATE(tr.executed_at AT TIME ZONE 'UTC')
    ORDER BY date
  `);
  const history = (Array.isArray(historyRows) ? historyRows : (historyRows as any)?.rows ?? [])
    .map((r: any) => ({
      date: r.date,
      pass_rate: parseFloat(r.pass_rate),
      avg_response_time_ms: parseInt(r.avg_response_time_ms, 10),
    }));

  // Collect all limitations across all steps
  const allLimitations = stepData.flatMap((d) => d.limitations);

  // Total transactions
  const totalTestTxns = solutionQuality?.totalTransactionsAll ?? 0;

  const { badge, badge_label } = determineBadge(
    totalTestTxns,
    0,
    solutionQuality?.successRate ?? null,
  );

  const result = {
    solution_slug: slug,
    trust_summary: {
      badge,
      badge_label,
      overall: {
        success_rate: solutionQuality?.successRate ?? null,
        avg_response_time_ms: solutionQuality?.avgResponseTimeMs ?? null,
        p95_response_time_ms: solutionQuality?.p95ResponseTimeMs ?? null,
        schema_conformance_rate: solutionQuality?.schemaConformanceRate ?? null,
        avg_field_completeness_pct: solutionQuality?.avgFieldCompletenessPct ?? null,
        total_transactions: totalTestTxns,
        customer_transactions: 0,
        test_transactions: totalTestTxns,
        data_source: totalTestTxns > 0 ? "internal_testing" : "none",
      },
      test_results: {
        last_run: lastTestRun,
        total_tests: allTestTotal,
        passed: allTestPassed,
        failed: allTestFailed,
        pass_rate:
          allTestWithResults > 0
            ? parseFloat(((allTestPassed / allTestWithResults) * 100).toFixed(1))
            : null,
        avg_response_time_ms:
          allTestWithResults > 0
            ? Math.round(allTestResponseTime / allTestWithResults)
            : null,
        history_30d: history,
      },
      limitations: allLimitations,
      steps: stepData,
    },
    methodology_url: "https://strale.dev/trust/methodology",
  };

  setCache(cacheKey, result);
  return c.json(result);
});
