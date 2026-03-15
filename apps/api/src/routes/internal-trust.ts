/**
 * PUBLIC ENDPOINTS — intentional, no auth required.
 *
 * Trust, quality, and test data is public by design to support
 * Strale's transparency positioning. Anyone can verify capability
 * health without authentication. If this changes, add authMiddleware.
 *
 * Phase 3: Dual-profile model — QP + RP + matrix SQS + execution guidance.
 * Eliminated metrics: trust_grade, reliability_warning, schema_conformance_rate,
 * avg_field_completeness_pct, standalone success_rate/pass_rate.
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
import { determineBadge, getTestResultsForSlug } from "../lib/trust-helpers.js";
import { computeDualProfileSQS } from "../lib/sqs.js";
import { computeExecutionGuidance, type ComputeGuidanceInput, type ExecutionGuidance } from "../lib/execution-guidance.js";
import { computeFreshnessGrade } from "../lib/trust-grade.js";
import type { CapabilityType } from "../lib/reliability-profile.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const internalTrustRoute = new Hono<AppEnv>();

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000;
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
      title: capabilityLimitations.title,
      text: capabilityLimitations.limitationText,
      category: capabilityLimitations.category,
      severity: capabilityLimitations.severity,
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
    title: r.title,
    text: r.text,
    category: r.category,
    severity: r.severity,
    workaround: r.workaround,
  }));
}

// ─── Test history (30-day run counts) ────────────────────────────────────────

async function getTestHistory30d(slug: string) {
  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await db
    .select({
      passed: testResults.passed,
      failureClassification: testResults.failureClassification,
    })
    .from(testResults)
    .where(
      and(
        sql`${testResults.capabilitySlug} = ${slug}`,
        sql`${testResults.executedAt} >= ${thirtyDaysAgo.toISOString()}::timestamptz`,
      ),
    );

  const runs_30d = rows.length;
  const passed_30d = rows.filter((r) => r.passed).length;
  const failed_30d = runs_30d - passed_30d;
  const external_service_failures_30d = rows.filter(
    (r) =>
      !r.passed &&
      r.failureClassification != null &&
      (r.failureClassification.startsWith("upstream_")),
  ).length;

  return { runs_30d, passed_30d, failed_30d, external_service_failures_30d };
}

// ─── Schedule helpers ────────────────────────────────────────────────────────

const TIER_INTERVAL_MS: Record<string, number> = {
  A: 6 * 60 * 60 * 1000,
  B: 24 * 60 * 60 * 1000,
  C: 72 * 60 * 60 * 1000,
};

const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };

function computeNextRun(tier: string, lastRun: string | null): string | null {
  if (!lastRun) return null;
  const interval = TIER_INTERVAL_MS[tier];
  if (!interval) return null;
  return new Date(new Date(lastRun).getTime() + interval).toISOString();
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// ─── RP label ────────────────────────────────────────────────────────────────

function rpGradeToLabel(grade: string): string {
  switch (grade) {
    case "A": return "Highly reliable";
    case "B": return "Reliable";
    case "C": return "Degraded reliability";
    case "D": return "Unreliable right now";
    case "F": return "Down";
    default: return "Pending";
  }
}

// ─── Execution guidance helper ──────────────────────────────────────────────

async function computeGuidanceForSlug(
  slug: string,
  dual: Awaited<ReturnType<typeof computeDualProfileSQS>>,
  capRow: { capabilityType: string; priceCents: number; dataSource: string | null },
  lastTestedAt: string | null,
  testScheduleHours: number,
): Promise<ExecutionGuidance> {
  try {
    const rpAvailRate = dual.rp.factors.availability.has_data
      ? dual.rp.factors.availability.rate
      : 100;
    const hasExtFail = dual.rp.factors.availability.has_data
      && dual.rp.factors.availability.rate < 90;

    const input: ComputeGuidanceInput = {
      slug,
      qpGrade: dual.qp.grade === "pending" ? "F" : dual.qp.grade,
      rpGrade: dual.rp.grade === "pending" ? "F" : dual.rp.grade,
      rpScore: dual.rp.score,
      rpTrend: dual.rp.trend,
      rpAvailabilityRate: rpAvailRate,
      matrixSqs: dual.matrix.score,
      capabilityType: capRow.capabilityType as CapabilityType,
      testScheduleHours,
      lastTestedAt,
      priceCents: capRow.priceCents,
      dataSource: capRow.dataSource,
      hasExternalFailures: hasExtFail,
    };

    return await computeExecutionGuidance(input);
  } catch {
    // Safe default — capability assumed healthy
    return {
      usable: true,
      strategy: "direct",
      confidence_after_strategy: 100,
      config: {},
      error_handling: { distinguishable_errors: false, retryable: [], permanent: [] },
      if_strategy_fails: null,
      recovery: { estimated_hours: null, next_test: new Date().toISOString(), trend_context: null },
      cost_envelope: { primary_price_cents: capRow.priceCents, worst_case_with_retries_cents: capRow.priceCents, fallback_price_cents: null },
      circuit_breaker: false,
      context: "Guidance computation unavailable. Defaulting to direct execution.",
    };
  }
}

// ─── Format execution guidance for API response ────────────────────────────

function formatGuidanceForResponse(g: ExecutionGuidance): Record<string, unknown> {
  return {
    usable: g.usable,
    strategy: g.strategy,
    confidence_after_strategy: g.confidence_after_strategy,
    config: g.config,
    error_handling: g.error_handling,
    if_strategy_fails: g.if_strategy_fails ? {
      fallback_capability: g.if_strategy_fails.fallback_capability,
      fallback_coverage: g.if_strategy_fails.fallback_coverage,
      fallback_sqs: g.if_strategy_fails.fallback_sqs,
      fallback_price: g.if_strategy_fails.fallback_price_cents != null
        ? formatPrice(g.if_strategy_fails.fallback_price_cents)
        : null,
      fallback_verification_level: g.if_strategy_fails.fallback_verification_level,
      trigger: g.if_strategy_fails.trigger,
    } : null,
    recovery: g.recovery,
    cost_envelope: {
      primary_price: formatPrice(g.cost_envelope.primary_price_cents),
      worst_case_with_retries: formatPrice(g.cost_envelope.worst_case_with_retries_cents),
      fallback_price: g.cost_envelope.fallback_price_cents != null
        ? formatPrice(g.cost_envelope.fallback_price_cents)
        : null,
    },
    circuit_breaker: g.circuit_breaker,
    context: g.context,
  };
}

// ─── GET /v1/internal/trust/capabilities/batch ───────────────────────────────
// Returns dual-profile data for multiple capabilities in a single query.

internalTrustRoute.get("/capabilities/batch", async (c) => {
  const slugsParam = c.req.query("slugs") ?? "";
  const slugs = slugsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (slugs.length === 0) {
    return c.json(apiError("invalid_request", "slugs query parameter is required"), 400);
  }

  const cacheKey = `trust:batch:v2:${slugs.sort().join(",")}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const limitedSlugs = slugs.slice(0, 100);

  // Compute dual-profile SQS for all slugs
  const dualResults = await Promise.all(
    limitedSlugs.map((s) => computeDualProfileSQS(s).catch(() => null)),
  );

  const trustMap: Record<string, {
    sqs: number;
    sqs_label: string;
    quality: string;
    reliability: string;
    trend: string;
    usable: boolean;
    strategy: string;
    badge: string | null;
  }> = {};

  // Get cached guidance from DB for fast batch responses
  const db = getDb();
  const capRows = await db
    .select({
      slug: capabilities.slug,
      guidanceUsable: capabilities.guidanceUsable,
      guidanceStrategy: capabilities.guidanceStrategy,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, limitedSlugs));
  const guidanceMap = new Map(capRows.map((r) => [r.slug, r]));

  for (let i = 0; i < limitedSlugs.length; i++) {
    const slug = limitedSlugs[i];
    const dual = dualResults[i];
    const cached = guidanceMap.get(slug);

    if (!dual) {
      trustMap[slug] = {
        sqs: 0,
        sqs_label: "Pending",
        quality: "pending",
        reliability: "pending",
        trend: "stable",
        usable: cached?.guidanceUsable ?? true,
        strategy: cached?.guidanceStrategy ?? "direct",
        badge: null,
      };
      continue;
    }

    trustMap[slug] = {
      sqs: dual.matrix.score,
      sqs_label: dual.matrix.label,
      quality: dual.qp.grade,
      reliability: dual.rp.grade,
      trend: dual.rp.trend,
      usable: cached?.guidanceUsable ?? (dual.matrix.score >= 25),
      strategy: cached?.guidanceStrategy ?? "direct",
      badge: dual.matrix.pending ? null : "strale_tested",
    };
  }

  setCache(cacheKey, trustMap);
  return c.json(trustMap);
});

// ─── GET /v1/internal/trust/capabilities/:slug ──────────────────────────────

internalTrustRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:cap:v2:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();

  // Parallel data fetch
  const [capRow, testResultsData, limitations, suiteRows, testHistory] = await Promise.all([
    db.select({
      name: capabilities.name,
      dataSource: capabilities.dataSource,
      priceCents: capabilities.priceCents,
      capabilityType: capabilities.capabilityType,
      freshnessCategory: capabilities.freshnessCategory,
      dataUpdateCycleDays: capabilities.dataUpdateCycleDays,
      datasetLastUpdated: capabilities.datasetLastUpdated,
    })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1)
      .then((r) => r[0]),
    getTestResultsForSlug(slug),
    getLimitationsForSlug(slug),
    db.select({ scheduleTier: testSuites.scheduleTier })
      .from(testSuites)
      .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
      .limit(1),
    getTestHistory30d(slug),
  ]);

  if (!capRow) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  const scheduleTier = suiteRows[0]?.scheduleTier ?? "B";
  const scheduleFrequencyHours = TIER_HOURS[scheduleTier] ?? 24;

  // Compute dual-profile SQS
  const dual = await computeDualProfileSQS(slug);

  // Compute execution guidance
  const guidance = await computeGuidanceForSlug(
    slug, dual, capRow,
    testResultsData.last_run,
    scheduleFrequencyHours,
  );

  // Badge
  const testTxns = testResultsData.total_tests;
  const { badge, badge_label } = determineBadge(testTxns, 0, null);

  // Freshness
  const freshness = computeFreshnessGrade({
    freshnessCategory: capRow.freshnessCategory,
    dataUpdateCycleDays: capRow.dataUpdateCycleDays,
    datasetLastUpdated: capRow.datasetLastUpdated,
  });

  const result = {
    capability_slug: slug,
    data_source: capRow.dataSource ?? null,

    sqs: {
      score: dual.matrix.score,
      label: dual.matrix.label,
      trend: dual.rp.trend,
    },

    quality_profile: {
      grade: dual.qp.grade,
      score: dual.qp.score,
      label: dual.qp.label,
      factors: {
        correctness: { score: dual.qp.factors.correctness.rate, passed: dual.qp.factors.correctness.passed, total: dual.qp.factors.correctness.total, weight: dual.qp.factors.correctness.weight },
        schema: { score: dual.qp.factors.schema.rate, passed: dual.qp.factors.schema.passed, total: dual.qp.factors.schema.total, weight: dual.qp.factors.schema.weight },
        error_handling: { score: dual.qp.factors.error_handling.rate, passed: dual.qp.factors.error_handling.passed, total: dual.qp.factors.error_handling.total, weight: dual.qp.factors.error_handling.weight },
        edge_cases: { score: dual.qp.factors.edge_cases.rate, passed: dual.qp.factors.edge_cases.passed, total: dual.qp.factors.edge_cases.total, weight: dual.qp.factors.edge_cases.weight },
      },
    },

    reliability_profile: {
      grade: dual.rp.grade,
      score: dual.rp.score,
      label: rpGradeToLabel(dual.rp.grade),
      factors: {
        current_availability: { score: dual.rp.factors.availability.rate, detail: `${dual.rp.factors.availability.passed}/${dual.rp.factors.availability.total} passed`, weight: dual.rp.factors.availability.weight },
        rolling_success: { score: dual.rp.factors.correctness.rate, detail: `${dual.rp.factors.correctness.passed}/${dual.rp.factors.correctness.total} passed`, weight: dual.rp.factors.correctness.weight },
        upstream_health: { score: dual.rp.factors.schema.rate, detail: `${dual.rp.factors.schema.passed}/${dual.rp.factors.schema.total} passed`, weight: dual.rp.factors.schema.weight },
        error_resilience: { score: dual.rp.factors.error_handling.rate, detail: `${dual.rp.factors.error_handling.passed}/${dual.rp.factors.error_handling.total} passed`, weight: dual.rp.factors.error_handling.weight },
        latency: { score: dual.rp.factors.edge_cases.rate, detail: `${dual.rp.factors.edge_cases.passed}/${dual.rp.factors.edge_cases.total} passed`, weight: dual.rp.factors.edge_cases.weight },
      },
    },

    execution_guidance: formatGuidanceForResponse(guidance),

    freshness: freshness?.label ?? null,
    last_tested: testResultsData.last_run,
    test_schedule: `every ${scheduleFrequencyHours}h`,
    test_history: {
      runs_30d: testHistory.runs_30d,
      passed_30d: testHistory.passed_30d,
      failed_30d: testHistory.failed_30d,
      external_service_failures_30d: testHistory.external_service_failures_30d,
    },
    badge,
    badge_label,

    limitations,

    methodology_url: "https://strale.dev/trust/methodology",
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── GET /v1/internal/trust/solutions/:slug ─────────────────────────────────

internalTrustRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:sol:v2:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) return c.json(cached);

  const db = getDb();

  const [solRow] = await db
    .select({ id: solutions.id, complianceCoverage: solutions.complianceCoverage })
    .from(solutions)
    .where(eq(solutions.slug, slug))
    .limit(1);

  if (!solRow) {
    return c.json(apiError("not_found", `Solution '${slug}' not found.`), 404);
  }

  // Look up steps
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      capabilityName: capabilities.name,
      dataSource: capabilities.dataSource,
      priceCents: capabilities.priceCents,
      capabilityType: capabilities.capabilityType,
    })
    .from(solutionSteps)
    .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(eq(solutionSteps.solutionId, solRow.id))
    .orderBy(asc(solutionSteps.stepOrder));

  if (steps.length === 0) {
    return c.json(apiError("not_found", `Solution '${slug}' has no steps.`), 404);
  }

  // Per-step dual-profile data
  const stepData = await Promise.all(
    steps.map(async (step) => {
      const [dual, testResultsData, suiteRows] = await Promise.all([
        computeDualProfileSQS(step.capabilitySlug),
        getTestResultsForSlug(step.capabilitySlug),
        db.select({ scheduleTier: testSuites.scheduleTier })
          .from(testSuites)
          .where(and(eq(testSuites.capabilitySlug, step.capabilitySlug), eq(testSuites.active, true)))
          .limit(1),
      ]);

      const scheduleTier = suiteRows[0]?.scheduleTier ?? "B";
      const scheduleFrequencyHours = TIER_HOURS[scheduleTier] ?? 24;

      const guidance = await computeGuidanceForSlug(
        step.capabilitySlug, dual,
        { capabilityType: step.capabilityType ?? "stable_api", priceCents: step.priceCents ?? 0, dataSource: step.dataSource },
        testResultsData.last_run,
        scheduleFrequencyHours,
      );

      return {
        capability: step.capabilitySlug,
        sqs: dual.matrix.score,
        quality: dual.qp.grade,
        reliability: dual.rp.grade,
        trend: dual.rp.trend,
        usable: guidance.usable,
        strategy: guidance.strategy,
      };
    }),
  );

  // Solution-level: use weakest step approach
  const stepSqsValues = stepData.map((s) => s.sqs);
  const worstQuality = stepData.reduce((w, s) => {
    const order = ["A", "B", "C", "D", "F", "pending"];
    return order.indexOf(s.quality) > order.indexOf(w) ? s.quality : w;
  }, "A");
  const worstReliability = stepData.reduce((w, s) => {
    const order = ["A", "B", "C", "D", "F", "pending"];
    return order.indexOf(s.reliability) > order.indexOf(w) ? s.reliability : w;
  }, "A");

  // Solution SQS = average, capped at weakest + 20
  const avgSqs = stepSqsValues.reduce((a, b) => a + b, 0) / stepSqsValues.length;
  const minSqs = Math.min(...stepSqsValues);
  const solutionSqs = Math.round(Math.min(avgSqs, minSqs + 20) * 10) / 10;

  function sqsLabel(s: number): string {
    if (s >= 90) return "Excellent";
    if (s >= 75) return "Good";
    if (s >= 50) return "Fair";
    if (s >= 25) return "Poor";
    return "Degraded";
  }

  // Solution trend: majority of step trends
  const trendCounts = { improving: 0, declining: 0, stable: 0 };
  for (const s of stepData) trendCounts[s.trend]++;
  const solutionTrend =
    trendCounts.declining > trendCounts.improving ? "declining"
      : trendCounts.improving > trendCounts.declining ? "improving"
        : "stable";

  // Solution usable = all steps usable
  const solutionUsable = stepData.every((s) => s.usable);

  // Solution strategy = worst step strategy
  const strategyOrder = ["direct", "retry_with_backoff", "queue_for_later", "unavailable"];
  const solutionStrategy = stepData.reduce((w, s) => {
    return strategyOrder.indexOf(s.strategy) > strategyOrder.indexOf(w) ? s.strategy : w;
  }, "direct");

  const testTxns = stepData.length; // simplified
  const { badge, badge_label } = determineBadge(testTxns, 0, null);

  // Aggregate test history across all steps
  const stepHistories = await Promise.all(steps.map((s) => getTestHistory30d(s.capabilitySlug)));
  const solutionTestHistory = stepHistories.reduce(
    (acc, h) => ({
      runs_30d: acc.runs_30d + h.runs_30d,
      passed_30d: acc.passed_30d + h.passed_30d,
      failed_30d: acc.failed_30d + h.failed_30d,
      external_service_failures_30d: acc.external_service_failures_30d + h.external_service_failures_30d,
    }),
    { runs_30d: 0, passed_30d: 0, failed_30d: 0, external_service_failures_30d: 0 },
  );

  // Get limitations across all steps
  const allLimitations = await Promise.all(
    steps.map((s) => getLimitationsForSlug(s.capabilitySlug)),
  ).then((arr) => arr.flat());

  const result = {
    solution_slug: slug,
    data_source: steps.map((s) => s.dataSource).filter(Boolean).join(", ") || null,

    sqs: {
      score: solutionSqs,
      label: sqsLabel(solutionSqs),
      trend: solutionTrend,
    },

    quality_profile: {
      grade: worstQuality,
      label: `Code quality: ${worstQuality}`,
    },

    reliability_profile: {
      grade: worstReliability,
      label: rpGradeToLabel(worstReliability),
    },

    execution_guidance: {
      usable: solutionUsable,
      strategy: solutionStrategy,
      confidence_after_strategy: solutionUsable ? Math.min(...stepData.map(() => 100)) : 0,
      context: solutionUsable
        ? "All steps operational."
        : `Some steps unavailable. Check per-step breakdown.`,
    },

    badge,
    badge_label,

    steps: stepData,

    test_history: solutionTestHistory,

    limitations: allLimitations,

    methodology_url: "https://strale.dev/trust/methodology",
  };

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── Related items endpoints ─────────────────────────────────────────────────

internalTrustRoute.get("/capabilities/:slug/related", async (c) => {
  const slug = c.req.param("slug");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) || 4 : 4, 1), 10);

  const related = await getRelatedCapabilities(slug, limit);
  return c.json(related, 200, {
    "Cache-Control": "public, max-age=300",
  });
});

internalTrustRoute.get("/solutions/:slug/related", async (c) => {
  const slug = c.req.param("slug");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) || 4 : 4, 1), 10);

  const related = await getRelatedSolutions(slug, limit);
  return c.json(related, 200, {
    "Cache-Control": "public, max-age=300",
  });
});
