import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { MAX_DECODED_DOCUMENT_BYTES } from "./lib/resource-limits.js";
import { HTTPException } from "hono/http-exception";
import { versionMiddleware } from "./lib/versioning.js";
import { apiError } from "./lib/errors.js";
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
import { web3AssuranceRoute } from "./web3-assurance/routes.js";
import {
  methodologyRoute as web3AssuranceMethodologyRoute,
  sourceQualityRoute as web3AssuranceSourceQualityRoute,
  bridgeConfigIndexRoute as web3AssuranceBridgeConfigIndexRoute,
} from "./web3-assurance/methodology.js";
import { trustIndexRoute as web3AssuranceTrustIndexRoute } from "./web3-assurance/trust-index.js";
import { suggestRoute } from "./routes/suggest.js";
import { internalTestsRoute } from "./routes/internal-tests.js";
import { internalLimitationsRoute } from "./routes/internal-limitations.js";
import { internalHealthMonitorRoute } from "./routes/internal-health-monitor.js";
import { replyWebhookRoute } from "./routes/reply-webhook.js";
import { auditRoute } from "./routes/audit.js";
import { internalOnboardingRoute } from "./routes/internal-onboarding.js";
import { publicTrustRoute } from "./routes/public-trust.js";
import { x402GatewayV2, getX402Manifest, getX402WellKnownResources, getX402OpenApiPaths } from "./routes/x402-gateway-v2.js";
import { mcpServerCardRoute } from "./routes/mcp-server-card.js";
import {
  withdrawnSlugs,
  requestNamesWithdrawn,
  pruneWithdrawn,
} from "./lib/public-ops-visibility.js";
import { aiCatalogRoute } from "./routes/ai-catalog.js";
import { llmsTxtRoute } from "./routes/llms-txt.js";
import { recordDiscoveryHit } from "./lib/attribution.js";
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

// Global error handler — never leak internals to client.
//
// Server-side, classify the error so dashboards can group by underlying
// cause instead of staring at an undifferentiated "internal_error" bucket.
// The PR-43 incident (do.ts spendCapWouldExceed Date-encoding bug) sat
// silent for 4 days because every failure logged as plain "[unhandled]"
// with no error_class field — there was no way to alert on a sudden
// surge of db_bind_error entries vs. genuine 500s.
//
// Client-facing response stays generic (no internals leaked) — the
// classification lives only in structured logs.
export function classifyError(err: Error): {
  error_class: string;
  pg_code?: string;
} {
  const e = err as Error & { code?: string };
  // postgres-js attaches `code` (5-char SQLSTATE) on real DB errors.
  if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) {
    // Common SQLSTATEs we care about; rest fall through to `db_unknown`.
    const known: Record<string, string> = {
      "23505": "db_unique_violation",
      "23503": "db_foreign_key_violation",
      "23502": "db_not_null_violation",
      "23514": "db_check_violation",
      "25P03": "db_idle_in_tx_timeout",
      "55P03": "db_lock_timeout",
      "57014": "db_query_canceled",
      "40001": "db_serialization_failure",
      "40P01": "db_deadlock",
      "42703": "db_undefined_column",
      "42P01": "db_undefined_table",
    };
    return { error_class: known[e.code] ?? "db_unknown", pg_code: e.code };
  }
  // postgres-js bind-encoder failure (the PR-43 shape): TypeError thrown
  // from Buffer.byteLength when a non-string/Buffer reaches the wire.
  // No SQLSTATE because we never made it to the server.
  if (
    err.name === "TypeError" &&
    err.message.includes("string") &&
    /Date|Buffer|ArrayBuffer/.test(err.message) &&
    /byteLength|prepared|Bind|ParameterDescription/.test(err.stack ?? "")
  ) {
    return { error_class: "db_bind_encoder" };
  }
  // Hono's BodyTimeout / our explicit AbortError shapes.
  if (err.name === "AbortError" || err.message.includes("aborted")) {
    return { error_class: "request_aborted" };
  }
  if (err.name === "ZodError" || err.message.startsWith("Validation")) {
    return { error_class: "validation_error" };
  }
  return { error_class: "unknown" };
}

/**
 * Fixed client-facing responses for middleware-thrown HTTPExceptions, keyed by
 * status. Deliberately a closed set with constant messages: see the note in
 * app.onError for why an exception's own message is not echoed.
 */
const HTTP_EXCEPTION_RESPONSES: Record<
  number,
  { code: "invalid_request" | "rate_limited"; message: string }
