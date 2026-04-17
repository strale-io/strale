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
import { eq, and, asc, desc, sql, inArray, gte } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb } from "../db/index.js";
import { getRelatedCapabilities, getRelatedSolutions } from "../lib/related-items.js";
import {
  solutions,
  solutionSteps,
  capabilities,
  capabilityLimitations,
  testSuites,
  testResults,
  sqsDailySnapshot,
} from "../db/schema.js";
import { determineBadge, getTestResultsForSlug, getTestResultsForSlugs } from "../lib/trust-helpers.js";
import { computeDualProfileSQS } from "../lib/sqs.js";
import { computeExecutionGuidance, type ComputeGuidanceInput, type ExecutionGuidance } from "../lib/execution-guidance.js";
import { computeFreshnessGrade } from "../lib/trust-grade.js";
import { computeFreshnessDecay, applyFreshnessDecay, shouldOverrideTrend, type FreshnessResult } from "../lib/freshness-decay.js";
import type { CapabilityType } from "../lib/reliability-profile.js";
import { apiError } from "../lib/errors.js";
import { getCapabilityProfile, getSolutionProfile } from "../lib/compliance-profile.js";
import { sqsLabel, gradeFromScore, computeSolutionScore, computeSolutionTrend, worstFreshnessLevel, oldestTestedAt } from "../lib/trust-labels.js";
import type { AppEnv } from "../types.js";

export const internalTrustRoute = new Hono<AppEnv>();

// ─── Cache (stale-while-revalidate) ─────────────────────────────────────────

const CACHE_FRESH_MS = 2 * 60 * 1000;   // Fresh for 2 min
const CACHE_STALE_MS = 30 * 60 * 1000;  // Serve stale up to 30 min

interface CacheEntry<T> { data: T; freshUntil: number; staleUntil: number }
const cache = new Map<string, CacheEntry<unknown>>();
const revalidating = new Set<string>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.staleUntil) { cache.delete(key); return null; }
  return entry.data as T;
}

function getCachedWithRevalidate<T>(key: string, compute: () => Promise<T>): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.staleUntil) { cache.delete(key); return null; }
  if (now < entry.freshUntil) return entry.data as T;
  // Stale — trigger background revalidation
  if (!revalidating.has(key)) {
    revalidating.add(key);
    compute()
      .then((data) => setCache(key, data))
      .catch((err) => console.warn(`[cache] Background revalidation failed for ${key}:`, err))
      .finally(() => revalidating.delete(key));
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  const now = Date.now();
  cache.set(key, { data, freshUntil: now + CACHE_FRESH_MS, staleUntil: now + CACHE_STALE_MS });
}

