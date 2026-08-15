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
import { recordDiscoveryHit, type HeaderReader } from "../lib/attribution.js";
import { log, logError } from "../lib/log.js";
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
  type McpFunnelEvent,
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
    log.info(
      {
        label: "mcp-http-catalog-loaded",
        capabilities: caps.length,
        solutions: sols.length,
        cap_trust: trust.size,
        sol_trust: solTrust.size,
      },
      "mcp-http-catalog-loaded",
    );
  } catch (err) {
    logError("mcp-http-catalog-load-failed", err);
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
  log.info({ label: "mcp-http-prewarm-done" }, "mcp-http-prewarm-done");
}).catch((err) => {
  logError("mcp-http-prewarm-failed", err);
});

// ─── MCP funnel instrumentation (readiness P0, 2026-08-15) ─────────────────
//
// "Strale can see agents arriving and can see revenue, but nothing in
// between." Reuses discovery_hits UNMODIFIED (see migration 0083's comment
// for why extending the schema wasn't necessary): funnel step + tool name +
// rejection reason are all encoded into the existing `endpoint` text
// column, the same pattern `/mcp:initialize` already established before
// this change. Every write goes through recordDiscoveryHit, which is
// fire-and-forget and never throws (DEC-20260504-A visibility discipline:
// the swallow is logged there, not here) — so none of this can add latency
// or a failure mode to the highest-traffic endpoint on the platform.
//
// Two capture paths, deliberately different in what they observe:
//   1. classifyMcpRequest — PRE-dispatch peek of the JSON-RPC body. Records
//      that a funnel step was REACHED (initialize / tools/list / a named
//      tools/call). Cheap and stateless-safe: no correlation with anything
//      that happens after this request's own response.
//   2. funnelEventEndpoint — the OUTCOME side, fired from inside tool
//      execution via registerStraleTools' `onFunnelEvent` hook
//      (packages/mcp-server/src/tools.ts). This is the only way to observe
//      an auth-or-payment rejection, because that decision happens deep
//      inside a specific tool's handler (e.g. strale_execute checking
//      opts.apiKey, or the /v1/do response's error_code) — not visible from
//      the pre-dispatch peek, which only sees the request.

/**
 * Strip a client-supplied string down to a safe token before it becomes
 * part of `endpoint` — defends the analytics surface against an oversized
 * or oddly-charactered tool name (MCP tool names are developer-chosen
 * strings, not a closed enum Strale controls).
 */
function sanitizeFunnelToken(raw: string | undefined): string {
  if (!raw) return "unknown";
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned || "unknown";
}

interface McpPeekBody {
  method?: string;
  params?: {
    clientInfo?: { name?: string; version?: string };
    name?: string;
  };
}

/**
 * Map a peeked JSON-RPC request body to the discovery_hits endpoint label
 * for the funnel step it represents. Returns null for methods the funnel
 * doesn't track (notifications/*, ping, resources/*, …) — the caller skips
 * the write entirely rather than recording a meaningless hit.
 *
 * Pure and exported for unit testing — no request/DB access, so this can be
 * tested without a Hono app or a database.
 */
export function classifyMcpRequest(
  peek: McpPeekBody | null,
): { endpoint: string; uaOverride?: string } | null {
  if (!peek?.method) return null;

  if (peek.method === "initialize") {
    // clientInfo (name/version) is the only place a stateless-mode caller
    // identifies itself — used as a UA override since real UA headers are
    // often generic (undici, node-fetch) or absent entirely.
    const ci = peek.params?.clientInfo;
    const uaOverride = ci?.name ? `${ci.name}/${ci.version ?? "?"}` : undefined;
    return { endpoint: "/mcp:initialize", uaOverride };
  }

  if (peek.method === "tools/list") {
    return { endpoint: "/mcp:tools/list" };
  }

  if (peek.method === "tools/call") {
    return { endpoint: `/mcp:tools/call:${sanitizeFunnelToken(peek.params?.name)}` };
  }

  return null;
}

/** Endpoint label for an auth-or-payment rejection surfaced during tool execution. */
export function funnelEventEndpoint(event: McpFunnelEvent): string {
  return `/mcp:reject:${event.type}:${sanitizeFunnelToken(event.tool)}`;
}

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

  // Same HeaderReader shape the initialize peek below uses — real headers,
  // no UA override (rejections happen well after any clientInfo we saw at
  // this request's own peek, and stateless mode has no session to carry it
  // forward through).
  const headerReader: HeaderReader = { header: (n: string) => req.headers.get(n) ?? undefined };

  registerStraleTools(server, capabilities, solutions, {
    baseUrl: STRALE_BASE_URL,
    apiKey,
    clientIp,
    maxPriceCents: DEFAULT_MAX_PRICE_CENTS,
    version: "0.2.4", // matches strale-mcp npm version — update on publish
    onFunnelEvent: (event) => {
      recordDiscoveryHit(funnelEventEndpoint(event), headerReader, { ip: clientIp ?? undefined });
    },
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
      transport.close().catch((err: unknown) => logError("mcp-transport-close-failed", err));
      server.close().catch((err: unknown) => logError("mcp-server-close-failed", err));
    });
    return new Response(readable, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  // No body (e.g., notification-only responses) — clean up immediately.
  transport.close().catch((err: unknown) => logError("mcp-transport-close-failed", err));
  server.close().catch((err: unknown) => logError("mcp-server-close-failed", err));
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
    // MCP funnel arrival tracking (initialize / tools/list / tools/call):
    // peeked from a clone so the transport stream is untouched. Failure here
    // must never affect the MCP call — see classifyMcpRequest's docstring
    // above for what this captures and what it deliberately doesn't
    // (rejection outcomes, which come from the onFunnelEvent hook inside
    // handleStatelessRequest instead).
    try {
      const peek = (await req.clone().json().catch(() => null)) as McpPeekBody | null;
      const classified = classifyMcpRequest(peek);
      if (classified) {
        recordDiscoveryHit(classified.endpoint, {
          header: (n: string) =>
            n.toLowerCase() === "user-agent" && classified.uaOverride
              ? classified.uaOverride
              : req.headers.get(n) ?? undefined,
        }, { ip: clientIp ?? undefined });
      }
    } catch {
      // best-effort only
    }
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
