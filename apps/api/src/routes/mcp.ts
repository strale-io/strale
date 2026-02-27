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
 * Architecture: one McpServer + transport per session. Sessions are
 * stored in memory and cleaned up after 30 minutes of inactivity.
 */

import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { randomUUID } from "node:crypto";
import {
  fetchCapabilities,
  registerStraleTools,
  type Capability,
} from "strale-mcp/tools";

// ─── Config ─────────────────────────────────────────────────────────────────

const STRALE_BASE_URL =
  process.env.STRALE_BASE_URL ??
  "https://strale-production.up.railway.app";
const DEFAULT_MAX_PRICE_CENTS = parseInt(
  process.env.STRALE_MAX_PRICE_CENTS ?? "200",
  10,
);
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ─── Session store ──────────────────────────────────────────────────────────

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
  apiKey: string;
}

const sessions = new Map<string, McpSession>();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      session.transport.close().catch(() => {});
      session.server.close().catch(() => {});
      sessions.delete(id);
      console.log(`[mcp-http] Session ${id.slice(0, 8)}... expired`);
    }
  }
}, 5 * 60 * 1000).unref();

// ─── Capabilities cache ─────────────────────────────────────────────────────

let cachedCapabilities: Capability[] | null = null;
let capabilitiesLoadedAt = 0;
const CAPABILITIES_TTL_MS = 10 * 60 * 1000; // refresh every 10 min

async function getCapabilities(): Promise<Capability[]> {
  const now = Date.now();
  if (cachedCapabilities && now - capabilitiesLoadedAt < CAPABILITIES_TTL_MS) {
    return cachedCapabilities;
  }

  try {
    cachedCapabilities = await fetchCapabilities(STRALE_BASE_URL);
    capabilitiesLoadedAt = now;
    console.log(
      `[mcp-http] Loaded ${cachedCapabilities.length} capabilities`,
    );
  } catch (err) {
    console.error(
      `[mcp-http] Failed to load capabilities: ${err instanceof Error ? err.message : err}`,
    );
    if (cachedCapabilities) return cachedCapabilities; // stale is better than none
    cachedCapabilities = [];
    capabilitiesLoadedAt = now;
  }

  return cachedCapabilities;
}

// ─── Create a new MCP session ───────────────────────────────────────────────

async function createSession(apiKey: string): Promise<McpSession> {
  const server = new McpServer(
    { name: "strale", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const capabilities = await getCapabilities();

  registerStraleTools(server, capabilities, {
    baseUrl: STRALE_BASE_URL,
    apiKey,
    maxPriceCents: DEFAULT_MAX_PRICE_CENTS,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      sessions.set(sessionId, session);
      console.log(
        `[mcp-http] Session ${sessionId.slice(0, 8)}... initialized (auth: ${apiKey ? "yes" : "anonymous"})`,
      );
    },
    onsessionclosed: (sessionId: string) => {
      sessions.delete(sessionId);
      console.log(`[mcp-http] Session ${sessionId.slice(0, 8)}... closed`);
    },
  });

  await server.connect(transport);

  const session: McpSession = {
    transport,
    server,
    lastActivity: Date.now(),
    apiKey,
  };

  return session;
}

// ─── Extract API key from request ───────────────────────────────────────────

function extractApiKey(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const url = new URL(req.url);
  return url.searchParams.get("api_key") ?? "";
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

// All MCP methods (POST, GET, DELETE) on the root path
mcpRoute.all("/", async (c) => {
  const req = c.req.raw;
  const method = req.method;

  // Look for existing session
  const sessionId = req.headers.get("mcp-session-id");

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActivity = Date.now();
    const response = await session.transport.handleRequest(req);
    return addCorsHeaders(response);
  }

  if (method === "POST") {
    // New session — initialization request
    const apiKey = extractApiKey(req);
    const session = await createSession(apiKey);
    const response = await session.transport.handleRequest(req);
    return addCorsHeaders(response);
  }

  // GET or DELETE without valid session
  if (method === "GET" || method === "DELETE") {
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "No active session. Send an initialization POST first.",
          },
        }),
        {
          status: sessionId ? 404 : 400,
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
