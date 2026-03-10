import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { computeCapabilitySQS, estimateQualificationTime } from "../lib/sqs.js";
import { getCapabilityQuality } from "../lib/quality-aggregation.js";
import {
  computeFreshnessGrade,
  buildPerformanceInfo,
  computeTrustGrade,
} from "../lib/trust-grade.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// Public — no auth required (lets agents check quality before paid calls)
export const qualityRoute = new Hono<AppEnv>();

// GET /v1/quality/:slug — Public SQS score for a capability
qualityRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  // Verify capability exists and is active
  const [cap] = await db
    .select({
      slug: capabilities.slug,
      freshnessCategory: capabilities.freshnessCategory,
      dataUpdateCycleDays: capabilities.dataUpdateCycleDays,
      datasetLastUpdated: capabilities.datasetLastUpdated,
    })
    .from(capabilities)
    .where(and(eq(capabilities.slug, slug), eq(capabilities.isActive, true)))
    .limit(1);

  if (!cap) {
    return c.json(
      apiError("not_found", `Capability '${slug}' not found.`),
      404,
    );
  }

  const [sqs, qualityMetrics] = await Promise.all([
    computeCapabilitySQS(slug),
    getCapabilityQuality(slug),
  ]);

  // Only compute qualification estimate when pending
  const qualificationEstimate = sqs.pending
    ? await estimateQualificationTime(slug)
    : null;

  // Compute freshness, performance, and trust grade
  const freshness = computeFreshnessGrade({
    freshnessCategory: cap.freshnessCategory,
    dataUpdateCycleDays: cap.dataUpdateCycleDays,
    datasetLastUpdated: cap.datasetLastUpdated,
  });

  const performance = buildPerformanceInfo(
    qualityMetrics.p95ResponseTimeMs,
    qualityMetrics.avgResponseTimeMs,
  );

  const trustGrade = computeTrustGrade({
    sqsScore: sqs.pending ? null : sqs.score,
    sqsPending: sqs.pending,
    freshnessGrade: freshness?.grade ?? null,
    latencyGrade: performance.latency_grade,
  });

  c.header("Cache-Control", "public, max-age=300");

  return c.json({
    capability: slug,
    sqs: sqs.score,
    label: sqs.label,
    trend: sqs.trend,
    circuit_breaker: sqs.circuit_breaker,
    factors: {
      correctness: { rate: sqs.factors.correctness.rate, weight: sqs.factors.correctness.weight },
      schema: { rate: sqs.factors.schema.rate, weight: sqs.factors.schema.weight },
      availability: { rate: sqs.factors.availability.rate, weight: sqs.factors.availability.weight },
      error_handling: { rate: sqs.factors.error_handling.rate, weight: sqs.factors.error_handling.weight },
      edge_cases: { rate: sqs.factors.edge_cases.rate, weight: sqs.factors.edge_cases.weight },
    },
    external_service_issues: sqs.external_service_issues,
    runs_analyzed: sqs.runs_analyzed,
    pending: sqs.pending,
    ...(sqs.pending && qualificationEstimate ? { qualification_estimate: qualificationEstimate } : {}),
    ...(freshness ? { freshness } : {}),
    performance,
    ...(trustGrade ? { trust_grade: trustGrade } : {}),
  });
});
