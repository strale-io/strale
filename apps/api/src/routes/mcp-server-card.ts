/**
 * MCP Server Card — /.well-known/mcp.json
 *
 * Machine-readable discovery endpoint for MCP crawlers (SEP-1649).
 * Dynamic capability count from DB, 5-min cache.
 */

import { Hono } from "hono";
import { computePlatformFacts } from "../lib/platform-facts.js";

const mcpServerCardRoute = new Hono();

// ─── Cache ──────────────────────────────────────────────────────────────────

let cached: { json: object; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Build card ─────────────────────────────────────────────────────────────

async function buildCard(): Promise<object> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.json;

  const facts = await computePlatformFacts();
  const count = facts.capability_counts.active_visible;
  const countryCount = facts.countries.company_data_active_iso.length;

  const card = {
    name: "strale",
    version: "0.1.0",
    description: `Give your agent a new tool without opening another provider account. ${count} tools accessible via MCP and REST API; company data across ${countryCount} countries.`,
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
    products: [
      {
        name: "Payee Assurance",
        description:
          "Decision-ready off-chain counterparty answer (KYB / sanctions / UBO / IBAN-name match) in a single auditable call.",
        endpoint: "https://api.strale.io/v1/do",
        mcp_tool: "strale_execute",
      },
      {
        name: "Web3 Assurance",
        description:
          "Decision-ready on-chain counterparty answer (wallet / contract / token / protocol / bridge). Verdict + reason_codes + sidecar audit_url. Outbound + reverse-call modes; sub-second SLA in reverse-call.",
        endpoint: "https://api.strale.io/v1/web3-assurance",
        mcp_tool: "strale_web3_assurance",
      },
    ],
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
