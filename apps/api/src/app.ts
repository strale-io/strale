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
import { startScheduledTests } from "./lib/test-runner.js";

// Register capability executors (side-effect imports)
import "./capabilities/vat-validate.js";
import "./capabilities/swedish-company-data.js";
import "./capabilities/invoice-extract.js";
import "./capabilities/web-extract.js";
import "./capabilities/annual-report-extract.js";
import "./capabilities/norwegian-company-data.js";
import "./capabilities/danish-company-data.js";
import "./capabilities/finnish-company-data.js";
import "./capabilities/iban-validate.js";
import "./capabilities/pii-redact.js";
import "./capabilities/pdf-extract.js";
import "./capabilities/company-enrich.js";
import "./capabilities/ted-procurement.js";
// ─── EU company registries ──────────────────────────────────────────────────
import "./capabilities/uk-company-data.js";
import "./capabilities/dutch-company-data.js";
import "./capabilities/german-company-data.js";
import "./capabilities/french-company-data.js";
import "./capabilities/belgian-company-data.js";
import "./capabilities/austrian-company-data.js";
import "./capabilities/irish-company-data.js";
import "./capabilities/polish-company-data.js";
import "./capabilities/estonian-company-data.js";
import "./capabilities/latvian-company-data.js";
import "./capabilities/lithuanian-company-data.js";
import "./capabilities/swiss-company-data.js";
import "./capabilities/spanish-company-data.js";
import "./capabilities/italian-company-data.js";
import "./capabilities/portuguese-company-data.js";
// ─── Validation / compliance utilities ──────────────────────────────────────
import "./capabilities/swift-validate.js";
import "./capabilities/lei-lookup.js";
import "./capabilities/eori-validate.js";
import "./capabilities/email-validate.js";
import "./capabilities/vat-format-validate.js";
import "./capabilities/isbn-validate.js";
import "./capabilities/company-id-detect.js";
import "./capabilities/invoice-validate.js";
import "./capabilities/payment-reference-generate.js";
import "./capabilities/swift-message-parse.js";
import "./capabilities/financial-year-dates.js";
import "./capabilities/sepa-xml-validate.js";
// ─── Global company registries ──────────────────────────────────────────────
import "./capabilities/us-company-data.js";
import "./capabilities/canadian-company-data.js";
import "./capabilities/australian-company-data.js";
// indian-company-data, singapore-company-data, hong-kong-company-data: deactivated (no viable data source)
import "./capabilities/brazilian-company-data.js";
import "./capabilities/japanese-company-data.js";
// ─── Financial & credit ─────────────────────────────────────────────────────
import "./capabilities/exchange-rate.js";
import "./capabilities/stock-quote.js";
import "./capabilities/credit-report-summary.js";
// ─── Domain & web intelligence ──────────────────────────────────────────────
import "./capabilities/dns-lookup.js";
import "./capabilities/whois-lookup.js";
import "./capabilities/ssl-check.js";
import "./capabilities/tech-stack-detect.js";
// ─── Regulatory & trade ─────────────────────────────────────────────────────
import "./capabilities/sanctions-check.js";
import "./capabilities/hs-code-lookup.js";
import "./capabilities/eu-regulation-search.js";
// ─── Text & language ────────────────────────────────────────────────────────
import "./capabilities/translate.js";
import "./capabilities/summarize.js";
import "./capabilities/sentiment-analyze.js";
import "./capabilities/classify-text.js";
// ─── Data format utilities ──────────────────────────────────────────────────
import "./capabilities/json-to-csv.js";
import "./capabilities/currency-convert.js";
import "./capabilities/address-parse.js";
// ─── Web / scraping ─────────────────────────────────────────────────────────
import "./capabilities/screenshot-url.js";
import "./capabilities/url-to-markdown.js";
import "./capabilities/url-to-text.js";
import "./capabilities/link-extract.js";
import "./capabilities/structured-scrape.js";
import "./capabilities/google-search.js";
import "./capabilities/meta-extract.js";
// ─── Data cleanup / normalization ───────────────────────────────────────────
import "./capabilities/name-parse.js";
import "./capabilities/phone-normalize.js";
import "./capabilities/date-parse.js";
import "./capabilities/unit-convert.js";
import "./capabilities/csv-clean.js";
import "./capabilities/deduplicate.js";
import "./capabilities/json-repair.js";
// ─── File format conversion ─────────────────────────────────────────────────
import "./capabilities/html-to-pdf.js";
import "./capabilities/markdown-to-html.js";
import "./capabilities/image-to-text.js";
import "./capabilities/image-resize.js";
import "./capabilities/base64-encode-url.js";
// ─── Validation / testing ───────────────────────────────────────────────────
import "./capabilities/json-schema-validate.js";
import "./capabilities/url-health-check.js";
import "./capabilities/regex-generate.js";
import "./capabilities/cron-explain.js";
import "./capabilities/diff-json.js";
import "./capabilities/api-health-check.js";
// ─── Competitive intelligence ─────────────────────────────────────────────────
import "./capabilities/landing-page-roast.js";
import "./capabilities/seo-audit.js";
import "./capabilities/competitor-compare.js";
import "./capabilities/pricing-page-extract.js";
import "./capabilities/company-tech-stack.js";
// ─── Content & writing ────────────────────────────────────────────────────────
import "./capabilities/blog-post-outline.js";
import "./capabilities/email-draft.js";
import "./capabilities/social-post-generate.js";
// ─── Agent tooling ────────────────────────────────────────────────────────────
import "./capabilities/llm-output-validate.js";
import "./capabilities/prompt-optimize.js";
import "./capabilities/code-review.js";
// ─── Document extraction ──────────────────────────────────────────────────────
import "./capabilities/resume-parse.js";
import "./capabilities/contract-extract.js";
import "./capabilities/receipt-categorize.js";
import "./capabilities/meeting-notes-extract.js";
// ─── Utilities ────────────────────────────────────────────────────────────────
import "./capabilities/timezone-meeting-find.js";
import "./capabilities/startup-domain-check.js";
import "./capabilities/youtube-summarize.js";
// ─── Show-off ─────────────────────────────────────────────────────────────────
import "./capabilities/github-repo-analyze.js";
import "./capabilities/job-posting-analyze.js";
// ─── Replacements ─────────────────────────────────────────────────────────────
import "./capabilities/brand-mention-search.js";
import "./capabilities/accessibility-audit.js";
import "./capabilities/changelog-generate.js";
import "./capabilities/api-docs-generate.js";
import "./capabilities/dependency-audit.js";
// ─── Agent debugging ─────────────────────────────────────────────────────────
import "./capabilities/agent-trace-analyze.js";
import "./capabilities/token-count.js";
import "./capabilities/tool-call-validate.js";
// ─── Cost optimization ───────────────────────────────────────────────────────
import "./capabilities/llm-cost-calculate.js";
import "./capabilities/prompt-compress.js";
import "./capabilities/context-window-optimize.js";
// ─── Data pipeline ───────────────────────────────────────────────────────────
import "./capabilities/schema-infer.js";
import "./capabilities/data-quality-check.js";
import "./capabilities/csv-to-json.js";
import "./capabilities/xml-to-json.js";
import "./capabilities/flatten-json.js";
// ─── Test data & mocking ────────────────────────────────────────────────────
import "./capabilities/fake-data-generate.js";
import "./capabilities/api-mock-response.js";
import "./capabilities/test-case-generate.js";
// ─── Security ────────────────────────────────────────────────────────────────
import "./capabilities/secret-scan.js";
import "./capabilities/header-security-check.js";
import "./capabilities/password-strength.js";
import "./capabilities/cve-lookup.js";
// ─── DevOps config generation ────────────────────────────────────────────────
import "./capabilities/dockerfile-generate.js";
import "./capabilities/gitignore-generate.js";
import "./capabilities/env-template-generate.js";
import "./capabilities/nginx-config-generate.js";
import "./capabilities/github-actions-generate.js";
// ─── Database & SQL ─────────────────────────────────────────────────────────
import "./capabilities/sql-generate.js";
import "./capabilities/sql-explain.js";
import "./capabilities/sql-optimize.js";
import "./capabilities/schema-migration-generate.js";
// ─── API development workflow ───────────────────────────────────────────────
import "./capabilities/openapi-validate.js";
import "./capabilities/openapi-generate.js";
import "./capabilities/http-to-curl.js";
import "./capabilities/curl-to-code.js";
import "./capabilities/jwt-decode.js";
import "./capabilities/webhook-test-payload.js";
// ─── Code transformation ────────────────────────────────────────────────────
import "./capabilities/json-to-typescript.js";
import "./capabilities/json-to-zod.js";
import "./capabilities/json-to-pydantic.js";
import "./capabilities/regex-explain.js";
import "./capabilities/code-convert.js";
// ─── Git & version control ──────────────────────────────────────────────────
import "./capabilities/commit-message-generate.js";
import "./capabilities/pr-description-generate.js";
import "./capabilities/release-notes-generate.js";
// ─── Documentation ──────────────────────────────────────────────────────────
import "./capabilities/readme-generate.js";
import "./capabilities/jsdoc-generate.js";
import "./capabilities/docstring-generate.js";
// ─── Monitoring & observability ─────────────────────────────────────────────
import "./capabilities/log-parse.js";
import "./capabilities/error-explain.js";
import "./capabilities/uptime-check.js";
import "./capabilities/crontab-generate.js";
// ─── Government & public records ────────────────────────────────────────────
import "./capabilities/uk-companies-house-officers.js";
import "./capabilities/eu-trademark-search.js";
import "./capabilities/patent-search.js";
import "./capabilities/charity-lookup-uk.js";
import "./capabilities/food-safety-rating-uk.js";
// ─── Real-time data feeds ───────────────────────────────────────────────────
import "./capabilities/weather-lookup.js";
import "./capabilities/ip-geolocation.js";
import "./capabilities/shipping-track.js";
import "./capabilities/flight-status.js";
import "./capabilities/crypto-price.js";
// ─── Network & infrastructure ───────────────────────────────────────────────
import "./capabilities/port-check.js";
import "./capabilities/mx-lookup.js";
import "./capabilities/redirect-trace.js";
import "./capabilities/robots-txt-parse.js";
import "./capabilities/sitemap-parse.js";
// ─── Social & professional data ─────────────────────────────────────────────
import "./capabilities/github-user-profile.js";
import "./capabilities/npm-package-info.js";
import "./capabilities/pypi-package-info.js";
import "./capabilities/docker-hub-info.js";
import "./capabilities/github-repo-compare.js";
// ─── Compliance & business verification ─────────────────────────────────────
import "./capabilities/gdpr-website-check.js";
import "./capabilities/ssl-certificate-chain.js";
import "./capabilities/domain-reputation.js";
// ─── E-commerce & product data ──────────────────────────────────────────────
import "./capabilities/barcode-lookup.js";
// amazon-price: deactivated (Amazon CAPTCHA blocks datacenter IPs)
// ─── Finance / fintech ───────────────────────────────────────────────────────
import "./capabilities/bank-bic-lookup.js";
import "./capabilities/ecb-interest-rates.js";
import "./capabilities/country-tax-rates.js";
import "./capabilities/ticker-lookup.js";
import "./capabilities/forex-history.js";
// ─── Legal / compliance ──────────────────────────────────────────────────────
import "./capabilities/eu-court-case-search.js";
import "./capabilities/gdpr-fine-lookup.js";
import "./capabilities/eu-ai-act-classify.js";
import "./capabilities/data-protection-authority-lookup.js";
import "./capabilities/cookie-scan.js";
import "./capabilities/terms-of-service-extract.js";
import "./capabilities/privacy-policy-analyze.js";
import "./capabilities/business-license-check-se.js";
// ─── Logistics / supply chain ────────────────────────────────────────────────
import "./capabilities/customs-duty-lookup.js";
import "./capabilities/incoterms-explain.js";
import "./capabilities/container-track.js";
import "./capabilities/port-lookup.js";
import "./capabilities/country-trade-data.js";
import "./capabilities/iso-country-lookup.js";
import "./capabilities/dangerous-goods-classify.js";
// ─── Recruiting / HR ─────────────────────────────────────────────────────────
import "./capabilities/salary-benchmark.js";
import "./capabilities/job-board-search.js";
import "./capabilities/skill-extract.js";
import "./capabilities/skill-gap-analyze.js";
import "./capabilities/linkedin-url-validate.js";
import "./capabilities/work-permit-requirements.js";
import "./capabilities/employer-review-summary.js";
import "./capabilities/public-holiday-lookup.js";
import "./capabilities/employment-cost-estimate.js";
// ─── E-commerce / retail ─────────────────────────────────────────────────────
import "./capabilities/product-search.js";
import "./capabilities/price-compare.js";
import "./capabilities/product-reviews-extract.js";
import "./capabilities/trustpilot-score.js";
import "./capabilities/vat-rate-lookup.js";
import "./capabilities/shipping-cost-estimate.js";
import "./capabilities/marketplace-fee-calculate.js";
import "./capabilities/return-policy-extract.js";
// ─── Marketing / SEO ─────────────────────────────────────────────────────────
import "./capabilities/keyword-suggest.js";
import "./capabilities/serp-analyze.js";
import "./capabilities/backlink-check.js";
import "./capabilities/page-speed-test.js";
import "./capabilities/social-profile-check.js";
import "./capabilities/og-image-check.js";
import "./capabilities/email-deliverability-check.js";
import "./capabilities/website-carbon-estimate.js";
// Dark launch batch 1 — compliance, contact verification, financial utilities
import "./capabilities/pep-check.js";
import "./capabilities/adverse-media-check.js";
import "./capabilities/beneficial-ownership-lookup.js";
import "./capabilities/aml-risk-score.js";
import "./capabilities/address-validate.js";
import "./capabilities/address-geocode.js";
import "./capabilities/phone-validate.js";
import "./capabilities/phone-type-detect.js";
import "./capabilities/holiday-calendar.js";
import "./capabilities/business-day-check.js";
import "./capabilities/timezone-lookup.js";
import "./capabilities/insolvency-check.js";
import "./capabilities/language-detect.js";
import "./capabilities/age-verify.js";

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

// Public read-only endpoints — open CORS (data is intentionally public)
app.use("/v1/capabilities/*", publicCors);
app.use("/v1/capabilities", publicCors);
app.use("/v1/solutions/*", publicCors);
app.use("/v1/solutions", publicCors);
app.use("/v1/internal/*", publicCors);
app.use("/v1/internal/*", rateLimitByIp(120, 60_000));  // S-7: rate limit public internal endpoints
app.use("/v1/audit/*", publicCors);
app.use("/.well-known/*", publicCors);

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
app.route("/v1/audit", auditRoute);

// Start scheduled test runner (every 6 hours)
startScheduledTests();

// Pre-warm the suggest catalog (called after env is loaded, see index.ts)
export { warmCatalog } from "./lib/suggest.js";

// MCP Streamable HTTP transport (remote MCP access)
app.route("/mcp", mcpRoute);

// A2A protocol — Agent Card discovery + JSON-RPC task endpoint
app.route("/.well-known/agent-card.json", agentCardRoute);
app.route("/.well-known/agent.json", agentCardRoute); // alias
app.route("/agent.json", agentCardRoute); // convenience alias
app.route("/a2a", a2aRoute);

