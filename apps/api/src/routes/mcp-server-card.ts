import { readPackageVersion } from "strale-mcp/tools";
/**
 * MCP Server Card — /.well-known/mcp.json
 *
 * Machine-readable discovery endpoint for MCP crawlers (SEP-1649).
 * Dynamic capability count from DB, 5-min cache.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { computePlatformFacts } from "../lib/platform-facts.js";

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
    .where(
      and(
        eq(capabilities.isActive, true),
        // strale.dev surfacing per DEC-20260503-A.
        eq(capabilities.marketplaceEligible, true),
        // Counted withdrawn capabilities, so the advertised number was up to
        // ten too high. No capability is named here — only the count — but a
        // public claim about how many services exist has to match the number a
        // reader can actually see.
        eq(capabilities.visible, true),
      ),
    );
  const count = rows.length;
  const facts = await computePlatformFacts();
  const countryCount = facts.countries.company_data_active_iso.length;

  const card = {
    name: "strale",
    version: readPackageVersion(),
    description: `Give your agent a new tool without opening another provider account. ${count} tools accessible via MCP and REST API; company data across ${countryCount} countries.`,
    transport: [
      {
        type: "streamable-http",
        url: "https://api.strale.io/mcp?src=mcp-card",
      },
    ],
    authentication: {
      type: "bearer",
      description:
        "Strale API key (sk_live_...). The strale_search tool works without authentication. Paid execution and wallet tools require an API key from https://strale.dev?src=mcp-card&utm_source=mcp-card&utm_medium=listing&utm_campaign=distribution-d0-d1",
    },
    tools: "dynamic",
    products: [
      {
        name: "Web3 Assurance",
        description:
          "Decision-ready on-chain counterparty answer (wallet / contract / token / protocol / bridge). Returns counterparty signals for review. Requires an API key.",
        endpoint: "https://api.strale.io/v1/web3-assurance",
        mcp_tool: "strale_web3_assurance",
      },
    ],
    resources: [],
    prompts: [],
    links: {
      homepage: "https://strale.dev?src=mcp-card&utm_source=mcp-card&utm_medium=listing&utm_campaign=distribution-d0-d1",
      documentation: "https://strale.dev/docs?src=mcp-card&utm_source=mcp-card&utm_medium=listing&utm_campaign=distribution-d0-d1",
      pricing: "https://strale.dev/pricing?src=mcp-card&utm_source=mcp-card&utm_medium=listing&utm_campaign=distribution-d0-d1",
      agent_card: "https://api.strale.io/.well-known/agent-card.json?src=mcp-card",
      a2a_endpoint: "https://api.strale.io/a2a?src=mcp-card",
      source: "https://github.com/petterlindstrom79/strale",
    },
    contact: {
      email: "hello@strale.io",
    },
    metadata: {
      capabilities_count: count,
      countries_covered: countryCount,
      free_tier_available: facts.capability_counts.free_tier_slugs.length > 0,
      trust_model:
        "Browse each tool’s inputs, output fields, price, limitations and source in the catalogue.",
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
