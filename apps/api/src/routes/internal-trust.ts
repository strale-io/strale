/**
 * PUBLIC ENDPOINTS — intentional, no auth required.
 *
 * Trust, quality, and test data is public by design to support
 * Strale's transparency positioning. Anyone can verify capability
 * health without authentication. If this changes, add authMiddleware.
 */

import { Hono } from "hono";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRelatedCapabilities, getRelatedSolutions } from "../lib/related-items.js";
import {
  solutions,
  solutionSteps,
  capabilities,
  capabilityLimitations,
  testSuites,
  testResults,
} from "../db/schema.js";
import {
  getCapabilityQuality,
  getSolutionQuality,
} from "../lib/quality-aggregation.js";
import { determineBadge, getTestResultsForSlug, getLatestCompleteRunForSolution } from "../lib/trust-helpers.js";
import { computeHealthState } from "../lib/health-state.js";
import { computeCapabilitySQS, computeSolutionSQS } from "../lib/sqs.js";
import {
  computeFreshnessGrade,
  buildPerformanceInfo,
  computeTrustGrade,
} from "../lib/trust-grade.js";
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

// ─── Aggregation helpers for solution-level by_type and failures ────────────

function aggregateByType(
  stepData: Array<{ test_results: { by_type: Record<string, { total: number; passed: number; failed: number }> } }>,
): Record<string, { total: number; passed: number; failed: number }> {
  const merged: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const step of stepData) {
    for (const [type, counts] of Object.entries(step.test_results.by_type)) {
      if (!merged[type]) merged[type] = { total: 0, passed: 0, failed: 0 };
      merged[type].total += counts.total;
      merged[type].passed += counts.passed;
      merged[type].failed += counts.failed;
    }
  }
  return merged;
}

function aggregateFailures(
  stepData: Array<{ capability_slug: string; test_results: { failures?: Array<{ test_name: string; test_type: string; failure_reason: string; failure_category: string }> } }>,
): { failures?: Array<{ test_name: string; test_type: string; failure_reason: string; failure_category: string; capability_slug: string }> } {
  // Note: failure_reason values are already sanitized by trust-helpers.ts
  const all: Array<{ test_name: string; test_type: string; failure_reason: string; failure_category: string; capability_slug: string }> = [];
  for (const step of stepData) {
    if (step.test_results.failures) {
      for (const f of step.test_results.failures) {
        all.push({ ...f, capability_slug: step.capability_slug });
      }
    }
  }
  return all.length > 0 ? { failures: all } : {};
}

// ─── Schedule helpers ────────────────────────────────────────────────────────

const TIER_INTERVAL_MS: Record<string, number> = {
  A: 6 * 60 * 60 * 1000,
  B: 24 * 60 * 60 * 1000,
  C: 72 * 60 * 60 * 1000,
};

function computeNextRun(tier: string, lastRun: string | null): string | null {
  if (!lastRun) return null;
  const interval = TIER_INTERVAL_MS[tier];
  if (!interval) return null;
  return new Date(new Date(lastRun).getTime() + interval).toISOString();
}

// ─── Health state computation ──────────────────────────────────────────────

// ─── GET /v1/internal/trust/capabilities/batch ───────────────────────────────
// Returns pass rates for multiple capabilities in a single query.
// Usage: GET /v1/internal/trust/capabilities/batch?slugs=slug1,slug2,slug3

