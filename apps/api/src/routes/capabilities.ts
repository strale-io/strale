import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { apiError } from "../lib/errors.js";

// Capabilities are public — no auth required (lets developers browse before signing up)
export const capabilitiesRoute = new Hono();

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
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  return c.json({ capabilities: rows });
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

  return c.json(cap);
});
