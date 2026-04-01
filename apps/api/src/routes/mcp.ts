/**
 * MCP Streamable HTTP transport endpoint.
 *
 * Mounts at /mcp on the Hono app. Exposes the same 229 tools as the
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
import { rateLimitByIp } from "../lib/rate-limit.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  fetchCapabilities,
  fetchSolutions,
  fetchTrustBatch,
  fetchSolutionTrust,
  registerStraleTools,
  type Capability,
  type Solution,
  type TrustBatchEntry,
  type SolutionTrustEntry,
} from "strale-mcp/tools";

// ─── Config ─────────────────────────────────────────────────────────────────

// The MCP HTTP endpoint lives on the API server itself. Use localhost so
// internal catalog fetches and tool calls never need hairpin NAT through the
// public domain (which fails inside Railway containers). Callers that need
// the public-facing URL can set STRALE_BASE_URL explicitly.
const PORT = process.env.PORT ?? "3000";
const STRALE_BASE_URL =
  process.env.STRALE_BASE_URL ??
  `http://localhost:${PORT}`;
const DEFAULT_MAX_PRICE_CENTS = parseInt(
  process.env.STRALE_MAX_PRICE_CENTS ?? "200",
  10,
);

// ─── Capabilities + solutions cache ─────────────────────────────────────────

let cachedCapabilities: Capability[] | null = null;
let cachedSolutions: Solution[] | null = null;
let cachedTrustData: Map<string, TrustBatchEntry> | null = null;
let cachedSolutionTrustData: Map<string, SolutionTrustEntry> | null = null;
let catalogLoadedAt = 0;
const CAPABILITIES_TTL_MS = 10 * 60 * 1000; // refresh every 10 min

async function getCatalog(): Promise<{
  capabilities: Capability[];
  solutions: Solution[];
  trustData: Map<string, TrustBatchEntry>;
  solutionTrustData: Map<string, SolutionTrustEntry>;
}> {
  const now = Date.now();
  // Require non-empty capabilities to count as a valid cache hit — empty arrays
  // mean a prior fetch failed and should be retried immediately, not served for 10 min.
  if (
    cachedCapabilities && cachedCapabilities.length > 0 &&
    cachedSolutions && cachedTrustData && cachedSolutionTrustData &&
    now - catalogLoadedAt < CAPABILITIES_TTL_MS
  ) {
    return { capabilities: cachedCapabilities, solutions: cachedSolutions, trustData: cachedTrustData, solutionTrustData: cachedSolutionTrustData };
  }

  try {
    const [caps, sols] = await Promise.all([
      fetchCapabilities(STRALE_BASE_URL),
      fetchSolutions(STRALE_BASE_URL),
    ]);
    // Fetch trust data after we know the slugs
    const [trust, solTrust] = await Promise.all([
      fetchTrustBatch(STRALE_BASE_URL, caps.map((c) => c.slug)),
      fetchSolutionTrust(STRALE_BASE_URL, sols.map((s) => s.slug)),
    ]);
    cachedCapabilities = caps;
    cachedSolutions = sols;
    cachedTrustData = trust;
    cachedSolutionTrustData = solTrust;
    catalogLoadedAt = now;
    console.log(
      `[mcp-http] Loaded ${caps.length} capabilities, ${sols.length} solutions, ${trust.size} cap trust, ${solTrust.size} sol trust`,
    );
  } catch (err) {
    console.error(
      `[mcp-http] Failed to load catalog: ${err instanceof Error ? err.message : err}`,
    );
    if (cachedCapabilities && cachedSolutions && cachedTrustData && cachedSolutionTrustData) {
      return { capabilities: cachedCapabilities, solutions: cachedSolutions, trustData: cachedTrustData, solutionTrustData: cachedSolutionTrustData };
    }
    cachedCapabilities = cachedCapabilities ?? [];
    cachedSolutions = cachedSolutions ?? [];
    cachedTrustData = cachedTrustData ?? new Map();
    cachedSolutionTrustData = cachedSolutionTrustData ?? new Map();
    // Do NOT update catalogLoadedAt here — empty fallback arrays should not
    // be cached for the full 10-min TTL. Leave it at 0 so the next request
    // immediately retries (or at the previous successful load time).
  }

  return { capabilities: cachedCapabilities!, solutions: cachedSolutions!, trustData: cachedTrustData!, solutionTrustData: cachedSolutionTrustData! };
}

// Pre-warm cache on server start so first MCP session is instant
getCatalog().then(() => {
  console.log("[mcp-http] Cache pre-warmed");
}).catch((err) => {
  console.error(`[mcp-http] Pre-warm failed: ${err instanceof Error ? err.message : err}`);
});

// ─── Create a stateless MCP handler ─────────────────────────────────────────

async function handleStatelessRequest(
  req: Request,
  apiKey: string,
  clientIp: string,
): Promise<Response> {
  const server = new McpServer(
    { name: "strale", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const { capabilities, solutions, trustData, solutionTrustData } = await getCatalog();

  registerStraleTools(server, capabilities, solutions, {
    baseUrl: STRALE_BASE_URL,
    apiKey,
    clientIp,
    maxPriceCents: DEFAULT_MAX_PRICE_CENTS,
    version: "0.2.3", // matches strale-mcp npm version — update on publish
  }, trustData, solutionTrustData);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session tracking
  });

  await server.connect(transport);

  const response = await transport.handleRequest(req);

  // The response body is an SSE stream. We must not close the transport until
  // the stream is fully consumed — closing it early kills the stream before
  // any JSON-RPC events are sent (Content-Length: 0 symptom).
  if (response.body) {
    const { readable, writable } = new TransformStream();
    response.body.pipeTo(writable).finally(() => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    return new Response(readable, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  // No body (e.g., notification-only responses) — clean up immediately.
  transport.close().catch(() => {});
  server.close().catch(() => {});
  return response;
}

// ─── Extract API key from request ───────────────────────────────────────────

function extractApiKey(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return "";
}

// ─── Extract client IP for free-tier rate limiting ──────────────────────────

function extractClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "unknown";
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

// IP rate limiting for MCP endpoint — 60 requests/minute per IP
mcpRoute.use("*", rateLimitByIp(60, 60_000));

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
    const clientIp = extractClientIp(req);
    const response = await handleStatelessRequest(req, apiKey, clientIp);
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