> = {
  413: { code: "invalid_request", message: "Request body is too large." },
};

app.onError((err, c) => {
  // WP0 §3 (CR-12): Hono middleware signals client-side rejections by throwing
  // HTTPException — bodyLimit throws 413 Payload Too Large. Without this
  // branch every such rejection was rewritten to `500 internal_error`, so the
  // pre-existing /v1, /a2a and /mcp body caps have been reporting oversized
  // payloads as server faults. Memory was still bounded; the status was a lie.
  //
  // Only statuses with an explicit mapping are re-emitted in this platform's
  // { error_code, message } shape, and the message is a fixed string. An
  // HTTPException's own message is diagnostic text that may name internals,
  // so it is never echoed to the client.
  //
  // Anything unmapped returns hono's own response untouched. That preserves
  // the status and any headers the middleware set — WWW-Authenticate on a 401,
  // Retry-After on a 429 — which rewriting the body would discard. Today only
  // bodyLimit's 413 is reachable; this keeps the fallback honest if that
  // changes. 5xx still falls through to classification and logging below.
  if (err instanceof HTTPException) {
    const mapped = HTTP_EXCEPTION_RESPONSES[err.status];
    if (mapped) {
      return c.json(apiError(mapped.code, mapped.message), err.status);
    }
    if (err.status < 500) {
      return err.getResponse();
    }
  }
  const { error_class, pg_code } = classifyError(err);
  const reqLog = (c.get("log" as any) as { error?: (...args: unknown[]) => void } | undefined);
  const logCtx = {
    label: "unhandled",
    error_class,
    ...(pg_code ? { pg_code } : {}),
    err_name: err.name,
    err_message: err.message,
    method: c.req.method,
    path: c.req.path,
    stack: err.stack,
  };
  if (reqLog?.error) {
    reqLog.error(logCtx, "[unhandled]");
  } else {
    // Pre-requestContext path (rare); fall back to console with the same shape.
    console.error("[unhandled]", JSON.stringify(logCtx));
  }
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

// WP0 §3 (CR-12): when an X-Payment header is present the wildcard handlers
// call the external facilitator to verify BEFORE any throttle applied, so an
// attacker could force unbounded facilitator verifications with junk headers.
// Only /x402/catalog carried a limiter. This bounds the rest of the rail.
// The ceiling is deliberately well above real agent traffic (a paying caller
// makes one request per payment) but low enough to stop verification floods.
//
// /x402/catalog is excluded: it is a cheap cached read that already declares
// its own, higher, 120/min limit at the handler. Wrapping it here would
// silently cut its documented capacity in half.
const x402CatalogPath = /^\/x402\/catalog\/?$/;
const x402RailLimiter = rateLimitByIp(60, 60_000);
app.use("/x402/*", async (c, next) => {
  if (x402CatalogPath.test(c.req.path)) return next();
  return x402RailLimiter(c, next);
});

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
// Discovery endpoints now do a (fire-and-forget) attribution INSERT per hit —
// rate-limit like their /v1/public neighbors so an unauthenticated crawl
// burst can't queue writes against the shared pool (review M-1).
app.use("/llms.txt", rateLimitByIp(120, 60_000));
app.use("/llms-full.txt", rateLimitByIp(120, 60_000));
app.use("/.well-known/*", rateLimitByIp(120, 60_000));
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

// The x402 rail had NO body cap at all. Every other entry point above has had
// one for months; this one was simply never added, so `/x402/:slug` buffered
// whatever a caller sent straight into `c.req.json()`.
//
// ## Why 8 MiB and not the 1 MiB used for /v1
//
// Copying the /v1 number would have broken a capability contract. Measured
// evidence, 2026-08-25:
//
//   - Largest x402 request body ever observed: 2,658 bytes, across 1,537
//     requests since 2026-08-15. p50 41 B, p95 111 B, p99 289 B.
//   - Largest input the platform INTENTIONALLY supports: image-to-text
//     declares MAX_IMAGE_BYTES = 4 MiB decoded. Base64 is 4/3 expansion, so
//     that is ~5.33 MiB on the wire before the JSON wrapper.
//   - Seven x402 capabilities accept base64 (image-resize, image-to-text,
//     receipt-categorize, pdf-extract, invoice-extract, contract-extract,
//     resume-parse). Four of those are document extractors where multi-MiB
//     PDFs are the normal case.
//
// 8 MiB clears the 5.33 MiB contract with room for the JSON wrapper and
// sibling fields, and is ~3,000x the largest request ever seen — so it cannot
// affect real traffic. Its job is not to be tight. It is to turn "unbounded"
// into "bounded"; the tight limits belong in the capabilities, where the units
// are decoded bytes and output pixels rather than wire bytes.
// #426: the cap IS the document-limit authority constant, imported rather
// than restated — MAX_DECODED_DOCUMENT_BYTES was chosen (#412) to equal this
// rail cap, and an import makes the alignment hold by construction (the
// boundary tests in x402-body-limit.test.ts drive it as regression cover).
app.use("/x402/*", bodyLimit({ maxSize: MAX_DECODED_DOCUMENT_BYTES }));

// A2A: Link header pointing to Agent Card on all API responses
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Link",
    '</.well-known/agent-card.json>; rel="agent-card"',
  );
});

