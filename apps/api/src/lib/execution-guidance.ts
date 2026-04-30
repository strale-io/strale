/**
 * Execution Guidance Layer — tells agents how to use a capability.
 *
 * Computes strategy (direct / retry_with_backoff / queue_for_later / unavailable),
 * fallback recommendations, error handling, recovery timelines, and cost envelopes.
 *
 * Key principle: usable = matrixSqs >= 25 AND strategy !== 'unavailable' AND qpGrade >= 'C'
 * (DEC-20260315-I: failed calls are NOT billed)
 */

import { sql, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, capabilityHealth } from "../db/schema.js";
import { CAPABILITY_FALLBACKS } from "../data/capability-fallbacks.js";
import { getErrorCodes } from "../data/error-codes.js";
import type { CapabilityType } from "./reliability-profile.js";

// ─── Types ──────────────────────────────────────────────────────────────────

type Grade = "A" | "B" | "C" | "D" | "F";

export interface ExecutionGuidance {
  usable: boolean;
  strategy: "direct" | "retry_with_backoff" | "queue_for_later" | "unavailable";
  confidence_after_strategy: number; // 0-100
  config: {
    max_attempts?: number;
    base_delay_ms?: number;
    suggested_retry_after_minutes?: number;
  };
  error_handling: {
    distinguishable_errors: boolean;
    retryable: string[];
    permanent: string[];
  };
  if_strategy_fails: {
    fallback_capability: string | null;
    // Capability display name (looked up alongside the slug). Frontend
    // needs both because card renders the name and links by slug.
    // Without this here the frontend would have to make a second
    // /v1/capabilities/:slug round-trip just to render the card.
    fallback_capability_name: string | null;
    fallback_coverage: string | null;
    fallback_sqs: number | null;
    fallback_price_cents: number | null;
    fallback_verification_level: "full" | "partial" | "none" | null;
    trigger: "after_max_attempts_exhausted";
  } | null;
  recovery: {
    estimated_hours: number | null;
    next_test: string; // ISO timestamp
    trend_context: string | null;
  };
  cost_envelope: {
    primary_price_cents: number;
    worst_case_with_retries_cents: number;
    fallback_price_cents: number | null;
  };
  circuit_breaker: boolean;
  context: string;
}

// ─── Strategy determination ─────────────────────────────────────────────────

function determineStrategy(
  matrixSqs: number,
  qpGrade: Grade,
  rpGrade: Grade,
  rpTrend: "stable" | "improving" | "declining",
  hasExternalFailures: boolean,
  capabilityType: CapabilityType,
): "direct" | "retry_with_backoff" | "queue_for_later" | "unavailable" {
  // Deterministic capabilities with good QP should always be direct
  if (capabilityType === "deterministic" && qpGrade <= "B") {
    return "direct";
  }

  if (matrixSqs < 25) return "unavailable";
  if (qpGrade === "D" || qpGrade === "F") return "unavailable";

  if (rpGrade === "A" || rpGrade === "B") return "direct";

  if (rpGrade === "C" && hasExternalFailures) return "retry_with_backoff";
  if (rpGrade === "C") return "retry_with_backoff"; // Even without identified external failures, C-grade RP warrants retries

  if (rpGrade === "D" && rpTrend === "improving") return "queue_for_later";

  return "unavailable";
}

// ─── Confidence computation ─────────────────────────────────────────────────

async function computeConfidence(
  strategy: "direct" | "retry_with_backoff" | "queue_for_later" | "unavailable",
  slug: string,
  rpAvailabilityRate: number,
  rpGrade: Grade,
  capabilityType: CapabilityType,
): Promise<number> {
  if (strategy === "unavailable") return 0;

  if (strategy === "direct") {
    if (rpGrade === "A") return 100;
    if (capabilityType === "deterministic") return 100;
    return Math.min(99, Math.round(rpAvailabilityRate));
  }

  if (strategy === "retry_with_backoff") {
    // Query historical retry success data
    const retryConfidence = await estimateRetryConfidence(slug, rpAvailabilityRate);
    return Math.min(99, retryConfidence);
  }

  // queue_for_later: use rolling success rate as expected rate when recovered
  return Math.min(99, Math.round(rpAvailabilityRate));
}

