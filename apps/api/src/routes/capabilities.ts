import { Hono } from "hono";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import { authMiddleware } from "../lib/middleware.js";
import { sqsLabel, gradeFromScore } from "../lib/trust-labels.js";
import { getAllHealth } from "../lib/circuit-breaker.js";
import type { AppEnv } from "../types.js";

// Capabilities are public — no auth required (lets developers browse before signing up)
export const capabilitiesRoute = new Hono<AppEnv>();

// GET /v1/capabilities — List available capabilities
capabilitiesRoute.get("/", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      category: capabilities.category,
      price_cents: capabilities.priceCents,
      input_schema: capabilities.inputSchema,
      output_schema: capabilities.outputSchema,
      transparency_tag: capabilities.transparencyTag,
      geography: capabilities.geography,
      data_source: capabilities.dataSource,
      is_free_tier: capabilities.isFreeTier,
      search_tags: capabilities.searchTags,
      // Dual-profile cached columns
      matrix_sqs: capabilities.matrixSqs,
      matrix_sqs_raw: capabilities.matrixSqsRaw,
      qp_score: capabilities.qpScore,
      rp_score: capabilities.rpScore,
      trend: capabilities.trend,
      freshness_level: capabilities.freshnessLevel,
      last_tested_at: capabilities.lastTestedAt,
      guidance_usable: capabilities.guidanceUsable,
      guidance_strategy: capabilities.guidanceStrategy,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        eq(capabilities.visible, true),
        inArray(capabilities.lifecycleState, ["active", "degraded"]),
      ),
    );

  const capabilitiesWithDualProfile = rows.map((r) => {
    const sqs = r.matrix_sqs ? parseFloat(r.matrix_sqs) : 0;
    const qpScore = r.qp_score ? parseFloat(r.qp_score) : null;
    const rpScore = r.rp_score ? parseFloat(r.rp_score) : null;

    return {
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category,
      price_cents: r.price_cents,
      input_schema: r.input_schema,
      output_schema: r.output_schema,
      transparency_tag: r.transparency_tag,
      geography: r.geography ?? "global",
      data_source: r.data_source,
      is_free_tier: r.is_free_tier,
      search_tags: r.search_tags ?? [],
      sqs: sqs,
      sqs_raw: r.matrix_sqs_raw ? parseFloat(r.matrix_sqs_raw) : sqs,
      sqs_label: sqsLabel(sqs),
      quality: gradeFromScore(qpScore),
      reliability: gradeFromScore(rpScore),
      trend: r.trend ?? "stable",
      freshness_level: r.freshness_level ?? "fresh",
      last_tested_at: r.last_tested_at?.toISOString() ?? null,
      usable: r.guidance_usable ?? true,
      strategy: r.guidance_strategy ?? "direct",
    };
  });

  return c.json({ capabilities: capabilitiesWithDualProfile });
});

// GET /v1/capabilities/health — Circuit breaker health status (auth required)
capabilitiesRoute.get("/health", authMiddleware, async (c) => {
  const healthData = await getAllHealth();

  const openCount = healthData.filter((h) => h.state === "open").length;
  const halfOpenCount = healthData.filter((h) => h.state === "half_open").length;

  return c.json({
    total_tracked: healthData.length,
    open: openCount,
    half_open: halfOpenCount,
    closed: healthData.length - openCount - halfOpenCount,
    capabilities: healthData,
  });
});

// GET /v1/capabilities/:slug — Get capability details
capabilitiesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const [cap] = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      category: capabilities.category,
      price_cents: capabilities.priceCents,
      input_schema: capabilities.inputSchema,
      output_schema: capabilities.outputSchema,
      transparency_tag: capabilities.transparencyTag,
      geography: capabilities.geography,
      data_source: capabilities.dataSource,
      is_free_tier: capabilities.isFreeTier,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.slug, slug),
        eq(capabilities.isActive, true),
        inArray(capabilities.lifecycleState, ["active", "degraded"]),
      ),
    )
    .limit(1);

  if (!cap) {
    return c.json(
      apiError("not_found", `Capability '${slug}' not found.`),
      404,
    );
  }

  // Reverse lookup: which solutions include this capability?
  const parentSolutions = await db
    .selectDistinct({
      slug: solutions.slug,
      name: solutions.name,
      description: solutions.description,
      priceCents: solutions.priceCents,
      category: solutions.category,
      geography: solutions.geography,
    })
    .from(solutions)
    .innerJoin(solutionSteps, eq(solutionSteps.solutionId, solutions.id))
    .where(
      and(
        eq(solutionSteps.capabilitySlug, slug),
        eq(solutions.isActive, true),
      ),
    );

  // Batch step counts for all parent solutions in one query
  const solSlugs = parentSolutions.map((s) => s.slug);
  const stepCounts = solSlugs.length > 0
    ? await db
        .select({
          slug: solutions.slug,
          count: sql<number>`count(*)`,
        })
        .from(solutionSteps)
        .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
        .where(inArray(solutions.slug, solSlugs))
        .groupBy(solutions.slug)
    : [];
  const stepCountMap = new Map(stepCounts.map((r) => [r.slug, Number(r.count)]));

  const partOfSolutions = parentSolutions.map((sol) => ({
    slug: sol.slug,
    name: sol.name,
    description: sol.description,
    price_cents: sol.priceCents,
    category: sol.category,
    geography: sol.geography,
    step_count: stepCountMap.get(sol.slug) ?? 0,
  }));

  return c.json({ ...cap, partOfSolutions });
});
