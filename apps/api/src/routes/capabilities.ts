import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
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
      avg_latency_ms: capabilities.avgLatencyMs,
      success_rate: capabilities.successRate,
      transparency_tag: capabilities.transparencyTag,
      data_source: capabilities.dataSource,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  return c.json({ capabilities: rows });
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
      avg_latency_ms: capabilities.avgLatencyMs,
      success_rate: capabilities.successRate,
      transparency_tag: capabilities.transparencyTag,
      data_source: capabilities.dataSource,
    })
    .from(capabilities)
    .where(
      and(eq(capabilities.slug, slug), eq(capabilities.isActive, true)),
    )
    .limit(1);

  if (!cap) {
    return c.json(
      apiError("not_found", `Capability '${slug}' not found.`),
      404,
    );
  }

  // Reverse lookup: which solutions use this capability?
  const usedInSolutions = await db
    .selectDistinct({
      slug: solutions.slug,
      name: solutions.name,
      price_cents: solutions.priceCents,
    })
    .from(solutions)
    .innerJoin(solutionSteps, eq(solutionSteps.solutionId, solutions.id))
    .where(
      and(
        eq(solutionSteps.capabilitySlug, slug),
        eq(solutions.isActive, true),
      ),
    );

  return c.json({ ...cap, used_in_solutions: usedInSolutions });
});
