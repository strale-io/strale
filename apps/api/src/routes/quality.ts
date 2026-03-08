import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { computeCapabilitySQS, estimateQualificationTime } from "../lib/sqs.js";
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
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(and(eq(capabilities.slug, slug), eq(capabilities.isActive, true)))
    .limit(1);

  if (!cap) {
    return c.json(
      apiError("not_found", `Capability '${slug}' not found.`),
      404,
    );
  }

  const sqs = await computeCapabilitySQS(slug);

  // Only compute qualification estimate when pending
  const qualificationEstimate = sqs.pending
    ? await estimateQualificationTime(slug)
    : null;

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
    upstream_issues: sqs.upstream_issues,
    runs_analyzed: sqs.runs_analyzed,
    pending: sqs.pending,
    ...(sqs.pending && qualificationEstimate ? { qualification_estimate: qualificationEstimate } : {}),
  });
});
