/**
 * PUBLIC ENDPOINTS — intentional, no auth required.
 *
 * Quality metrics are public by design to support Strale's
 * transparency positioning. If this changes, add authMiddleware.
 *
 * Phase 3: Dual-profile model — returns QP + RP + SQS.
 * Eliminated metrics: schema_conformance_rate, avg_field_completeness_pct,
 * standalone success_rate/pass_rate.
 */

import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutions, solutionSteps, capabilities } from "../db/schema.js";
import { computeDualProfileSQS } from "../lib/sqs.js";
import { getCapabilityQuality } from "../lib/quality-aggregation.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const internalQualityRoute = new Hono<AppEnv>();

// GET /v1/internal/quality/capabilities/:slug
internalQualityRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");

  // API-5: Filter deactivated capabilities
  const db = getDb();
  const [capCheck] = await db
    .select({ isActive: capabilities.isActive })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);
  if (!capCheck || !capCheck.isActive) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  const [dual, metrics] = await Promise.all([
    computeDualProfileSQS(slug).catch(() => null),
    getCapabilityQuality(slug),
  ]);

  return c.json({
    sqs: dual ? dual.score : 0,
    sqs_label: dual ? dual.label : "Pending",
    quality_profile: dual ? {
      grade: dual.qp.grade,
      score: dual.qp.score,
      label: dual.qp.label,
    } : { grade: "pending", score: 0, label: "Pending" },
    reliability_profile: dual ? {
      grade: dual.rp.grade,
      score: dual.rp.score,
      capability_type: dual.rp.capability_type,
    } : { grade: "pending", score: 0, capability_type: "unknown" },
    trend: dual ? dual.rp.trend : "stable",
    avg_response_time_ms: metrics.avgResponseTimeMs,
    p95_response_time_ms: metrics.p95ResponseTimeMs,
    total_transactions_30d: metrics.totalTransactions30d,
    total_transactions_all: metrics.totalTransactionsAll,
    last_updated: metrics.lastUpdated,
  });
});

// GET /v1/internal/quality/solutions/:slug
internalQualityRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  // Verify solution exists
  const [sol] = await db
    .select({ id: solutions.id, slug: solutions.slug })
    .from(solutions)
    .where(and(eq(solutions.slug, slug), eq(solutions.isActive, true)))
    .limit(1);

  if (!sol) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  // Get steps
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
    })
    .from(solutionSteps)
    .where(eq(solutionSteps.solutionId, sol.id))
    .orderBy(asc(solutionSteps.stepOrder));

  // Compute dual-profile for each step
  const stepResults = await Promise.all(
    steps.map(async (s) => {
      const dual = await computeDualProfileSQS(s.capabilitySlug).catch(() => null);
      const metrics = await getCapabilityQuality(s.capabilitySlug);
      return {
        capability_slug: s.capabilitySlug,
        sqs: dual ? dual.score : 0,
        quality: dual ? dual.qp.grade : "pending",
        reliability: dual ? dual.rp.grade : "pending",
        trend: dual ? dual.rp.trend : "stable" as const,
        avg_response_time_ms: metrics.avgResponseTimeMs,
        total_transactions_30d: metrics.totalTransactions30d,
      };
    }),
  );

  // Solution-level: weakest link
  const sqsScores = stepResults.map((s) => s.sqs);
  const minSqs = Math.min(...sqsScores);
  const avgSqs = sqsScores.length > 0 ? Math.round(sqsScores.reduce((a, b) => a + b, 0) / sqsScores.length) : 0;
  const solutionSqs = Math.min(avgSqs, minSqs + 20);

  function sqsLabel(score: number): string {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 50) return "Fair";
    if (score >= 25) return "Poor";
    return "Degraded";
  }

  return c.json({
    sqs: solutionSqs,
    sqs_label: sqsLabel(solutionSqs),
    steps: stepResults,
  });
});