async function estimateRetryConfidence(slug: string, rollingSuccess: number): Promise<number> {
  const db = getDb();

  try {
    // Look at test results in last 30 days: find cases where a test failed
    // then the same test_suite passed within the next 24h
    const retryData = await db.execute(sql`
      WITH failures AS (
        SELECT tr.test_suite_id, tr.executed_at
        FROM test_results tr
        WHERE tr.capability_slug = ${slug}
          AND tr.passed = false
          AND tr.executed_at >= NOW() - INTERVAL '30 days'
      ),
      retry_successes AS (
        SELECT DISTINCT f.test_suite_id
        FROM failures f
        INNER JOIN test_results tr2 ON tr2.test_suite_id = f.test_suite_id
          AND tr2.passed = true
          AND tr2.executed_at > f.executed_at
          AND tr2.executed_at < f.executed_at + INTERVAL '24 hours'
      )
      SELECT
        (SELECT COUNT(DISTINCT test_suite_id) FROM failures) AS total_failed,
        (SELECT COUNT(*) FROM retry_successes) AS recovered
    `);

    const rows = (Array.isArray(retryData) ? retryData : (retryData as any)?.rows ?? []) as any[];
    const totalFailed = Number(rows[0]?.total_failed ?? 0);
    const recovered = Number(rows[0]?.recovered ?? 0);

    if (totalFailed >= 3) {
      const retrySuccessRate = (recovered / totalFailed) * 100;
      return Math.round(rollingSuccess + ((100 - rollingSuccess) * retrySuccessRate / 100));
    }
  } catch {
    // Fall through to estimate
  }

  // Insufficient data — estimate
  return Math.round(rollingSuccess + ((100 - rollingSuccess) * 0.6));
}

// ─── Recovery estimation ────────────────────────────────────────────────────

async function estimateRecovery(
  slug: string,
  capabilityType: CapabilityType,
  testScheduleHours: number,
  lastTestedAt: string | null,
  dataSource: string | null,
): Promise<ExecutionGuidance["recovery"]> {
  // Next test time
  const lastTest = lastTestedAt ? new Date(lastTestedAt) : new Date();
  const nextTest = new Date(lastTest.getTime() + testScheduleHours * 60 * 60 * 1000);
  const nextTestIso = nextTest.toISOString();

  // Deterministic capabilities don't have outages
  if (capabilityType === "deterministic") {
    return { estimated_hours: null, next_test: nextTestIso, trend_context: null };
  }

  const db = getDb();

  try {
    // Find outage periods (runs with pass_rate < 50%) and recovery durations
    const outageData = await db.execute(sql`
      WITH daily_stats AS (
        SELECT
          DATE_TRUNC('day', executed_at) AS day,
          COUNT(*) FILTER (WHERE passed = true)::float / NULLIF(COUNT(*), 0) AS pass_rate
        FROM test_results
        WHERE capability_slug = ${slug}
          AND executed_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', executed_at)
        ORDER BY day
      ),
      outage_days AS (
        SELECT day, pass_rate,
          CASE WHEN pass_rate < 0.5 THEN 1 ELSE 0 END AS is_outage
        FROM daily_stats
      )
      SELECT
        COUNT(*) FILTER (WHERE is_outage = 1) AS outage_days,
        COUNT(*) AS total_days
      FROM outage_days
    `);

    const rows = (Array.isArray(outageData) ? outageData : (outageData as any)?.rows ?? []) as any[];
    const outageDays = Number(rows[0]?.outage_days ?? 0);
    const totalDays = Number(rows[0]?.total_days ?? 0);

    if (outageDays > 0 && totalDays > 0) {
      // Estimate recovery time (hours per outage event)
      const outageRate = outageDays / totalDays;
      const estimatedHours = Math.round(outageRate * 24 * 10) / 10;
      const outagesPerMonth = Math.round(outageDays * 30 / totalDays);

      const sourceName = dataSource ?? slug;
      const trendContext = `${sourceName} outages occur ~${outagesPerMonth}x/month, median duration ${estimatedHours}h`;

      return {
        estimated_hours: estimatedHours,
        next_test: nextTestIso,
        trend_context: trendContext,
      };
    }
  } catch {
    // Fall through
  }

  return { estimated_hours: null, next_test: nextTestIso, trend_context: null };
}

// ─── Fallback lookup ────────────────────────────────────────────────────────

async function lookupFallback(
  slug: string,
): Promise<ExecutionGuidance["if_strategy_fails"]> {
  const fallback = CAPABILITY_FALLBACKS.find((f) => f.primarySlug === slug);
  if (!fallback) return null;

  const db = getDb();
  const [fbCap] = await db
    .select({
      name: capabilities.name,
      matrixSqs: capabilities.matrixSqs,
      priceCents: capabilities.priceCents,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, fallback.fallbackSlug))
    .limit(1);

  return {
    fallback_capability: fallback.fallbackSlug,
    fallback_capability_name: fbCap?.name ?? null,
    fallback_coverage: fallback.coverage,
    fallback_sqs: fbCap?.matrixSqs ? Number(fbCap.matrixSqs) : null,
    fallback_price_cents: fbCap?.priceCents ?? null,
    fallback_verification_level: fallback.verificationLevel,
    trigger: "after_max_attempts_exhausted",
  };
}