// Health check — shallow (app is running). `commit` surfaces the build SHA
// (12-char short form, matches `git log --oneline`) for deploy-mechanism
// verification (Rule 14): query /health to confirm a redeploy has reached
// prod without reading service logs.
app.get("/health", (c) =>
  c.json({
    status: "ok",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  }),
);

// Health check — deep (DB write path works, including indexes on transactions table)
// Use this for Railway health checks to catch index corruption, disk full, connection pool exhaustion, etc.
// WP0 §3 (CR-12): this probe performs a real INSERT+DELETE on `transactions`
// (deliberately, to exercise every index). Unauthenticated and unthrottled, it
// let any caller drive sustained write and WAL load against the primary DB.
// The rate limit keeps it usable for Railway health checks and operators while
// removing the amplification. Kept public rather than admin-gated so the
// platform health check needs no secret.
app.get("/health/deep", rateLimitByIp(6, 60_000), async (c) => {
  const start = Date.now();
  try {
    const db = getDb();
    // Test the write path on the transactions table (touches all indexes).
    // Uses solution_slug (not capability_id) to satisfy the XOR check constraint.
    //
    // WP7: this was ONE statement — `WITH probe AS (INSERT … RETURNING id)
    // DELETE … WHERE id IN (SELECT id FROM probe)` — commented "atomic, no data
    // left behind". That is false, and it is the generator of the audit-chain
    // incident. In a data-modifying CTE the DELETE runs against the statement's
    // snapshot, which predates the CTE's INSERT, so it matches nothing. Every
    // call to this public endpoint therefore leaked one permanent row: 200 in
    // August alone, 144 in May — and one of the May rows, hashed with a null
    // completed_at, captured the chain head and acquired 150,719 children.
    //
    // Two statements in one transaction: the DELETE now sees the INSERT.
    await db.transaction(async (tx) => {
      const inserted = (await tx.execute(sql`
        INSERT INTO transactions (solution_slug, status, input, price_cents, transparency_marker, data_jurisdiction, is_free_tier)
        VALUES ('_health_probe', 'health_probe', '{}', 0, 'algorithmic', 'EU', true)
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      const probeId = inserted[0]?.id;
      if (probeId) {
        await tx.execute(sql`DELETE FROM transactions WHERE id = ${probeId}`);
      }
    });
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
// Needs raw body for signature verification.
//
// WP0 §3 (CR-12): /webhooks sits outside the /v1, /a2a and /mcp bodyLimit
// scopes above, so before this cap an unauthenticated caller could POST an
// arbitrarily large body and the handler would buffer all of it via
// c.req.text() BEFORE the signature check rejected it. bodyLimit only bounds
// the stream — it does not consume or parse the body, so raw-body signature
// verification is unaffected (covered by webhook.body-limit.test.ts). 512 KB
// is far above any real Stripe event (checkout.session.completed is a few KB)
// while still bounding pre-auth memory.
app.use("/webhooks/*", bodyLimit({ maxSize: 512 * 1024 }));
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
app.route("/v1/web3-assurance", web3AssuranceRoute);
app.route("/v1/web3-assurance/methodology", web3AssuranceMethodologyRoute);
app.route("/v1/web3-assurance/source-quality", web3AssuranceSourceQualityRoute);
app.route("/v1/web3-assurance/bridge-config-index", web3AssuranceBridgeConfigIndexRoute);
app.route("/v1/web3-assurance/trust-index", web3AssuranceTrustIndexRoute);
// /v1/quality/:slug retired with the SQS engine (DEC-20260503-B).
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
  // trust/ — public trust projection consumed by the published strale-mcp
  // package. GET only, badge + already-public test facts, no admin fields.
  // See routes/public-trust.ts for what may and may not be projected here.
  /^\/v1\/public\/ops\/trust\/capabilities\/batch$/,
  /^\/v1\/public\/ops\/trust\/solutions\/batch$/,
  // limitations/ — public GETs (quality/ and trust/ retired with SQS engine)
  /^\/v1\/public\/ops\/limitations\/[^/]+$/,
  /^\/v1\/public\/ops\/limitations\/[^/]+\/[^/]+$/,
  // health-monitor/events, onboarding/readiness — anonymous reads today
  /^\/v1\/public\/ops\/events$/,
  /^\/v1\/public\/ops\/onboarding\/readiness$/,
];

app.use("/v1/public/ops/*", async (c, next) => {
  if (c.req.method !== "GET") return c.notFound();
  if (!PUBLIC_OPS_ALLOWLIST.some((re) => re.test(c.req.path))) return c.notFound();

  // Withdrawal guard. These routers are shared with /v1/internal/*, where an
  // operator must see withdrawn capabilities, so the filter belongs at the
  // boundary rather than in the handlers — the same reason the allowlist does.
  //
  // It guards the RESPONSE, not the queries. Four review rounds chased
  // "does this query filter visible" through ~90 reads of the capabilities
  // table; the fourth found four leaks no such grep could reach, because
  // health_monitor_events, test_suites, test_results and solution_steps all
  // carry capability_slug as a bare string and never join to capabilities at
  // all. Whatever a handler produces, and however it produced it, a withdrawn
  // slug does not cross this line — including from a route added later by
  // someone who never read this comment.
  const withdrawalSets = await withdrawnSlugs();
  if (withdrawalSets.withdrawn.size > 0) {
    const query = c.req.query();
    if (requestNamesWithdrawn(c.req.path, query, withdrawalSets)) {
      // 404 rather than a pruned body: a 200 with the fields blanked still
      // confirms the slug exists.
      return c.notFound();
    }
  }

  await next();

  if (withdrawalSets.withdrawn.size === 0) return;
  const res = c.res;
  if (!res || res.status !== 200) return;
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) return;
  try {
    const body = await res.clone().json();
    const pruned = pruneWithdrawn(body, withdrawalSets);
    c.res = new Response(JSON.stringify(pruned), {
      status: res.status,
      headers: res.headers,
    });
  } catch {
    // A body we cannot parse is a body we cannot vet. Refuse rather than
    // forward it — this surface is small and entirely JSON, so this is a bug
    // signal, not a routine path.
    c.res = new Response(JSON.stringify({ error: "not_available" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
});

// Mount the public-ops dashboards. Same routers as /v1/internal/* — the
// allowlist above, not the router, is the access boundary.
// /quality and /trust mounts retired with the SQS engine (DEC-20260503-B);
// internal-quality.ts and internal-trust.ts deleted.
app.route("/v1/public/ops/tests", internalTestsRoute);
app.route("/v1/public/ops/limitations", internalLimitationsRoute);
app.route("/v1/public/ops", internalHealthMonitorRoute);
app.route("/v1/public/ops/onboarding", internalOnboardingRoute);
// Public trust projection. Mounted under /v1/public/ops/* deliberately: the
// /v1/internal/trust routes it replaces were deleted with the SQS engine, and
// the adminOnly wall on /v1/internal/* turned requests for them into 401s, so
// every public strale-mcp install has started with zero trust data since
// 2026-05-05. The admin wall is unchanged; this carries only fields already
// public through /v1/public/ops/tests/*. See routes/public-trust.ts.
app.route("/v1/public/ops/trust", publicTrustRoute);

// F-0-003: admin-only wall. Any handler under /v1/internal/* now requires
// `Authorization: Bearer $ADMIN_SECRET` — enforced at the mount, not by
// each handler. The per-handler isValidAdminAuth checks inside the route
// files are kept as defence-in-depth but are no longer load-bearing.
app.use("/v1/internal/*", adminOnly);

// /v1/internal/quality and /v1/internal/trust retired with the SQS engine
// (DEC-20260503-B); the route files are deleted.
app.route("/v1/internal/tests", internalTestsRoute);
app.route("/v1/internal/limitations", internalLimitationsRoute);
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
  recordDiscoveryHit("/.well-known/x402.json", c.req, { src: c.req.query("src"), ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") });
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

