import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { versionMiddleware } from "./lib/versioning.js";
import { rateLimitByIp } from "./lib/rate-limit.js";
import { doRoute } from "./routes/do.js";
import { capabilitiesRoute } from "./routes/capabilities.js";
import { walletRoute } from "./routes/wallet.js";
import { transactionsRoute } from "./routes/transactions.js";
import { authRoute } from "./routes/auth.js";
import { webhookRoute } from "./routes/webhook.js";
import { demandSignalsRoute } from "./routes/demand-signals.js";
import { mcpRoute } from "./routes/mcp.js";
import { agentCardRoute, a2aRoute } from "./routes/a2a.js";
import { adminRoute } from "./routes/admin.js";
import { solutionsRoute } from "./routes/solutions.js";
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
import { x402Route } from "./routes/x402-gateway.js";
import { mcpServerCardRoute } from "./routes/mcp-server-card.js";
import { aiCatalogRoute } from "./routes/ai-catalog.js";
import { llmsTxtRoute } from "./routes/llms-txt.js";
import { openApiSpec } from "./openapi.js";

// Capability executors + DataProvider chains are registered by
// autoRegisterCapabilities() in index.ts before the server starts.

export const app = new Hono();

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

app.use("*", logger());

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
    if (origin.endsWith(".lovable.app") || origin.endsWith(".lovable.dev")) return origin;
    return "";
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "Strale-Version"],
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
app.use("/v1/internal/*", publicCors);
app.use("/v1/internal/*", rateLimitByIp(120, 60_000));  // S-7: rate limit public internal endpoints
app.use("/v1/audit/*", publicCors);
app.use("/.well-known/*", publicCors);
app.use("/llms.txt", publicCors);
app.use("/llms-full.txt", publicCors);
app.use("/openapi.json", publicCors);

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

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// OpenAPI specification
app.get("/openapi.json", (c) => c.json(openApiSpec));

// Stripe webhook — must be before any body-parsing middleware
// Needs raw body for signature verification
app.route("/webhooks", webhookRoute);

// API v1 routes
app.route("/v1", doRoute);
app.route("/v1/capabilities", capabilitiesRoute);
app.route("/v1/wallet", walletRoute);
app.route("/v1/transactions", transactionsRoute);
app.route("/v1/auth", authRoute);
app.route("/v1/demand-signals", demandSignalsRoute);
app.route("/v1/admin", adminRoute);
app.route("/v1/solutions", solutionsRoute);
app.route("/v1/quality", qualityRoute);
app.route("/v1", suggestRoute);
app.route("/v1/internal/quality", internalQualityRoute);
app.route("/v1/internal/tests", internalTestsRoute);
app.route("/v1/internal/limitations", internalLimitationsRoute);
app.route("/v1/internal/trust", internalTrustRoute);
app.route("/v1/internal", internalHealthMonitorRoute);
app.route("/v1/internal", replyWebhookRoute);
app.route("/v1/internal/onboarding", internalOnboardingRoute);
app.route("/v1/audit", auditRoute);

// Post-deploy verification (30s delay, tests unstable/recovering capabilities)
import("./lib/event-triggers.js")
  .then(({ triggerOnDeploy }) => triggerOnDeploy().catch(() => {}))
  .catch(() => {});

// Pre-warm the suggest catalog (called after env is loaded, see index.ts)
export { warmCatalog } from "./lib/suggest.js";

// MCP Streamable HTTP transport (remote MCP access)
app.route("/mcp", mcpRoute);

// A2A protocol — Agent Card discovery + JSON-RPC task endpoint
app.route("/.well-known/agent-card.json", agentCardRoute);
app.route("/.well-known/agent.json", agentCardRoute); // alias
app.route("/agent.json", agentCardRoute); // convenience alias
app.route("/a2a", a2aRoute);

// Agent discovery — MCP Server Card, AI Catalog, LLM-friendly text
app.route("/.well-known/mcp.json", mcpServerCardRoute);
app.route("/.well-known/ai-catalog.json", aiCatalogRoute);
app.route("/", llmsTxtRoute);

// x402 payment gateway — paid API endpoints for the 402 ecosystem (402index.io)
app.route("/x402", x402Route);

// 402 Index domain verification token
app.get("/.well-known/402index-verify.txt", (c) => {
  return c.text("17d2659be9455122b7f464fa3c960a165f7d9dc6d828c90bdc96f33129b626d8");
});