// ─── Concurrency limiter for parallel SQS computations ──────────────────────
// Prevents connection pool saturation when batch endpoints fire 100+ parallel queries
const dbConcurrency = pLimit(10);

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
  freshness?: FreshnessResult,
): Promise<ExecutionGuidance> {
  try {
    const rpAvailRate = dual.rp.factors.current_availability.score;
    const hasExtFail = dual.rp.factors.current_availability.score < 90;
    const effectiveTrend = freshness && shouldOverrideTrend(freshness) ? "declining" as const : dual.rp.trend;
    const effectiveSqs = freshness ? applyFreshnessDecay(dual.matrix.score, freshness) : dual.matrix.score;

    const input: ComputeGuidanceInput = {
      slug,
      qpGrade: dual.qp.grade === "pending" ? "F" : dual.qp.grade,
      rpGrade: dual.rp.grade === "pending" ? "F" : dual.rp.grade,
      rpScore: dual.rp.score,
      rpTrend: effectiveTrend,
      rpAvailabilityRate: rpAvailRate,
      matrixSqs: effectiveSqs,
      capabilityType: capRow.capabilityType as CapabilityType,
      testScheduleHours,
      lastTestedAt,
      priceCents: capRow.priceCents,
      dataSource: capRow.dataSource,
      hasExternalFailures: hasExtFail,
    };

    let guidance = await computeExecutionGuidance(input);

    // Apply freshness overrides
    if (freshness) {
      if (freshness.staleness_level === "expired" || freshness.staleness_level === "unverified") {
        const daysSinceTested = lastTestedAt
          ? Math.round((Date.now() - new Date(lastTestedAt).getTime()) / 86400_000)
          : null;
        guidance = {
          ...guidance,
          usable: false,
          strategy: "unavailable",
          confidence_after_strategy: 0,
          context: daysSinceTested != null
            ? `Capability has not been tested in ${daysSinceTested} days. Quality cannot be verified.`
            : "Capability has never been tested. Quality cannot be verified.",
        };
      } else if (freshness.staleness_level === "stale") {
        guidance = {
          ...guidance,
          confidence_after_strategy: Math.round(guidance.confidence_after_strategy * 0.5),
          strategy: guidance.strategy === "direct" ? "retry_with_backoff" : guidance.strategy,
        };
      }
    }

    return guidance;
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

  const limitedSlugs = slugs.slice(0, 100);
  const cacheKey = `trust:batch:v2:${limitedSlugs.sort().join(",")}`;

  const computeBatch = async () => {

  // Read all trust data from DB columns (populated by test runner + staleness refresh job)
  const db = getDb();
  const capRows = await db
    .select({
      slug: capabilities.slug,
      matrixSqs: capabilities.matrixSqs,
      matrixSqsRaw: capabilities.matrixSqsRaw,
      qpScore: capabilities.qpScore,
      rpScore: capabilities.rpScore,
      trend: capabilities.trend,
      freshnessLevel: capabilities.freshnessLevel,
      guidanceUsable: capabilities.guidanceUsable,
      guidanceStrategy: capabilities.guidanceStrategy,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, limitedSlugs));

  const trustMap: Record<string, {
    sqs: number;
    raw_sqs: number;
    sqs_label: string;
    quality: string;
    reliability: string;
    trend: string;
    usable: boolean;
    strategy: string;
    badge: string | null;
    freshness_level: string;
  }> = {};

  const capMap = new Map(capRows.map((r) => [r.slug, r]));

  for (const slug of limitedSlugs) {
    const cap = capMap.get(slug);
    if (!cap || cap.matrixSqs == null) {
      trustMap[slug] = {
        sqs: 0,
        raw_sqs: 0,
        sqs_label: "Pending",
        quality: "pending",
        reliability: "pending",
        trend: "stable",
        usable: cap?.guidanceUsable ?? true,
        strategy: cap?.guidanceStrategy ?? "direct",
        badge: null,
        freshness_level: cap?.freshnessLevel ?? "unverified",
      };
      continue;
    }

    const sqs = parseFloat(cap.matrixSqs);
    const rawSqs = cap.matrixSqsRaw ? parseFloat(cap.matrixSqsRaw) : sqs;

    trustMap[slug] = {
      sqs,
      raw_sqs: rawSqs,
      sqs_label: sqsLabel(sqs),
      quality: gradeFromScore(cap.qpScore),
      reliability: gradeFromScore(cap.rpScore),
      trend: cap.trend ?? "stable",
      usable: cap.guidanceUsable ?? (sqs >= 25),
      strategy: cap.guidanceStrategy ?? "direct",
      badge: "strale_tested",
      freshness_level: cap.freshnessLevel ?? "fresh",
    };
  }

    return trustMap;
  };

  const cached = getCachedWithRevalidate(cacheKey, computeBatch);
  if (cached) return c.json(cached);

  const result = await computeBatch();
  setCache(cacheKey, result);
  return c.json(result);
});

// ─── GET /v1/internal/trust/capabilities/:slug/sqs-history ──────────────────
// Returns the last 90 days of daily SQS snapshots for a capability.

