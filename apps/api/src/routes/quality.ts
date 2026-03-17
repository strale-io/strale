/**
 * PUBLIC ENDPOINT — intentional, no auth required.
 *
 * GET /v1/quality/:slug — Public dual-profile SQS for a capability.
 * Phase 3: Returns QP + RP + matrix SQS + execution guidance.
 * Eliminated metrics: trust_grade, reliability_warning, schema_conformance_rate,
 * avg_field_completeness_pct, standalone success_rate/pass_rate, performance.
 */

import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { computeDualProfileSQS, estimateQualificationTime } from "../lib/sqs.js";
import { computeFreshnessGrade } from "../lib/trust-grade.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// Public — no auth required (lets agents check quality before paid calls)
export const qualityRoute = new Hono<AppEnv>();

function gradeLabel(grade: string): string {
  switch (grade) {
    case "A": return "Excellent";
    case "B": return "Good";
    case "C": return "Fair";
    case "D": return "Poor";
    case "F": return "Failing";
    default: return "Pending";
  }
}

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

  const dual = await computeDualProfileSQS(slug);

  // Only compute qualification estimate when pending
  const qualificationEstimate = dual.qp.pending && dual.rp.pending
    ? await estimateQualificationTime(slug)
    : null;

  // Classification breakdown from recent test results (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const classificationRows = await db.execute(sql`
    SELECT
      COALESCE(failure_classification, 'unclassified') AS verdict,
      COUNT(*) AS count
    FROM test_results
    WHERE capability_slug = ${slug}
      AND passed = false
      AND executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    GROUP BY failure_classification
    ORDER BY count DESC
  `);
  const classBreakdown = ((Array.isArray(classificationRows)
    ? classificationRows
    : (classificationRows as any)?.rows ?? []) as any[])
    .reduce((acc: Record<string, number>, r: any) => {
      acc[r.verdict] = Number(r.count);
      return acc;
    }, {});

  // Compute freshness
  const freshness = computeFreshnessGrade({
    freshnessCategory: cap.freshnessCategory,
    dataUpdateCycleDays: cap.dataUpdateCycleDays,
    datasetLastUpdated: cap.datasetLastUpdated,
  });

  c.header("Cache-Control", "public, max-age=300");

  return c.json({
    capability: slug,
    sqs: {
      score: dual.score,
      label: dual.label,
      trend: dual.rp.trend,
    },
    quality_profile: {
      grade: dual.qp.grade,
      score: dual.qp.score,
      label: dual.qp.label,
      factors: Object.entries(dual.qp.factors).map(([name, f]) => ({
        name,
        rate: f.rate,
        weight: f.weight,
        has_data: f.has_data,
      })),
    },
    reliability_profile: {
      grade: dual.rp.grade,
      score: dual.rp.score,
      label: gradeLabel(dual.rp.grade),
      capability_type: dual.rp.capability_type,
      factors: Object.entries(dual.rp.factors).map(([name, f]) => ({
        name,
        rate: f.rate,
        weight: f.weight,
        has_data: f.has_data,
      })),
    },
    runs_analyzed: dual.qp.runs_analyzed,
    pending: dual.qp.pending && dual.rp.pending,
    ...(qualificationEstimate ? { qualification_estimate: qualificationEstimate } : {}),
    ...(freshness ? {
      freshness: {
        category: freshness.category,
        label: freshness.label,
        data_update_cycle_days: freshness.data_update_cycle_days ?? null,
        dataset_last_updated: freshness.dataset_last_updated ?? null,
      },
    } : {}),
    ...(Object.keys(classBreakdown).length > 0 ? {
      failure_classification: classBreakdown,
    } : {}),
  });
});
