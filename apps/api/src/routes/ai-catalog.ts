/**
 * AI Catalog — /.well-known/ai-catalog.json
 *
 * Unified discovery endpoint listing all Strale protocol interfaces.
 * Cert-audit Y-1+Y-2: capability count and country count are computed
 * from PLATFORM_FACTS rather than hardcoded "250+ / 27 countries".
 */

import { Hono } from "hono";
import { computePlatformFacts } from "../lib/platform-facts.js";
import { logError } from "../lib/log.js";

const aiCatalogRoute = new Hono();

let _cached: { body: unknown; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildCatalog() {
  const facts = await computePlatformFacts();
  const capCount = facts.capability_counts.active_visible;
  const countryCount = facts.countries.company_data_active.length;
  return {
    version: "0.1",
    publisher: {
      name: "Strale",
      url: "https://strale.dev",
      description: "One API call. Verified data your agent can trust.",
      contact: "hello@strale.io",
    },
    services: [
      {
        id: "strale-mcp",
        type: "mcp",
        name: "Strale MCP Server",
        description: `${capCount}+ independently tested and scored business data capabilities accessible via MCP. EU/Nordic focus, ${countryCount} countries.`,
        server_card: "https://api.strale.io/.well-known/mcp.json",
        endpoint: "https://api.strale.io/mcp",
        transport: "streamable-http",
        authentication: "bearer",
      },
      {
        id: "strale-a2a",
        type: "a2a",
        name: "Strale A2A Agent",
        description:
          "Agent-to-agent interface for Strale capabilities. Supports task delegation via JSON-RPC.",
        agent_card: "https://api.strale.io/.well-known/agent-card.json",
        endpoint: "https://api.strale.io/a2a",
        authentication: "bearer",
      },
      {
        id: "strale-rest",
        type: "rest",
        name: "Strale REST API",
        description:
          "Direct REST API access to all Strale capabilities via POST /v1/do.",
        endpoint: "https://api.strale.io/v1",
        documentation: "https://strale.dev/docs",
        authentication: "bearer",
      },
      {
        id: "strale-x402",
        type: "x402",
        name: "Strale x402 Pay-Per-Request",
        description:
          "Pay-per-request access to select Strale capabilities via HTTP 402 Payment Required. No API key needed — pay with USDC on Base.",
        endpoint: "https://api.strale.io/x402",
        authentication: "x402-payment",
      },
    ],
  };
}

aiCatalogRoute.get("/", async (c) => {
  const now = Date.now();
  let body = _cached && now - _cached.at < CACHE_TTL_MS ? _cached.body : null;
  if (!body) {
    try {
      body = await buildCatalog();
      _cached = { body, at: now };
    } catch (err) {
      logError("ai-catalog-build-failed", err);
      // Prefer stale cache to a 503 — discovery surface staying up matters more.
      if (_cached) body = _cached.body;
      else return c.json({ error: "catalog_unavailable" }, 503);
    }
  }
  c.header("Cache-Control", "public, max-age=300");
  return c.json(body);
});

export { aiCatalogRoute };