internalTrustRoute.get("/capabilities/:slug/sqs-history", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:sqs-history:${slug}`;

  const computeHistory = async () => {
    const db = getDb();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const rows = await db
      .select({
        date: sqsDailySnapshot.snapshotDate,
        sqs: sqsDailySnapshot.matrixSqs,
        qpGrade: sqsDailySnapshot.qpGrade,
        rpGrade: sqsDailySnapshot.rpGrade,
        trend: sqsDailySnapshot.trend,
        healthState: sqsDailySnapshot.healthState,
        runsAnalyzed: sqsDailySnapshot.runsAnalyzed,
      })
      .from(sqsDailySnapshot)
      .where(
        and(
          eq(sqsDailySnapshot.capabilitySlug, slug),
          gte(sqsDailySnapshot.snapshotDate, ninetyDaysAgo.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(desc(sqsDailySnapshot.snapshotDate));

    return {
      capability_slug: slug,
      history: rows.map((r) => ({
        date: r.date,
        sqs: parseFloat(r.sqs),
        qp_grade: r.qpGrade,
        rp_grade: r.rpGrade,
        trend: r.trend,
        health_state: r.healthState,
        runs_analyzed: r.runsAnalyzed,
      })),
    };
  };

  const cached = getCachedWithRevalidate(cacheKey, computeHistory);
  if (cached) return c.json(cached);

  const result = await computeHistory();
  setCache(cacheKey, result);
  return c.json(result);
});

// ─── GET /v1/internal/trust/capabilities/:slug ──────────────────────────────

internalTrustRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:cap:v2:${slug}`;

  const computeCapDetail = async () => {
  const db = getDb();

  // Parallel data fetch
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [capRow, testResultsData, limitations, suiteRows, testHistory, classificationRows] = await Promise.all([
    db.select({
      name: capabilities.name,
      dataSource: capabilities.dataSource,
      priceCents: capabilities.priceCents,
      capabilityType: capabilities.capabilityType,
      freshnessCategory: capabilities.freshnessCategory,
      dataUpdateCycleDays: capabilities.dataUpdateCycleDays,
      datasetLastUpdated: capabilities.datasetLastUpdated,
      isActive: capabilities.isActive,
      // Pre-computed trust columns (written by persistDualProfileScores + staleness refresh)
      matrixSqs: capabilities.matrixSqs,
      matrixSqsRaw: capabilities.matrixSqsRaw,
      qpScore: capabilities.qpScore,
      rpScore: capabilities.rpScore,
      trend: capabilities.trend,
      freshnessLevel: capabilities.freshnessLevel,
      lastTestedAt: capabilities.lastTestedAt,
      guidanceUsable: capabilities.guidanceUsable,
      guidanceStrategy: capabilities.guidanceStrategy,
    })
      .from(capabilities)
      .where(and(eq(capabilities.slug, slug), eq(capabilities.isActive, true)))
      .limit(1)
      .then((r) => r[0]),
    getTestResultsForSlug(slug),
    getLimitationsForSlug(slug),
    db.select({ scheduleTier: testSuites.scheduleTier })
      .from(testSuites)
      .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
      .limit(1),
    getTestHistory30d(slug),
    db.execute(sql`
      SELECT
        COALESCE(failure_classification, 'unclassified') AS verdict,
        COUNT(*) AS count
      FROM test_results
      WHERE capability_slug = ${slug}
        AND passed = false
        AND executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
      GROUP BY failure_classification
      ORDER BY count DESC
    `),
  ]);

  if (!capRow) return null; // Signal 404

  const scheduleTier = suiteRows[0]?.scheduleTier ?? "B";
  const scheduleFrequencyHours = TIER_HOURS[scheduleTier] ?? 24;

  // Live dual-profile computation — used for factor breakdowns + guidance only.
  // Headline SQS/grades/trend/freshness come from DB columns (same source as
  // solution pages, list pages, batch endpoints — ensures consistency).
  const dual = await computeDualProfileSQS(slug);

  // Freshness decay — still needed for guidance computation.
  // NOT used for headline SQS (DB matrix_sqs already has decay applied).
  const freshnessDecay = computeFreshnessDecay(
    testResultsData.last_run ? new Date(testResultsData.last_run) : null,
    scheduleFrequencyHours,
  );

  // Compute execution guidance (needs live dual + freshness for full breakdown)
  const guidance = await computeGuidanceForSlug(
    slug, dual, capRow,
    testResultsData.last_run,
    scheduleFrequencyHours,
    freshnessDecay,
  );

  // Badge
  const testTxns = testResultsData.total_tests;
  const { badge, badge_label } = determineBadge(testTxns, 0, null);

  // Data freshness grade (dataset freshness — different from test freshness)
  const dataFreshness = computeFreshnessGrade({
    freshnessCategory: capRow.freshnessCategory,
    dataUpdateCycleDays: capRow.dataUpdateCycleDays,
    datasetLastUpdated: capRow.datasetLastUpdated,
  });

  // Headline values: prefer pre-computed DB columns (consistent with all other
  // endpoints). Fall back to live computation for newly created capabilities
  // that haven't been through a persist cycle yet.
  const hasDbScores = capRow.matrixSqs != null;

  const headlineSqs = hasDbScores
    ? parseFloat(capRow.matrixSqs!)
    : (dual.matrix.pending ? dual.matrix.score : applyFreshnessDecay(dual.matrix.score, freshnessDecay));
  const headlineRawSqs = hasDbScores && capRow.matrixSqsRaw
    ? parseFloat(capRow.matrixSqsRaw)
    : dual.matrix.score;
  const headlinePending = !hasDbScores && dual.matrix.pending;
  const headlineLabel = headlinePending ? dual.matrix.label : sqsLabel(headlineSqs);
  const headlineTrend = hasDbScores ? (capRow.trend ?? "stable") : (shouldOverrideTrend(freshnessDecay) ? "stale" : dual.rp.trend);
  const headlineFreshnessLevel = hasDbScores ? (capRow.freshnessLevel ?? "fresh") : freshnessDecay.staleness_level;
  const headlineLastTestedAt = hasDbScores
    ? (capRow.lastTestedAt?.toISOString() ?? null)
    : freshnessDecay.last_tested_at;

  // For freshness detail: when using DB columns, derive decay_applied from
  // the difference between raw and decayed scores.
  const headlineDecayApplied = hasDbScores
    ? Math.round((headlineRawSqs - headlineSqs) * 10) / 10
    : (freshnessDecay.staleness_level === "unverified" ? dual.matrix.score : freshnessDecay.decay_points);

  // Headline QP/RP grades from DB (consistent with solution pages)
  const headlineQpGrade = hasDbScores ? gradeFromScore(capRow.qpScore) : dual.qp.grade;
  const headlineQpScore = hasDbScores && capRow.qpScore != null ? parseFloat(capRow.qpScore) : dual.qp.score;
  const headlineRpGrade = hasDbScores ? gradeFromScore(capRow.rpScore) : dual.rp.grade;
  const headlineRpScore = hasDbScores && capRow.rpScore != null ? parseFloat(capRow.rpScore) : dual.rp.score;

  const result = {
    capability_slug: slug,
    data_source: capRow.dataSource ?? null,

    sqs: {
      score: headlineSqs,
      raw_score: headlineRawSqs,
      label: headlineLabel,
      trend: headlineTrend,
      freshness: {
        level: headlineFreshnessLevel,
        last_tested_at: headlineLastTestedAt,
        decay_applied: headlineDecayApplied,
      },
    },

    quality_profile: {
      grade: headlineQpGrade,
      score: headlineQpScore,
      label: dual.qp.label,
      // Factor breakdowns from live computation (detailed per-factor pass/fail)
      factors: {
        correctness: { score: dual.qp.factors.correctness.rate, passed: dual.qp.factors.correctness.passed, total: dual.qp.factors.correctness.total, weight: dual.qp.factors.correctness.weight },
        schema: { score: dual.qp.factors.schema.rate, passed: dual.qp.factors.schema.passed, total: dual.qp.factors.schema.total, weight: dual.qp.factors.schema.weight },
        error_handling: { score: dual.qp.factors.error_handling.rate, passed: dual.qp.factors.error_handling.passed, total: dual.qp.factors.error_handling.total, weight: dual.qp.factors.error_handling.weight },
        edge_cases: { score: dual.qp.factors.edge_cases.rate, passed: dual.qp.factors.edge_cases.passed, total: dual.qp.factors.edge_cases.total, weight: dual.qp.factors.edge_cases.weight },
      },
    },

    reliability_profile: {
      grade: headlineRpGrade,
      score: headlineRpScore,
      label: rpGradeToLabel(headlineRpGrade),
      // Factor breakdowns from live computation (detailed per-factor scores)
      factors: {
        current_availability: { score: dual.rp.factors.current_availability.score, weight: dual.rp.factors.current_availability.weight, detail: dual.rp.factors.current_availability.detail, source: dual.rp.factors.current_availability.source },
        rolling_success: { score: dual.rp.factors.rolling_success.score, weight: dual.rp.factors.rolling_success.weight, detail: dual.rp.factors.rolling_success.detail, source: dual.rp.factors.rolling_success.source },
        upstream_health: { score: dual.rp.factors.upstream_health.score, weight: dual.rp.factors.upstream_health.weight, detail: dual.rp.factors.upstream_health.detail, source: dual.rp.factors.upstream_health.source },
        latency: { score: dual.rp.factors.latency.score, weight: dual.rp.factors.latency.weight, detail: dual.rp.factors.latency.detail, source: dual.rp.factors.latency.source },
      },
    },

    execution_guidance: formatGuidanceForResponse(guidance),

    data_freshness: dataFreshness?.label ?? null,
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

    failure_classification: ((Array.isArray(classificationRows)
      ? classificationRows
      : (classificationRows as any)?.rows ?? []) as any[])
      .reduce((acc: Record<string, number>, r: any) => {
        acc[r.verdict] = Number(r.count);
        return acc;
      }, {}),

    methodology_url: "https://strale.dev/trust/methodology",
  };
  return result;
  };

  const cached = getCachedWithRevalidate(cacheKey, computeCapDetail);
  if (cached) return c.json(cached);

  const result = await computeCapDetail();
  if (!result) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  setCache(cacheKey, result);
  return c.json(result);
});

