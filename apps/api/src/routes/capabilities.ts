import { Hono } from "hono";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import { authMiddleware } from "../lib/middleware.js";
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
      freshness_level: capabilities.freshnessLevel,
      last_tested_at: capabilities.lastTestedAt,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        eq(capabilities.visible, true),
        // strale.dev surfacing per DEC-20260503-A — internal callers
        // (do.ts, products, routing, lifecycle) bypass this filter.
        eq(capabilities.marketplaceEligible, true),
        inArray(capabilities.lifecycleState, ["active", "degraded"]),
      ),
    );

  const capabilitiesList = rows.map((r) => ({
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
    freshness_level: r.freshness_level ?? "fresh",
    last_tested_at: r.last_tested_at?.toISOString() ?? null,
  }));

  return c.json({ capabilities: capabilitiesList });
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

  // Phase A0c.1 (DEC-20260512-A): expose cost_class so the frontend can
  // distinguish paid_prepaid / paid_subscription caps awaiting customer
  // traffic from caps that are genuinely unverified for other reasons.
  // last_customer_call_at uses the daily-digest filter convention
  // (lib/daily-digest/fetch-platform.ts:20-24, 56, 63, 70, 78, 92):
  // exclude transactions whose user_id is the system test user
  // ('system@strale.internal'); customer paths set a real user_id or
  // NULL (free-tier), test-runner writes user_id = getSystemUserId().
  // The MAX() runs against an indexed (capability_id, status) pair —
  // one row per capability fetch is O(1) for this single-cap handler.
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
      cost_class: capabilities.costClass,
      last_customer_call_at: sql<string | null>`(
        SELECT MAX(t.created_at)
          FROM transactions t
         WHERE t.capability_id = ${capabilities.id}
           AND t.status = 'completed'
           AND (t.user_id IS NULL OR t.user_id != (
             SELECT id FROM users WHERE email = 'system@strale.internal' LIMIT 1
           ))
      )`,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.slug, slug),
        eq(capabilities.isActive, true),
        // strale.dev surfacing per DEC-20260503-A.
        eq(capabilities.marketplaceEligible, true),
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
