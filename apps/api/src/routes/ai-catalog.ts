/**
 * AI Catalog — /.well-known/ai-catalog.json
 *
 * Unified discovery endpoint listing all Strale protocol interfaces.
 * Static content, no DB queries needed.
 */

import { Hono } from "hono";

const aiCatalogRoute = new Hono();

const CATALOG = {
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
      description:
        "250+ independently tested and scored business data capabilities accessible via MCP. EU/Nordic focus, 27 countries.",
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

aiCatalogRoute.get("/", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(CATALOG);
});

export { aiCatalogRoute };