// ─── GET /v1/internal/trust/solutions/batch ──────────────────────────────────
// Returns trust data for multiple solutions in a single request.
// Optimized: collects all unique capability slugs across all solutions,
// batch-computes trust data once per capability, then assembles per-solution profiles.
// MUST be registered before /solutions/:slug to avoid :slug matching "batch".

internalTrustRoute.get("/solutions/batch", async (c) => {
  const slugsParam = c.req.query("slugs") ?? "";
  const requestedSlugs = slugsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (requestedSlugs.length === 0) {
    return c.json(apiError("invalid_request", "slugs query parameter is required"), 400);
  }

  const limitedSlugs = requestedSlugs.slice(0, 50);
  const cacheKey = `trust:sol-batch:v1:${limitedSlugs.sort().join(",")}`;

  const computeSolBatch = async () => {
  const db = getDb();

  // 1. Fetch all requested solutions and their steps in batch
  const solRows = await db
    .select({ id: solutions.id, slug: solutions.slug })
    .from(solutions)
    .where(inArray(solutions.slug, limitedSlugs));

  if (solRows.length === 0) {
    return { solutions: {} };
  }

  const solIds = solRows.map((r) => r.id);
  const solIdToSlug = new Map(solRows.map((r) => [r.id, r.slug]));

  const batchSteps = await db
    .select({
      solutionId: solutionSteps.solutionId,
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      guidanceUsable: capabilities.guidanceUsable,
      guidanceStrategy: capabilities.guidanceStrategy,
    })
    .from(solutionSteps)
    .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(inArray(solutionSteps.solutionId, solIds))
    .orderBy(asc(solutionSteps.stepOrder));

  // Group steps by solution slug
  const stepsBySolution = new Map<string, typeof batchSteps>();
  for (const step of batchSteps) {
    const solSlug = solIdToSlug.get(step.solutionId);
    if (!solSlug) continue;
    if (!stepsBySolution.has(solSlug)) stepsBySolution.set(solSlug, []);
    stepsBySolution.get(solSlug)!.push(step);
  }

  // 2. Collect all unique capability slugs and batch-read trust columns from DB
  const uniqueCapSlugs = [...new Set(batchSteps.map((s) => s.capabilitySlug))];

  const capTrustRows = await db
    .select({
      slug: capabilities.slug,
      matrixSqs: capabilities.matrixSqs,
      matrixSqsRaw: capabilities.matrixSqsRaw,
      qpScore: capabilities.qpScore,
      rpScore: capabilities.rpScore,
      trend: capabilities.trend,
      freshnessLevel: capabilities.freshnessLevel,
      lastTestedAt: capabilities.lastTestedAt,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, uniqueCapSlugs));

  const capTrustMap = new Map(capTrustRows.map((r) => [r.slug, r]));

  // 3. Assemble per-solution trust profiles
  const gradeOrder = ["A", "B", "C", "D", "F", "pending"];
  const strategyOrder = ["direct", "retry_with_backoff", "queue_for_later", "unavailable"];

  const solutionsResult: Record<string, unknown> = {};

  for (const solSlug of limitedSlugs) {
    const solSteps = stepsBySolution.get(solSlug);
    if (!solSteps || solSteps.length === 0) continue;

    const stepData = solSteps.map((step) => {
      const ct = capTrustMap.get(step.capabilitySlug);
      const sqs = ct?.matrixSqs ? parseFloat(ct.matrixSqs) : 0;
      const qpScore = ct?.qpScore ? parseFloat(ct.qpScore) : 0;
      const rpScore = ct?.rpScore ? parseFloat(ct.rpScore) : 0;

      return {
        capability: step.capabilitySlug,
        sqs,
        quality: gradeFromScore(ct?.qpScore ?? null),
        reliability: gradeFromScore(ct?.rpScore ?? null),
        qp_score: qpScore,
        rp_score: rpScore,
        trend: ct?.trend ?? "stable",
        freshness_level: ct?.freshnessLevel ?? "fresh",
        last_tested_at: ct?.lastTestedAt?.toISOString() ?? null,
        usable: step.guidanceUsable ?? (sqs >= 25),
        strategy: step.guidanceStrategy ?? "direct",
      };
    });

    const solutionSqs = computeSolutionScore(stepData.map((s) => s.sqs));

    const worstQuality = stepData.reduce((w, s) => {
      return gradeOrder.indexOf(s.quality) > gradeOrder.indexOf(w) ? s.quality : w;
    }, "A");
    const worstReliability = stepData.reduce((w, s) => {
      return gradeOrder.indexOf(s.reliability) > gradeOrder.indexOf(w) ? s.reliability : w;
    }, "A");

    const solutionQpScore = Math.round(Math.min(...stepData.map((s) => s.qp_score)) * 10) / 10;
    const solutionRpScore = Math.round(Math.min(...stepData.map((s) => s.rp_score)) * 10) / 10;

    const solutionTrend = computeSolutionTrend(stepData.map((s) => s.trend));
    const solutionFreshness = worstFreshnessLevel(stepData.map((s) => s.freshness_level));
    const solutionLastTestedAt = oldestTestedAt(stepData.map((s) => s.last_tested_at ? new Date(s.last_tested_at) : null));

    const solutionUsable = stepData.every((s) => s.usable);
    const solutionStrategy = stepData.reduce((w, s) => {
      return strategyOrder.indexOf(s.strategy) > strategyOrder.indexOf(w) ? s.strategy : w;
    }, "direct");

    const { badge } = determineBadge(stepData.length, 0, null);

    // Detect pending steps: SQS 0 AND qp_score 0 (never tested, not degraded)
    const hasPendingStep = stepData.some((s) => s.sqs === 0 && s.qp_score === 0 && s.quality === "pending");

    solutionsResult[solSlug] = {
      sqs: {
        score: hasPendingStep ? null : solutionSqs,
        label: hasPendingStep ? "Building track record" : sqsLabel(solutionSqs),
        trend: hasPendingStep ? "stable" : solutionTrend,
        freshness_level: solutionFreshness,
        last_tested_at: solutionLastTestedAt,
        pending: hasPendingStep || undefined,
      },
      quality_profile: {
        grade: hasPendingStep ? "pending" : worstQuality,
        score: hasPendingStep ? 0 : solutionQpScore,
        label: hasPendingStep ? "Building track record" : `Code quality: ${worstQuality} (weakest step)`,
      },
      reliability_profile: {
        grade: hasPendingStep ? "pending" : worstReliability,
        score: hasPendingStep ? 0 : solutionRpScore,
        label: hasPendingStep ? "Building track record" : `${rpGradeToLabel(worstReliability)} (weakest step)`,
      },
      execution_guidance: { usable: hasPendingStep ? false : solutionUsable, strategy: hasPendingStep ? "queue_for_later" : solutionStrategy },
      badge,
      steps: stepData,
    };
  }

    return { solutions: solutionsResult };
  };

  const cached = getCachedWithRevalidate(cacheKey, computeSolBatch);
  if (cached) return c.json(cached);

  const result = await computeSolBatch();
  setCache(cacheKey, result);
  return c.json(result);
});

