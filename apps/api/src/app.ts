import { Hono } from "hono";
import { logger } from "hono/logger";
import { versionMiddleware } from "./lib/versioning.js";
import { doRoute } from "./routes/do.js";
import { capabilitiesRoute } from "./routes/capabilities.js";
import { walletRoute } from "./routes/wallet.js";
import { transactionsRoute } from "./routes/transactions.js";
import { authRoute } from "./routes/auth.js";
import { webhookRoute } from "./routes/webhook.js";

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
// ─── Global company registries ──────────────────────────────────────────────
import "./capabilities/us-company-data.js";
import "./capabilities/canadian-company-data.js";
import "./capabilities/australian-company-data.js";
import "./capabilities/indian-company-data.js";
import "./capabilities/singapore-company-data.js";
import "./capabilities/hong-kong-company-data.js";
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

export const app = new Hono();

app.use("*", logger());
app.use("*", versionMiddleware());

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