internalTrustRoute.get("/capabilities/batch", async (c) => {
  const slugsParam = c.req.query("slugs") ?? "";
  const slugs = slugsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (slugs.length === 0) {
    return c.json(apiError("invalid_request", "slugs query parameter is required"), 400);
  }

  const cacheKey = `trust:batch:${slugs.sort().join(",")}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  // Cap at 100 slugs per request
  const limitedSlugs = slugs.slice(0, 100);

  const db = getDb();

  // Get the latest test result per test suite, grouped by capability
  // This mirrors how getTestResultsForSlug works but for multiple slugs at once
  const rows = await db.execute(sql`
    WITH latest_results AS (
      SELECT DISTINCT ON (tr.test_suite_id)
        tr.capability_slug,
        tr.passed
      FROM test_results tr
      INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
      WHERE tr.capability_slug IN (${sql.join(limitedSlugs.map((s) => sql`${s}`), sql`, `)})
        AND ts.active = true
      ORDER BY tr.test_suite_id, tr.executed_at DESC
    )
    SELECT
      capability_slug,
      COUNT(*) FILTER (WHERE passed = true)::text AS passed,
      COUNT(*) FILTER (WHERE passed = false)::text AS failed,
      COUNT(*)::text AS total
    FROM latest_results
    GROUP BY capability_slug
  `);

  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];

  const trustMap: Record<string, { passed: number; failed: number; total: number; pass_rate: number | null; sqs_score: number; sqs_label: string }> = {};

  // Compute SQS per capability in parallel (cached with 10-min TTL)
  const sqsResults = await Promise.all(
    limitedSlugs.map((s) => computeCapabilitySQS(s)),
  );
  const sqsMap = new Map(limitedSlugs.map((s, i) => [s, sqsResults[i]]));

  for (const r of resultRows as any[]) {
    const passed = Number(r.passed);
    const failed = Number(r.failed);
    const total = Number(r.total);
    const withResults = passed + failed;
    const sqs = sqsMap.get(r.capability_slug);
    trustMap[r.capability_slug] = {
      passed,
      failed,
      total,
      pass_rate: withResults > 0
        ? parseFloat(((passed / withResults) * 100).toFixed(1))
        : null,
      sqs_score: sqs?.score ?? 0,
      sqs_label: sqs?.label ?? "Pending",
    };
  }

  // Add entries for slugs that have no test results but do have SQS
  for (const s of limitedSlugs) {
    if (!trustMap[s]) {
      const sqs = sqsMap.get(s);
      trustMap[s] = {
        passed: 0,
        failed: 0,
        total: 0,
        pass_rate: null,
        sqs_score: sqs?.score ?? 0,
        sqs_label: sqs?.label ?? "Pending",
      };
    }
  }

  setCache(cacheKey, trustMap);
  return c.json(trustMap);
});

// ─── GET /v1/internal/trust/capabilities/:slug ──────────────────────────────

internalTrustRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:cap:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();

  const [quality, testResultsData, limitations, suiteRows] = await Promise.all([
    getCapabilityQuality(slug),
    getTestResultsForSlug(slug),
    getLimitationsForSlug(slug),
    db.select({ scheduleTier: testSuites.scheduleTier })
      .from(testSuites)
      .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
      .limit(1),
  ]);

  const scheduleTier = suiteRows[0]?.scheduleTier ?? "B";
  const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };
  const scheduleFrequencyHours = TIER_HOURS[scheduleTier] ?? 24;
  const nextScheduledRun = computeNextRun(scheduleTier, testResultsData.last_run);

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

  // Look up capability name, data source, and freshness fields
  const [capRow] = await db.select({
    name: capabilities.name,
    dataSource: capabilities.dataSource,
    freshnessCategory: capabilities.freshnessCategory,
    dataUpdateCycleDays: capabilities.dataUpdateCycleDays,
    datasetLastUpdated: capabilities.datasetLastUpdated,
  })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);
  const capName = capRow?.name ?? slug;

  const narrative = generateQualityNarrative([{
    capability_name: capName,
    test_results: {
      total_tests: testResultsData.total_tests,
      passed: testResultsData.passed,
      failed: testResultsData.failed,
      pass_rate: testResultsData.pass_rate,
      avg_response_time_ms: testResultsData.avg_response_time_ms,
      failures: testResultsData.failures,
    },
  }]);

  const healthState = computeHealthState(testResultsData.history_30d);
  const sqs = await computeCapabilitySQS(slug);

  const freshness = capRow ? computeFreshnessGrade({
    freshnessCategory: capRow.freshnessCategory,
    dataUpdateCycleDays: capRow.dataUpdateCycleDays,
    datasetLastUpdated: capRow.datasetLastUpdated,
  }) : null;

  const performance = buildPerformanceInfo(
    quality.p95ResponseTimeMs,
    quality.avgResponseTimeMs,
  );

  const trustGrade = computeTrustGrade({
    sqsScore: sqs.pending ? null : sqs.score,
    sqsPending: sqs.pending,
    freshnessGrade: freshness?.grade ?? null,
    latencyGrade: performance.latency_grade,
  });

  const result = {
    capability_slug: slug,
    capability_data_source: capRow?.dataSource ?? null,
    trust_summary: {
      badge,
      badge_label,
      health_state: healthState,
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
      test_results: {
        ...testResultsData,
        next_scheduled_run: nextScheduledRun,
        schedule_frequency_hours: scheduleFrequencyHours,
      },
      quality_narrative: narrative,
      limitations,
    },
    sqs,
    ...(freshness ? { freshness } : {}),
    performance,
    ...(trustGrade ? { trust_grade: trustGrade } : {}),
    methodology_url: "https://strale.dev/trust/methodology",
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── Quality narrative ─────────────────────────────────────────────────────

function generateQualityNarrative(stepData: Array<{
  capability_name: string;
  test_results: {
    total_tests: number;
    passed: number;
    failed: number;
    pass_rate: number | null;
    avg_response_time_ms: number | null;
    failures?: Array<{ failure_category: string }>;
  };
}>): string {
  const totalTests = stepData.reduce((s, d) => s + d.test_results.total_tests, 0);
  const totalPassed = stepData.reduce((s, d) => s + d.test_results.passed, 0);
  const totalFailed = stepData.reduce((s, d) => s + d.test_results.failed, 0);

  const entity = stepData.length === 1 ? "capability" : "solution";

  if (totalTests === 0) {
    return `No test data available yet for this ${entity}.`;
  }

  const withResults = totalPassed + totalFailed;
  const passRate = withResults > 0
    ? parseFloat(((totalPassed / withResults) * 100).toFixed(1))
    : null;

  if (passRate === null) {
    return `No test data available yet for this ${entity}.`;
  }

  // Categorize failures
  const allFailures = stepData.flatMap(
    (d) => d.test_results.failures ?? [],
  );
  const externalCount = allFailures.filter((f) => f.failure_category === "external_service").length;
  const internalCount = allFailures.filter((f) => f.failure_category === "internal").length;
  const allExternal = totalFailed > 0 && internalCount === 0 && externalCount > 0;

  // Find capabilities with failures
  const failingSteps = stepData.filter(
    (d) => (d.test_results.failures?.length ?? 0) > 0,
  );

  if (passRate === 100) {
    return `All ${totalTests} test scenarios passing.`;
  }

  const plural = totalFailed > 1 ? "s" : "";

  if (passRate >= 90 && allExternal) {
    const names = failingSteps.map((d) => d.capability_name).join(", ");
    return `${totalPassed} of ${withResults} tests passing. ${totalFailed} external service issue${plural} in ${names} — third-party timeout or rate limit, not Strale code.`;
  }

  if (passRate >= 90) {
    return `${totalPassed} of ${withResults} tests passing. ${totalFailed} test${plural} failing — review details.`;
  }

  if (passRate >= 70) {
    return `${totalPassed} of ${withResults} tests passing. Some capabilities experiencing issues — review details before production use.`;
  }

  return `${totalPassed} of ${withResults} tests passing. Significant failures detected — check the detail page for known issues.`;
}

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
      dataSource: capabilities.dataSource,
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
      const [quality, testResultsData, limitations, suiteRows] = await Promise.all([
        getCapabilityQuality(step.capabilitySlug),
        getTestResultsForSlug(step.capabilitySlug),
        getLimitationsForSlug(step.capabilitySlug),
        db.select({ scheduleTier: testSuites.scheduleTier })
          .from(testSuites)
          .where(and(eq(testSuites.capabilitySlug, step.capabilitySlug), eq(testSuites.active, true)))
          .limit(1),
      ]);

      const scheduleTier = suiteRows[0]?.scheduleTier ?? "B";
      const nextScheduledRun = computeNextRun(scheduleTier, testResultsData.last_run);

      return {
        capability_slug: step.capabilitySlug,
        capability_name: step.capabilityName ?? step.capabilitySlug,
        data_source: step.dataSource ?? null,
        step_order: step.stepOrder,
        parallel_group: step.parallelGroup,
        schedule_tier: scheduleTier,
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
          next_scheduled_run: nextScheduledRun,
          total_tests: testResultsData.total_tests,
          passed: testResultsData.passed,
          failed: testResultsData.failed,
          pass_rate: testResultsData.pass_rate,
          avg_response_time_ms: testResultsData.avg_response_time_ms,
          by_type: testResultsData.by_type,
          ...(testResultsData.failures ? { failures: testResultsData.failures } : {}),
        },
        limitations,
      };
    }),
  );

  // Get the most recent COMPLETE run (all steps tested) for solution-level metrics
  const capSlugs = steps.map((s) => s.capabilitySlug);
  const completeRun = await getLatestCompleteRunForSolution(capSlugs, steps.length);

  // Use complete-run data for solution-level test_results (matches /runs endpoint)
  const allTestPassed = completeRun?.passed ?? 0;
  const allTestFailed = completeRun?.failed ?? 0;
  const allTestTotal = completeRun?.total_tests ?? 0;
  const lastTestRun = completeRun?.last_run ?? null;

  // Solution next_scheduled_run = earliest across all steps
  const nextRuns = stepData
    .map((d) => d.test_results.next_scheduled_run)
    .filter((t): t is string => t !== null)
    .sort();
  const nextScheduledRun = nextRuns[0] ?? null;

  // Effective schedule frequency = most frequent tier across steps
  const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };
  const tierHours = stepData.map((d) => TIER_HOURS[d.schedule_tier] ?? 24);
  const scheduleFrequencyHours = tierHours.length > 0 ? Math.min(...tierHours) : null;

  // Aggregate 30-day history across all step capabilities
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const historyRows = await db.execute(sql`
    WITH latest_per_suite_per_day AS (
      SELECT DISTINCT ON (tr.test_suite_id, DATE(tr.executed_at AT TIME ZONE 'UTC'))
        DATE(tr.executed_at AT TIME ZONE 'UTC') AS date,
        tr.passed,
        tr.response_time_ms
      FROM test_results tr
      WHERE tr.capability_slug IN (${sql.join(capSlugs.map((s) => sql`${s}`), sql`, `)})
        AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
      ORDER BY tr.test_suite_id, DATE(tr.executed_at AT TIME ZONE 'UTC'), tr.executed_at DESC
    )
    SELECT
      date,
      ROUND(SUM(CASE WHEN passed THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)::text AS pass_rate,
      ROUND(AVG(response_time_ms))::text AS avg_response_time_ms
    FROM latest_per_suite_per_day
    GROUP BY date
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

  // Use complete-run by_type and failures (from actual execution counts, not suite counts)
  const completeByType = completeRun?.by_type ?? aggregateByType(stepData);
  const completeFailures = completeRun?.failures ?? [];

  const sqs = await computeSolutionSQS(capSlugs);

  const solutionPerformance = buildPerformanceInfo(
    solutionQuality?.p95ResponseTimeMs ?? null,
    solutionQuality?.avgResponseTimeMs ?? null,
    steps.length,
  );

  const solutionTrustGrade = computeTrustGrade({
    sqsScore: sqs.pending ? null : sqs.score,
    sqsPending: sqs.pending,
    freshnessGrade: null,
    latencyGrade: solutionPerformance.latency_grade,
  });

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
        next_scheduled_run: nextScheduledRun,
        schedule_frequency_hours: scheduleFrequencyHours,
        total_tests: allTestTotal,
        passed: allTestPassed,
        failed: allTestFailed,
        pass_rate: completeRun?.pass_rate ?? null,
        avg_response_time_ms: completeRun?.avg_response_time_ms ?? null,
        by_type: completeByType,
        ...(completeFailures.length > 0 ? { failures: completeFailures } : {}),
        history_30d: history,
      },
      quality_narrative: generateQualityNarrative(stepData),
      limitations: allLimitations,
      steps: stepData,
    },
    sqs,
    performance: solutionPerformance,
    ...(solutionTrustGrade ? { trust_grade: solutionTrustGrade } : {}),
    methodology_url: "https://strale.dev/trust/methodology",
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── Related items endpoints ─────────────────────────────────────────────────

// GET /v1/internal/trust/capabilities/:slug/related
internalTrustRoute.get("/capabilities/:slug/related", async (c) => {
  const slug = c.req.param("slug");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) || 4 : 4, 1), 10);

  const related = await getRelatedCapabilities(slug, limit);
  return c.json(related, 200, {
    "Cache-Control": "public, max-age=300",
  });
});

// GET /v1/internal/trust/solutions/:slug/related
internalTrustRoute.get("/solutions/:slug/related", async (c) => {
  const slug = c.req.param("slug");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) || 4 : 4, 1), 10);

  const related = await getRelatedSolutions(slug, limit);
  return c.json(related, 200, {
    "Cache-Control": "public, max-age=300",
  });
});
