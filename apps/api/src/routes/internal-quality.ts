/**
 * PUBLIC ENDPOINTS — intentional, no auth required.
 *
 * Quality metrics are public by design to support Strale's
 * transparency positioning. If this changes, add authMiddleware.
 */

import { Hono } from "hono";
import {
  getCapabilityQuality,
  getSolutionQuality,
} from "../lib/quality-aggregation.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const internalQualityRoute = new Hono<AppEnv>();

// GET /v1/internal/quality/capabilities/:slug
internalQualityRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const metrics = await getCapabilityQuality(slug);

  return c.json({
    success_rate: metrics.successRate,
    avg_response_time_ms: metrics.avgResponseTimeMs,
    p95_response_time_ms: metrics.p95ResponseTimeMs,
    schema_conformance_rate: metrics.schemaConformanceRate,
    avg_field_completeness_pct: metrics.avgFieldCompletenessPct,
    total_transactions_30d: metrics.totalTransactions30d,
    total_transactions_all: metrics.totalTransactionsAll,
    last_updated: metrics.lastUpdated,
  });
});

// GET /v1/internal/quality/solutions/:slug
internalQualityRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const metrics = await getSolutionQuality(slug);

  if (!metrics) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  return c.json({
    success_rate: metrics.successRate,
    avg_response_time_ms: metrics.avgResponseTimeMs,
    p95_response_time_ms: metrics.p95ResponseTimeMs,
    schema_conformance_rate: metrics.schemaConformanceRate,
    avg_field_completeness_pct: metrics.avgFieldCompletenessPct,
    total_transactions_30d: metrics.totalTransactions30d,
    total_transactions_all: metrics.totalTransactionsAll,
    steps: metrics.steps.map((s) => ({
      capability_slug: s.capabilitySlug,
      success_rate: s.successRate,
      avg_response_time_ms: s.avgResponseTimeMs,
      p95_response_time_ms: s.p95ResponseTimeMs,
      schema_conformance_rate: s.schemaConformanceRate,
      avg_field_completeness_pct: s.avgFieldCompletenessPct,
      total_transactions_30d: s.totalTransactions30d,
      total_transactions_all: s.totalTransactionsAll,
    })),
    last_updated: metrics.lastUpdated,
  });
});
