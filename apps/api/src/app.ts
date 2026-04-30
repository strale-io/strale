import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { versionMiddleware } from "./lib/versioning.js";
import { rateLimitByIp } from "./lib/rate-limit.js";
import { rateLimitByIpDb } from "./lib/db-rate-limit.js";
import { adminOnly } from "./lib/admin-auth.js";
import { fireAndForget } from "./lib/fire-and-forget.js";
import { requestContext } from "./middleware/request-context.js";
import type { AppEnv } from "./types.js";
import { doRoute } from "./routes/do.js";
import { capabilitiesRoute } from "./routes/capabilities.js";
import { walletRoute } from "./routes/wallet.js";
import { transactionsRoute } from "./routes/transactions.js";
import { authRoute, agentSignupHandler } from "./routes/auth.js";
import { webhookRoute } from "./routes/webhook.js";
import { demandSignalsRoute } from "./routes/demand-signals.js";
import { mcpRoute } from "./routes/mcp.js";
import { agentCardRoute, a2aRoute } from "./routes/a2a.js";
import { adminRoute } from "./routes/admin.js";
import { solutionsRoute } from "./routes/solutions.js";
import { solutionExecuteRoute } from "./routes/solution-execute.js";
import { qualityRoute } from "./routes/quality.js";
import { suggestRoute } from "./routes/suggest.js";
import { internalQualityRoute } from "./routes/internal-quality.js";
import { internalTestsRoute } from "./routes/internal-tests.js";
import { internalLimitationsRoute } from "./routes/internal-limitations.js";
import { internalTrustRoute } from "./routes/internal-trust.js";
import { internalHealthMonitorRoute } from "./routes/internal-health-monitor.js";
import { replyWebhookRoute } from "./routes/reply-webhook.js";
import { auditRoute } from "./routes/audit.js";
import { internalOnboardingRoute } from "./routes/internal-onboarding.js";
import { x402GatewayV2, getX402Manifest, getX402WellKnownResources, getX402OpenApiPaths } from "./routes/x402-gateway-v2.js";
import { mcpServerCardRoute } from "./routes/mcp-server-card.js";
import { aiCatalogRoute } from "./routes/ai-catalog.js";
import { llmsTxtRoute } from "./routes/llms-txt.js";
import { platformFactsRoute } from "./routes/platform-facts.js";
import { disputeRoute } from "./routes/dispute.js";
import { openApiSpec } from "./openapi.js";
import { welcomeRoute } from "./routes/welcome.js";
import { getDb } from "./db/index.js";
import { sql } from "drizzle-orm";

// Capability executors + DataProvider chains are registered by
// autoRegisterCapabilities() in index.ts before the server starts.

export const app = new Hono<AppEnv>();

// F-0-014: request-scoped child logger (request_id, method, path). See
// middleware/request-context.ts. Mounted first so every subsequent handler
// has a populated `c.get("log")`.
app.use("*", requestContext());

// Global error handler — never leak internals to client
app.onError((err, c) => {
  console.error("[unhandled]", err.message, err.stack);
  return c.json(
    {
      error_code: "internal_error" as const,
      message: "An unexpected error occurred. Please try again.",
    },
    500,
  );
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json(
    {
      error_code: "not_found" as const,
      message: `No route matches ${c.req.method} ${c.req.path}`,
    },
    404,
  );
});

// F-0-018: hono/logger removed. The structured logger in
// middleware/request-context.ts emits a `request-complete` log with
// status_code + duration_ms at the end of every request, inheriting
// request_id/method/path from the child logger.

// Security headers — defence-in-depth for all responses
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-XSS-Protection", "0"); // modern browsers use CSP instead
  c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
});

