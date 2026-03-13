/**
 * MCP Streamable HTTP transport endpoint.
 *
 * Mounts at /mcp on the Hono app. Exposes the same 233+ tools as the
 * stdio MCP server, but over HTTP so remote clients can connect without
 * installing anything locally.
 *
 * Uses WebStandardStreamableHTTPServerTransport which natively works
 * with web standard Request/Response (perfect for Hono).
 *
 * Architecture: STATELESS — each POST creates a fresh McpServer + transport.
 * No in-memory session state, so Railway restarts / redeploys never break
 * active clients. The MCP SDK supports this via sessionIdGenerator: undefined.
 */

import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  fetchCapabilities,
  fetchSolutions,
  registerStraleTools,
  type Capability,
  type Solution,
} from "strale-mcp/tools";

// ─── Config ─────────────────────────────────────────────────────────────────

const STRALE_BASE_URL =
  process.env.STRALE_BASE_URL ??
  "https://api.strale.io";
const DEFAULT_MAX_PRICE_CENTS = parseInt(
  process.env.STRALE_MAX_PRICE_CENTS ?? "200",
  10,
);

// ─── Capabilities + solutions cache ─────────────────────────────────────────

let cachedCapabilities: Capability[] | null = null;
let cachedSolutions: Solution[] | null = null;
let catalogLoadedAt = 0;
const CAPABILITIES_TTL_MS = 10 * 60 * 1000; // refresh every 10 min

async function getCatalog(): Promise<{ capabilities: Capability[]; solutions: Solution[] }> {
  const now = Date.now();
  if (cachedCapabilities && cachedSolutions && now - catalogLoadedAt < CAPABILITIES_TTL_MS) {
    return { capabilities: cachedCapabilities, solutions: cachedSolutions };
  }

  try {
    const [caps, sols] = await Promise.all([
      fetchCapabilities(STRALE_BASE_URL),
      fetchSolutions(STRALE_BASE_URL),
    ]);
    cachedCapabilities = caps;
    cachedSolutions = sols;
    catalogLoadedAt = now;
    console.log(
      `[mcp-http] Loaded ${caps.length} capabilities, ${sols.length} solutions`,
    );
  } catch (err) {
    console.error(
      `[mcp-http] Failed to load catalog: ${err instanceof Error ? err.message : err}`,
    );
    if (cachedCapabilities && cachedSolutions) {
      return { capabilities: cachedCapabilities, solutions: cachedSolutions }; // stale is better than none
    }
    cachedCapabilities = cachedCapabilities ?? [];
    cachedSolutions = cachedSolutions ?? [];
    catalogLoadedAt = now;
  }

  return { capabilities: cachedCapabilities!, solutions: cachedSolutions! };
}

// ─── Create a stateless MCP handler ─────────────────────────────────────────

async function handleStatelessRequest(
  req: Request,
  apiKey: string,
): Promise<Response> {
  const server = new McpServer(
    { name: "strale", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const { capabilities, solutions } = await getCatalog();

  registerStraleTools(server, capabilities, solutions, {
    baseUrl: STRALE_BASE_URL,
    apiKey,
    maxPriceCents: DEFAULT_MAX_PRICE_CENTS,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session tracking
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    // Clean up after response is sent
    transport.close().catch(() => {});
    server.close().catch(() => {});
  }
}

// ─── Extract API key from request ───────────────────────────────────────────

function extractApiKey(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return "";
}

// ─── CORS headers ───────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ─── Hono route ─────────────────────────────────────────────────────────────

export const mcpRoute = new Hono();

// CORS preflight
mcpRoute.options("/", (c) => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

// All MCP methods on the root path
mcpRoute.all("/", async (c) => {
  const req = c.req.raw;
  const method = req.method;

  if (method === "POST") {
    const apiKey = extractApiKey(req);
    const response = await handleStatelessRequest(req, apiKey);
    return addCorsHeaders(response);
  }

  // GET and DELETE are only meaningful for stateful sessions.
  // In stateless mode, return a helpful error.
  if (method === "GET" || method === "DELETE") {
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              "This MCP endpoint is stateless. Send each request as a new POST to /mcp.",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }

  return addCorsHeaders(
    new Response(null, {
      status: 405,
      headers: { Allow: "GET, POST, DELETE, OPTIONS" },
    }),
  );
});