// ─── Error handling lookup ──────────────────────────────────────────────────

function lookupErrorHandling(slug: string): ExecutionGuidance["error_handling"] {
  const entry = getErrorCodes(slug);
  return {
    distinguishable_errors: entry.distinguishableErrors,
    retryable: entry.retryable,
    permanent: entry.permanent,
  };
}

// ─── Context generation ─────────────────────────────────────────────────────

function generateContext(
  strategy: ExecutionGuidance["strategy"],
  capabilityType: CapabilityType,
  dataSource: string | null,
  recoveryHours: number | null,
): string {
  if (capabilityType === "deterministic" && strategy === "direct") {
    return "No external dependencies. Deterministic execution.";
  }

  const source = dataSource ?? "External service";

  switch (strategy) {
    case "direct":
      return "Operating normally.";
    case "retry_with_backoff":
      return `${source} experiencing intermittent issues. Retry typically succeeds within 3 attempts.`;
    case "queue_for_later":
      return `${source} currently unavailable. Expected recovery in ~${recoveryHours ?? "?"}h.`;
    case "unavailable":
      return `${source} is down. No viable execution path available.`;
  }
}

// ─── Main computation ───────────────────────────────────────────────────────

export interface ComputeGuidanceInput {
  slug: string;
  qpGrade: Grade;
  rpGrade: Grade;
  rpScore: number;
  rpTrend: "stable" | "improving" | "declining";
  rpAvailabilityRate: number;
  matrixSqs: number;
  capabilityType: CapabilityType;
  testScheduleHours: number;
  lastTestedAt: string | null;
  priceCents: number;
  dataSource: string | null;
  hasExternalFailures: boolean;
}

export async function computeExecutionGuidance(
  input: ComputeGuidanceInput,
): Promise<ExecutionGuidance> {
  const {
    slug, qpGrade, rpGrade, rpScore, rpTrend, rpAvailabilityRate,
    matrixSqs, capabilityType, testScheduleHours, lastTestedAt,
    priceCents, dataSource, hasExternalFailures,
  } = input;

  // Strategy
  const strategy = determineStrategy(
    matrixSqs, qpGrade, rpGrade, rpTrend, hasExternalFailures, capabilityType,
  );

  // Usable: SQS >= 25, strategy not unavailable, QP not D or F
  const usable = matrixSqs >= 25 && strategy !== "unavailable" && qpGrade !== "D" && qpGrade !== "F";

  // Confidence
  const confidence = await computeConfidence(
    strategy, slug, rpAvailabilityRate, rpGrade, capabilityType,
  );

  // Config
  const config: ExecutionGuidance["config"] = {};
  if (strategy === "retry_with_backoff") {
    config.max_attempts = 3;
    config.base_delay_ms = capabilityType === "deterministic" ? 1000 : 3000;
  }
  if (strategy === "queue_for_later") {
    const recovery = await estimateRecovery(slug, capabilityType, testScheduleHours, lastTestedAt, dataSource);
    config.suggested_retry_after_minutes = recovery.estimated_hours
      ? Math.round(recovery.estimated_hours * 60)
      : testScheduleHours * 60;
  }

  // Error handling
  const errorHandling = lookupErrorHandling(slug);

  // Fallback
  const fallback = await lookupFallback(slug);

  // Recovery
  const recovery = await estimateRecovery(slug, capabilityType, testScheduleHours, lastTestedAt, dataSource);

  // Cost envelope (DEC-20260315-I: failed calls not billed)
  const costEnvelope: ExecutionGuidance["cost_envelope"] = {
    primary_price_cents: priceCents,
    worst_case_with_retries_cents: priceCents, // Same — only success billed
    fallback_price_cents: fallback?.fallback_price_cents ?? null,
  };

  // Circuit breaker
  const db = getDb();
  const [health] = await db
    .select({ state: capabilityHealth.state })
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);
  const circuitBreaker = health?.state === "open";

  // Context
  const context = generateContext(strategy, capabilityType, dataSource, recovery.estimated_hours);

  return {
    usable,
    strategy,
    confidence_after_strategy: confidence,
    config,
    error_handling: errorHandling,
    if_strategy_fails: fallback,
    recovery,
    cost_envelope: costEnvelope,
    circuit_breaker: circuitBreaker,
    context,
  };
}