// ─── GET /v1/internal/trust/solutions/:slug ─────────────────────────────────

internalTrustRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `trust:sol:v2:${slug}`;

  const computeSolDetail = async () => {
  const db = getDb();

  const [solRow] = await db
    .select({ id: solutions.id, complianceCoverage: solutions.complianceCoverage })
    .from(solutions)
    .where(eq(solutions.slug, slug))
    .limit(1);

  if (!solRow) return null; // Signal 404

  // Look up steps
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      capabilityName: capabilities.name,
      dataSource: capabilities.dataSource,
      priceCents: capabilities.priceCents,
      capabilityType: capabilities.capabilityType,
      // Trust columns from DB (written by test runner + staleness refresh job)
      matrixSqs: capabilities.matrixSqs,
      matrixSqsRaw: capabilities.matrixSqsRaw,
      qpScore: capabilities.qpScore,
      rpScore: capabilities.rpScore,
      trend: capabilities.trend,
      freshnessLevel: capabilities.freshnessLevel,
      lastTestedAt: capabilities.lastTestedAt,
      guidanceUsable: capabilities.guidanceUsable,
      guidanceStrategy: capabilities.guidanceStrategy,
    })
    .from(solutionSteps)
    .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(eq(solutionSteps.solutionId, solRow.id))
    .orderBy(asc(solutionSteps.stepOrder));

  if (steps.length === 0) return null; // Signal 404

  // Pre-fetch test results for test history (still needed for test_history section)
  const stepSlugs = steps.map((s) => s.capabilitySlug);

  // Per-step trust data — read from DB columns
  const stepData = steps.map((step) => {
    const sqs = step.matrixSqs ? parseFloat(step.matrixSqs) : 0;
    const qpScore = step.qpScore ? parseFloat(step.qpScore) : 0;
    const rpScore = step.rpScore ? parseFloat(step.rpScore) : 0;

    return {
      capability: step.capabilitySlug,
      sqs,
      quality: gradeFromScore(step.qpScore),
      reliability: gradeFromScore(step.rpScore),
      qp_score: qpScore,
      rp_score: rpScore,
      trend: step.trend ?? "stable",
      freshness_level: step.freshnessLevel ?? "fresh",
      last_tested_at: step.lastTestedAt?.toISOString() ?? null,
      usable: step.guidanceUsable ?? (sqs >= 25),
      strategy: step.guidanceStrategy ?? "direct",
    };
  });

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

  // Solution QP/RP numeric scores = minimum across steps (weakest-link)
  const solutionQpScore = Math.round(Math.min(...stepData.map((s) => s.qp_score)) * 10) / 10;
  const solutionRpScore = Math.round(Math.min(...stepData.map((s) => s.rp_score)) * 10) / 10;

  // Solution SQS = average, capped at weakest + 20
  const solutionSqs = computeSolutionScore(stepSqsValues);

  // Solution trend: majority of step trends (stale overrides all)
  const solutionTrend = computeSolutionTrend(stepData.map((s) => s.trend));

  // Solution freshness: worst across steps
  const solutionFreshness = worstFreshnessLevel(stepData.map((s) => s.freshness_level));
  const solutionLastTestedAt = oldestTestedAt(stepData.map((s) => s.last_tested_at ? new Date(s.last_tested_at) : null));

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
      freshness_level: solutionFreshness,
      last_tested_at: solutionLastTestedAt,
      scoring_note: "Solution SQS is a weighted average of per-step SQS scores, capped at weakest step + 20. QP/RP grades below show the weakest step (conservative). These grades may not directly map to the SQS score via the matrix — the matrix applies at step level, not solution level.",
    },

    quality_profile: {
      grade: worstQuality,
      score: solutionQpScore,
      label: `Code quality: ${worstQuality} (weakest step)`,
    },

    reliability_profile: {
      grade: worstReliability,
      score: solutionRpScore,
      label: `${rpGradeToLabel(worstReliability)} (weakest step)`,
    },

    execution_guidance: {
      usable: solutionUsable,
      strategy: solutionStrategy,
      confidence_after_strategy: solutionUsable
        ? Math.min(...stepData.map((s) => {
            if (s.reliability === "A") return 100;
            if (s.reliability === "B") return 90;
            return Math.min(99, Math.round(s.rp_score));
          }))
        : 0,
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
  return result;
  };

  const cached = getCachedWithRevalidate(cacheKey, computeSolDetail);
  if (cached) return c.json(cached);

  const result = await computeSolDetail();
  if (!result) {
    return c.json(apiError("not_found", `Solution '${slug}' not found or has no steps.`), 404);
  }

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

