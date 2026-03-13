#!/usr/bin/env node

/**
 * Strale MCP Server — stdio transport
 *
 * Architecture: Thin Proxy
 * Calls the Strale HTTP API (POST /v1/do) for each tool invocation.
 * Tool registration logic is shared with the HTTP transport via tools.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchCapabilities, fetchSolutions, fetchTrustBatch, fetchSolutionTrust, registerStraleTools, type TrustBatchEntry, type SolutionTrustEntry } from "./tools.js";

const STRALE_BASE_URL =
  process.env.STRALE_BASE_URL ??
  "https://api.strale.io";
const STRALE_API_KEY = process.env.STRALE_API_KEY ?? "";
const DEFAULT_MAX_PRICE_CENTS = parseInt(
  process.env.STRALE_MAX_PRICE_CENTS ?? "200",
  10,
);

async function main() {
  const server = new McpServer(
    {
      name: "strale",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Fetch capabilities, solutions, and trust data
  let capabilities: Awaited<ReturnType<typeof fetchCapabilities>> = [];
  let solutions: Awaited<ReturnType<typeof fetchSolutions>> = [];
  let trustData: Map<string, TrustBatchEntry> = new Map();
  let solutionTrustData: Map<string, SolutionTrustEntry> = new Map();
  try {
    [capabilities, solutions] = await Promise.all([
      fetchCapabilities(STRALE_BASE_URL),
      fetchSolutions(STRALE_BASE_URL),
    ]);
    // Fetch trust data after we know the slugs
    [trustData, solutionTrustData] = await Promise.all([
      fetchTrustBatch(STRALE_BASE_URL, capabilities.map((c) => c.slug)),
      fetchSolutionTrust(STRALE_BASE_URL, solutions.map((s) => s.slug)),
    ]);
    console.error(
      `[strale-mcp] Loaded ${capabilities.length} capabilities, ${solutions.length} solutions, ${trustData.size} cap trust, ${solutionTrustData.size} sol trust from ${STRALE_BASE_URL}`,
    );
  } catch (err) {
    console.error(
      `[strale-mcp] Warning: Failed to load catalog: ${err instanceof Error ? err.message : err}`,
    );
    console.error(
      "[strale-mcp] Server will start with meta-tools only. Capability tools unavailable.",
    );
  }

  // Register all tools (shared logic)
  registerStraleTools(server, capabilities, solutions, {
    baseUrl: STRALE_BASE_URL,
    apiKey: STRALE_API_KEY,
    maxPriceCents: DEFAULT_MAX_PRICE_CENTS,
  }, trustData, solutionTrustData);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[strale-mcp] Server running on stdio (6 meta-tools, ${capabilities.length} capabilities, ${solutions.length} solutions)`,
  );
}

main().catch((err) => {
  console.error("[strale-mcp] Fatal error:", err);
  process.exit(1);
});