// CORS — split policy: public read-only endpoints allow all origins,
// authenticated endpoints restricted to known frontends
const ALLOWED_ORIGINS = [
  "https://strale.dev",
  "https://www.strale.dev",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const restrictedCors = cors({
  origin: (origin) => {
    if (!origin) return "*";                 // Server-to-server (SDKs, MCP, curl)
    // origin === "null" intentionally rejected — sandboxed iframes should not
    // be able to issue credentialed cross-origin requests to payment endpoints.
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (origin.endsWith(".lovable.app") || origin.endsWith(".lovable.dev") || origin.endsWith(".lovableproject.com")) return origin;
    return "";
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "Strale-Version", "X-Source", "X-Capability"],
});

const publicCors = cors({
  origin: "*",
  allowMethods: ["GET", "OPTIONS"],
  allowHeaders: ["Content-Type"],
});

// x402 payment gateway — permissive CORS handled inside the route itself
app.use("/x402/*", publicCors);

// Public read-only endpoints — open CORS (data is intentionally public)
app.use("/v1/capabilities/*", publicCors);
app.use("/v1/capabilities", publicCors);
app.use("/v1/solutions/*", publicCors);
app.use("/v1/solutions", publicCors);
// F-0-003: split of the former /v1/internal/* mount.
//
//   /v1/public/ops/*   — read-only dashboard data for strale.dev.
//                         Public CORS, no auth. Path allowlist (PUBLIC_OPS_ALLOWLIST
//                         below) rejects everything that isn't a known dashboard
//                         route so new admin handlers can't accidentally land here.
//
//   /v1/internal/*     — admin-only. `adminOnly` middleware mounted right before
//                         the route registrations; deny-by-default. Any handler
//                         added under /v1/internal/* now requires admin auth
//                         by construction, not by per-handler convention.
//
// During the migration window both mounts point at the same route objects so
// the frontend can move from /v1/internal/<x> to /v1/public/ops/<x> without
// a forced-deploy order. The admin-auth wall at /v1/internal/* is live from
// commit time. When strale.dev has fully migrated, the /v1/internal/* public
// routes will naturally stop answering anonymously — no further change needed.
app.use("/v1/public/ops/*", publicCors);
app.use("/v1/public/ops/*", rateLimitByIp(120, 60_000));
app.use("/v1/internal/*", restrictedCors);
app.use("/v1/internal/*", rateLimitByIp(120, 60_000));
app.use("/v1/audit/*", publicCors);
app.use("/.well-known/*", publicCors);
app.use("/llms.txt", publicCors);
app.use("/llms-full.txt", publicCors);
app.use("/openapi.json", publicCors);
app.use("/robots.txt", publicCors);
app.use("/sitemap.xml", publicCors);
app.use("/api", publicCors);
app.use("/pricing", publicCors);
app.use("/status", publicCors);
app.use("/changelog", publicCors);
app.use("/terms", publicCors);
app.use("/terms-of-service", publicCors);
app.use("/privacy", publicCors);
app.use("/docs", publicCors);
app.use("/developers", publicCors);
app.use("/api-reference", publicCors);
app.use("/signup", publicCors);

// Authenticated / mutating endpoints — restricted CORS
app.use("/v1/*", restrictedCors);
app.use("/a2a", restrictedCors);
app.use("*", versionMiddleware());

// Body size limits — prevent memory exhaustion from oversized payloads
app.use("/v1/*", bodyLimit({ maxSize: 1024 * 1024 }));   // 1 MB for API routes
app.use("/a2a", bodyLimit({ maxSize: 256 * 1024 }));      // 256 KB for A2A
app.use("/mcp", bodyLimit({ maxSize: 512 * 1024 }));      // 512 KB for MCP

// A2A: Link header pointing to Agent Card on all API responses
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Link",
    '</.well-known/agent-card.json>; rel="agent-card"',
  );
});

// Health check — shallow (app is running)
app.get("/health", (c) => c.json({ status: "ok" }));

// Health check — deep (DB write path works, including indexes on transactions table)
// Use this for Railway health checks to catch index corruption, disk full, connection pool exhaustion, etc.
app.get("/health/deep", async (c) => {
  const start = Date.now();
  try {
    const db = getDb();
    // Test the write path on the transactions table (touches all indexes).
    // CTE inserts a probe row and immediately deletes it — atomic, no data left behind.
    // Uses solution_slug (not capability_id) to satisfy the XOR check constraint.
    await db.execute(sql`
      WITH probe AS (
        INSERT INTO transactions (solution_slug, status, input, price_cents, transparency_marker, data_jurisdiction, is_free_tier)
        VALUES ('_health_probe', 'health_probe', '{}', 0, 'algorithmic', 'EU', true)
        RETURNING id
      )
      DELETE FROM transactions WHERE id IN (SELECT id FROM probe)
    `);
    return c.json({ status: "ok", write_path: "ok", latency_ms: Date.now() - start });
  } catch (err) {
    console.error("[health/deep] Write-path probe failed:", err instanceof Error ? err.message : err);
    return c.json({ status: "degraded", write_path: "failed", error: err instanceof Error ? err.message : "unknown", latency_ms: Date.now() - start }, 503);
  }
});

// OpenAPI specification (with content negotiation)
// The static `openApiSpec` covers the /v1/* surface. Paid x402 routes are
// merged in at request time from getX402OpenApiPaths(), which reads the same
// DB-backed cache that drives /.well-known/x402. New capabilities flipping
// x402_enabled = true appear in /openapi.json on the next 60s cache refresh.

