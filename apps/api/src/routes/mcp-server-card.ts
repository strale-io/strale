/**
 * MCP Server Card — /.well-known/mcp.json
 *
 * Machine-readable discovery endpoint for MCP crawlers (SEP-1649).
 * Dynamic capability count from DB, 5-min cache.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";

const mcpServerCardRoute = new Hono();

// ─── Cache ──────────────────────────────────────────────────────────────────

let cached: { json: object; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Build card ─────────────────────────────────────────────────────────────

async function buildCard(): Promise<object> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.json;

  const db = getDb();
  const rows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));
  const count = rows.length;

  const card = {
    name: "strale",
    version: "0.1.0",
    description: `One API call. Verified data your agent can trust. ${count} independently tested and scored capabilities across 27 countries, accessible via MCP and REST API.`,
    transport: [
      {
        type: "streamable-http",
        url: "https://api.strale.io/mcp",
      },
    ],
    authentication: {
      type: "bearer",
      description:
        "Strale API key (sk_live_...). The strale_search tool works without authentication. All other tools require an API key from https://strale.dev",
    },
    tools: "dynamic",
    resources: [],
    prompts: [],
    links: {
      homepage: "https://strale.dev",
      documentation: "https://strale.dev/docs",
      pricing: "https://strale.dev/pricing",
      agent_card: "https://api.strale.io/.well-known/agent-card.json",
      a2a_endpoint: "https://api.strale.io/a2a",
      source: "https://github.com/petterlindstrom79/strale",
    },
    contact: {
      email: "hello@strale.io",
    },
    metadata: {
      capabilities_count: count,
      countries_covered: 27,
      free_tier_available: true,
      trust_scoring:
        "Strale Quality Score (SQS) — dual-profile model with Quality Profile and Reliability Profile",
      compliance: ["EU AI Act", "GDPR"],
      protocols: ["MCP", "A2A", "REST", "x402"],
    },
  };

  cached = { json: card, at: now };
  return card;
}

// ─── Route ──────────────────────────────────────────────────────────────────

mcpServerCardRoute.get("/", async (c) => {
  const card = await buildCard();
  c.header("Cache-Control", "public, max-age=300");
  return c.json(card);
});

export { mcpServerCardRoute };
