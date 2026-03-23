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
import { sqsLabel, gradeFromScore, computeSolutionScore } from "../lib/trust-labels.js";
import { getCapabilityQuality } from "../lib/quality-aggregation.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const internalQualityRoute = new Hono<AppEnv>();

// GET /v1/internal/quality/capabilities/:slug
internalQualityRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");

  // API-5: Filter deactivated capabilities
  const db = getDb();
  const [capRow] = await db
    .select({
      isActive: capabilities.isActive,
      matrixSqs: capabilities.matrixSqs,
      qpScore: capabilities.qpScore,
      rpScore: capabilities.rpScore,
      trend: capabilities.trend,
      capabilityType: capabilities.capabilityType,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);
  if (!capRow || !capRow.isActive) {
    return c.json(apiError("not_found", `Capability '${slug}' not found.`), 404);
  }

  const metrics = await getCapabilityQuality(slug);

  const sqs = capRow.matrixSqs ? parseFloat(capRow.matrixSqs) : 0;
  const qpScore = capRow.qpScore ? parseFloat(capRow.qpScore) : 0;
  const rpScore = capRow.rpScore ? parseFloat(capRow.rpScore) : 0;

  return c.json({
    sqs,
    sqs_label: sqsLabel(sqs),
    quality_profile: {
      grade: gradeFromScore(capRow.qpScore),
      score: qpScore,
      label: `Code quality: ${gradeFromScore(capRow.qpScore)}`,
    },
    reliability_profile: {
      grade: gradeFromScore(capRow.rpScore),
      score: rpScore,
      capability_type: capRow.capabilityType ?? "stable_api",
    },
    trend: capRow.trend ?? "stable",
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

  // Get steps with trust columns from DB
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      matrixSqs: capabilities.matrixSqs,
      qpScore: capabilities.qpScore,
      rpScore: capabilities.rpScore,
      trend: capabilities.trend,
    })
    .from(solutionSteps)
    .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(eq(solutionSteps.solutionId, sol.id))
    .orderBy(asc(solutionSteps.stepOrder));

  // Read trust from DB columns, metrics still from quality aggregation
  const stepResults = await Promise.all(
    steps.map(async (s) => {
      const metrics = await getCapabilityQuality(s.capabilitySlug);
      return {
        capability_slug: s.capabilitySlug,
        sqs: s.matrixSqs ? parseFloat(s.matrixSqs) : 0,
        quality: gradeFromScore(s.qpScore),
        reliability: gradeFromScore(s.rpScore),
        trend: s.trend ?? "stable",
        avg_response_time_ms: metrics.avgResponseTimeMs,
        total_transactions_30d: metrics.totalTransactions30d,
      };
    }),
  );

  // Solution-level: weakest link
  const solutionSqs = computeSolutionScore(stepResults.map((s) => s.sqs));

  return c.json({
    sqs: solutionSqs,
    sqs_label: sqsLabel(solutionSqs),
    steps: stepResults,
  });
});