function buildOpenApiMarkdown(spec: { info?: { title?: string; version?: string; description?: string }; servers?: { url: string }[]; paths?: Record<string, Record<string, { summary?: string; description?: string }>> }): string {
  let md = `# ${spec.info?.title ?? "Strale API"} \u2014 OpenAPI ${spec.info?.version ?? "3.1.0"}\n\n`;
  md += `${spec.info?.description ?? ""}\n\n`;
  md += `Base URL: ${spec.servers?.[0]?.url ?? "https://api.strale.io"}\n\n`;
  md += "## Authentication\n\nBearer token: `Authorization: Bearer sk_live_...`\n\n## Endpoints\n\n";
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (method === "parameters") continue;
      md += `### ${method.toUpperCase()} ${path}\n${op.summary ?? ""}\n\n`;
    }
  }
  md += "## Full Spec\n\nThe complete OpenAPI 3.1.0 JSON specification is available at:\nhttps://api.strale.io/openapi.json (request with Accept: application/json)\n";
  return md;
}

app.get("/openapi.json", async (c) => {
  c.header("Vary", "Accept");
  const x402Paths = await getX402OpenApiPaths();
  const merged = {
    ...openApiSpec,
    tags: [
      ...(openApiSpec.tags ?? []),
      { name: "x402", description: "Pay-per-call endpoints (USDC on Base, no API key)" },
    ],
    paths: { ...(openApiSpec.paths ?? {}), ...x402Paths },
  };
  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/markdown")) {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Cache-Control", "public, max-age=300");
    return c.text(buildOpenApiMarkdown(merged));
  }
  c.header("Cache-Control", "public, max-age=300");
  return c.json(merged);
});

// Stripe webhook — must be before any body-parsing middleware
// Needs raw body for signature verification
app.route("/webhooks", webhookRoute);

// API v1 routes
app.route("/v1", doRoute);
app.route("/v1/capabilities", capabilitiesRoute);
app.route("/v1/wallet", walletRoute);
app.route("/v1/transactions", transactionsRoute);
app.route("/v1/auth", authRoute);
// F-0-002: DB-backed 1/day limit (survives Railway restarts; in-memory
// would reset on every redeploy, letting an attacker re-signup by timing
// their burst around a deploy).
app.post(
  "/v1/signup",
  rateLimitByIpDb({ windowSeconds: 86_400, max: 1, scope: "signup" }),
  agentSignupHandler,
);
app.route("/v1/demand-signals", demandSignalsRoute);
app.route("/v1/admin", adminRoute);
app.route("/v1/solutions", solutionsRoute);
app.route("/v1/solutions", solutionExecuteRoute);
app.route("/v1/quality", qualityRoute);
app.route("/v1", suggestRoute);
// Single source of truth for facts that appear on multiple surfaces.
// Public + cached 5min. See lib/platform-facts.ts for the rationale
// and the contract every consumer (frontend, llms.txt, agent card,
// methodology pages) should read from.
app.route("/v1/platform/facts", platformFactsRoute);
// Bucket C — GDPR Art. 22(3) dispute intake. Accepts authenticated
// (account holder) or signed-token (anonymous data subject with a
// shareable audit URL) submissions. See routes/dispute.ts.
app.route("/v1/transactions", disputeRoute);
// F-0-003 allowlist — the only paths /v1/public/ops/* will serve
// anonymously. Everything else returns 404. Derived from the route
// handlers that had no per-handler admin check on the day F-0-003 was
// cut; adding a new admin handler under /v1/public/ops/* is impossible
// because this gate rejects it before the router sees the request.
//
// Any change to this list needs a security review. New public dashboard
// routes go here; nothing else. If you find yourself wanting to add a
// POST/PUT/DELETE here, you're adding an admin action and you want
// /v1/internal/* instead.
const PUBLIC_OPS_ALLOWLIST: RegExp[] = [
  // tests/: quality-dashboard reads
  /^\/v1\/public\/ops\/tests\/capabilities\/[^/]+$/,
  /^\/v1\/public\/ops\/tests\/capabilities\/[^/]+\/history$/,
  /^\/v1\/public\/ops\/tests\/capabilities\/[^/]+\/runs$/,
  /^\/v1\/public\/ops\/tests\/capabilities\/[^/]+\/example-output$/,
  /^\/v1\/public\/ops\/tests\/solutions\/[^/]+$/,
  /^\/v1\/public\/ops\/tests\/solutions\/[^/]+\/runs$/,
  /^\/v1\/public\/ops\/tests\/dependency-health\/(?:summary|history)$/,
  /^\/v1\/public\/ops\/tests\/situations$/,
  // quality/, limitations/, trust/ — all GETs already public today
  /^\/v1\/public\/ops\/quality\/[^/]+$/,
  /^\/v1\/public\/ops\/quality\/[^/]+\/[^/]+$/,
  /^\/v1\/public\/ops\/limitations\/[^/]+$/,
  /^\/v1\/public\/ops\/limitations\/[^/]+\/[^/]+$/,
  /^\/v1\/public\/ops\/trust\/capabilities(?:\/[^/]+(?:\/[^/]+)?)?$/,
  /^\/v1\/public\/ops\/trust\/solutions(?:\/[^/]+(?:\/[^/]+)?)?$/,
  // health-monitor/events, onboarding/readiness — anonymous reads today
  /^\/v1\/public\/ops\/events$/,
  /^\/v1\/public\/ops\/onboarding\/readiness$/,
];