// ─── Compliance profile (derived, no drift) ─────────────────────────────────
// Describes what a capability/solution *would* produce — data sources,
// AI involvement, regulatory mapping, jurisdiction. Distinct from runtime
// audit records (which describe an actual transaction). See
// src/lib/compliance-profile.ts for the field contract and rationale.

internalTrustRoute.get("/capabilities/:slug/compliance-profile", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `compliance-profile:cap:${slug}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) return c.json(cached, 200, { "Cache-Control": "public, max-age=300" });

  const profile = await getCapabilityProfile(slug);
  if (!profile) {
    return c.json(apiError("not_found", `Capability '${slug}' not found or inactive.`), 404);
  }
  setCache(cacheKey, profile);
  return c.json(profile, 200, { "Cache-Control": "public, max-age=300" });
});

internalTrustRoute.get("/solutions/:slug/compliance-profile", async (c) => {
  const slug = c.req.param("slug");
  const cacheKey = `compliance-profile:sol:${slug}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) return c.json(cached, 200, { "Cache-Control": "public, max-age=300" });

  const profile = await getSolutionProfile(slug);
  if (!profile) {
    return c.json(apiError("not_found", `Solution '${slug}' not found or inactive.`), 404);
  }
  setCache(cacheKey, profile);
  return c.json(profile, 200, { "Cache-Control": "public, max-age=300" });
});