app.use("/v1/public/ops/*", async (c, next) => {
  if (c.req.method !== "GET") return c.notFound();
  if (!PUBLIC_OPS_ALLOWLIST.some((re) => re.test(c.req.path))) return c.notFound();
  return next();
});

// Mount the public-ops dashboards. Same routers as /v1/internal/* — the
// allowlist above, not the router, is the access boundary.
app.route("/v1/public/ops/quality", internalQualityRoute);
app.route("/v1/public/ops/tests", internalTestsRoute);
app.route("/v1/public/ops/limitations", internalLimitationsRoute);
app.route("/v1/public/ops/trust", internalTrustRoute);
app.route("/v1/public/ops", internalHealthMonitorRoute);
app.route("/v1/public/ops/onboarding", internalOnboardingRoute);

// F-0-003: admin-only wall. Any handler under /v1/internal/* now requires
// `Authorization: Bearer $ADMIN_SECRET` — enforced at the mount, not by
// each handler. The per-handler isValidAdminAuth checks inside the route
// files are kept as defence-in-depth but are no longer load-bearing.
app.use("/v1/internal/*", adminOnly);

app.route("/v1/internal/quality", internalQualityRoute);
app.route("/v1/internal/tests", internalTestsRoute);
app.route("/v1/internal/limitations", internalLimitationsRoute);
app.route("/v1/internal/trust", internalTrustRoute);
app.route("/v1/internal", internalHealthMonitorRoute);
app.route("/v1/internal", replyWebhookRoute);
app.route("/v1/internal/onboarding", internalOnboardingRoute);
app.route("/v1/audit", auditRoute);

import { verifyRoute } from "./routes/verify.js";
app.route("/v1/verify", verifyRoute);

// Post-deploy verification (30s delay, tests unstable/recovering capabilities)
fireAndForget(
  async () => {
    const { triggerOnDeploy } = await import("./lib/event-triggers.js");
    return triggerOnDeploy();
  },
  { label: "post-deploy-verification" },
);

// Pre-warm the suggest catalog (called after env is loaded, see index.ts)
export { warmCatalog } from "./lib/suggest.js";

// MCP Streamable HTTP transport (remote MCP access)
app.route("/mcp", mcpRoute);

// A2A protocol — Agent Card discovery + JSON-RPC task endpoint
app.route("/.well-known/agent-card.json", agentCardRoute);
app.route("/.well-known/agent.json", agentCardRoute); // alias
app.route("/agent.json", agentCardRoute); // convenience alias
app.route("/a2a", a2aRoute);

// Agent welcome mat — self-describing entry point + robots.txt + sitemap.xml
app.route("/", welcomeRoute);

// Agent discovery — MCP Server Card, AI Catalog, LLM-friendly text
app.route("/.well-known/mcp.json", mcpServerCardRoute);
app.route("/.well-known/ai-catalog.json", aiCatalogRoute);
app.route("/", llmsTxtRoute);

// Log x402 configuration
const _x402Wallet = process.env.X402_WALLET_ADDRESS;
if (_x402Wallet) {
  console.log(`[x402] Gateway active — wallet: ${_x402Wallet.slice(0, 8)}..., DB-driven catalog`);
} else {
  console.warn("[x402] X402_WALLET_ADDRESS not set — x402 routes in stub mode");
}

// x402 payment gateway — DB-driven, scalable to 100K+ capabilities
app.route("/x402", x402GatewayV2);

// x402 manifest — DB-driven machine-readable list of x402-enabled endpoints
app.get("/.well-known/x402.json", async (c) => {
  c.header("Cache-Control", "public, max-age=300");
  const manifest = await getX402Manifest();
  return c.json(manifest);
});

// Spec-compliant fan-out for x402scan / awesome-x402 indexers
// (DISCOVERY.md: GET /.well-known/x402 → { version: 1, resources: [absolute URL...] })
app.get("/.well-known/x402", async (c) => {
  c.header("Cache-Control", "public, max-age=300");
  const payload = await getX402WellKnownResources();
  return c.json(payload);
});

// 402 Index domain verification token
app.get("/.well-known/402index-verify.txt", (c) => {
  return c.text("17d2659be9455122b7f464fa3c960a165f7d9dc6d828c90bdc96f33129b626d8");
});

// Glama MCP connector claim — proves domain ownership for glama.ai/mcp/connectors
app.get("/.well-known/glama.json", (c) => {
  return c.json({
    $schema: "https://glama.ai/mcp/schemas/connector.json",
    maintainers: [{ email: "petter@strale.io" }],
  });
});

