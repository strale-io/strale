import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { eq } from "drizzle-orm";

const updates: [string, number][] = [
  // Nordic registries (API-based)
  ["norwegian-company-data", 3000],
  ["danish-company-data", 3000],
  ["finnish-company-data", 3000],
  // API-based capabilities
  ["iban-validate", 50],
  ["pii-redact", 3000],
  ["pdf-extract", 5000],
  ["company-enrich", 15000],
  ["ted-procurement", 5000],
  // EU registries — API-based (fast)
  ["french-company-data", 2000],
  ["polish-company-data", 3000],
  ["estonian-company-data", 2000],
  ["uk-company-data", 2000],
  // EU registries — Browserless-based (slower)
  ["dutch-company-data", 8000],
  ["german-company-data", 8000],
  ["belgian-company-data", 8000],
  ["austrian-company-data", 8000],
  ["irish-company-data", 8000],
  ["latvian-company-data", 8000],
  ["lithuanian-company-data", 8000],
  ["swiss-company-data", 8000],
  ["spanish-company-data", 8000],
  ["italian-company-data", 8000],
  ["portuguese-company-data", 8000],
  // Validation utilities (fast algorithmic)
  ["swift-validate", 20],
  ["lei-lookup", 2000],
  ["eori-validate", 3000],
  ["email-validate", 500],
  ["vat-format-validate", 10],
  ["isbn-validate", 10],
  ["company-id-detect", 10],
  // ─── Global company registries ──────────────────────────────────────────────
  ["us-company-data", 2000],
  ["canadian-company-data", 8000],
  ["australian-company-data", 8000],
  ["indian-company-data", 8000],
  ["singapore-company-data", 8000],
  ["hong-kong-company-data", 8000],
  ["brazilian-company-data", 2000],
  ["japanese-company-data", 8000],
  // ─── Financial & credit ─────────────────────────────────────────────────────
  ["exchange-rate", 500],
  ["stock-quote", 500],
  ["credit-report-summary", 12000],
  // ─── Domain & web intelligence ──────────────────────────────────────────────
  ["dns-lookup", 100],
  ["whois-lookup", 500],
  ["ssl-check", 200],
  ["tech-stack-detect", 10000],
  // ─── Regulatory & trade ─────────────────────────────────────────────────────
  ["sanctions-check", 3000],
  ["hs-code-lookup", 3000],
  ["eu-regulation-search", 10000],
  // ─── Text & language ────────────────────────────────────────────────────────
  ["translate", 2000],
  ["summarize", 2000],
  ["sentiment-analyze", 2000],
  ["classify-text", 2000],
  // ─── Data format utilities ──────────────────────────────────────────────────
  ["json-to-csv", 20],
  ["currency-convert", 500],
  ["address-parse", 2000],
  // ─── Web/scraping capabilities ──────────────────────────────────────────────
  ["screenshot-url", 3000],
  ["url-to-markdown", 3000],
  ["url-to-text", 200],
  ["link-extract", 200],
  ["structured-scrape", 8000],
  ["google-search", 8000],
  ["meta-extract", 200],
  // ─── Data cleanup/normalization ─────────────────────────────────────────────
  ["name-parse", 20],
  ["phone-normalize", 20],
  ["date-parse", 20],
  ["unit-convert", 20],
  ["csv-clean", 50],
  ["deduplicate", 50],
  ["json-repair", 20],
  // ─── File format conversion ─────────────────────────────────────────────────
  ["html-to-pdf", 2000],
  ["markdown-to-html", 20],
  ["image-to-text", 3000],
  ["image-resize", 500],
  ["base64-encode-url", 1000],
  // ─── Validation/testing ─────────────────────────────────────────────────────
  ["json-schema-validate", 20],
  ["url-health-check", 200],
  ["regex-generate", 2000],
  ["cron-explain", 30],
  ["diff-json", 20],
  ["api-health-check", 200],
  // ─── Competitive intelligence ───────────────────────────────────────────────
  ["landing-page-roast", 8000],
  ["seo-audit", 5000],
  ["competitor-compare", 15000],
  ["pricing-page-extract", 5000],
  ["company-tech-stack", 5000],
  // ─── Content & writing ──────────────────────────────────────────────────────
  ["blog-post-outline", 2000],
  ["email-draft", 2000],
  ["social-post-generate", 2000],
  // ─── Agent tooling ──────────────────────────────────────────────────────────
  ["llm-output-validate", 20],
  ["prompt-optimize", 2000],
  ["code-review", 2000],
  // ─── Document extraction ────────────────────────────────────────────────────
  ["resume-parse", 5000],
  ["contract-extract", 5000],
  ["receipt-categorize", 3000],
  ["meeting-notes-extract", 3000],
  // ─── Utilities ──────────────────────────────────────────────────────────────
  ["timezone-meeting-find", 20],
  ["startup-domain-check", 5000],
  ["youtube-summarize", 8000],
  // ─── Show-off ───────────────────────────────────────────────────────────────
  ["github-repo-analyze", 8000],
  ["job-posting-analyze", 3000],
  // ─── Replacements ───────────────────────────────────────────────────────────
  ["brand-mention-search", 8000],
  ["accessibility-audit", 5000],
  ["changelog-generate", 2000],
  ["api-docs-generate", 3000],
  ["dependency-audit", 8000],
  // ─── Agent debugging ──────────────────────────────────────────────────────────
  ["agent-trace-analyze", 3000],
  ["token-count", 20],
  ["tool-call-validate", 20],
  // ─── Cost optimization ────────────────────────────────────────────────────────
  ["llm-cost-calculate", 20],
  ["prompt-compress", 3000],
  ["context-window-optimize", 3000],
  // ─── Data pipeline ────────────────────────────────────────────────────────────
  ["schema-infer", 30],
  ["data-quality-check", 30],
  ["csv-to-json", 20],
  ["xml-to-json", 20],
  ["flatten-json", 10],
  // ─── Test data & mocking ──────────────────────────────────────────────────────
  ["fake-data-generate", 3000],
  ["api-mock-response", 2000],
  ["test-case-generate", 3000],
  // ─── Security ─────────────────────────────────────────────────────────────────
  ["secret-scan", 20],
  ["header-security-check", 500],
  ["password-strength", 10],
  ["cve-lookup", 2000],
  // ─── DevOps config generation ─────────────────────────────────────────────────
  ["dockerfile-generate", 3000],
  ["gitignore-generate", 20],
  ["env-template-generate", 3000],
  ["nginx-config-generate", 3000],
  ["github-actions-generate", 3000],
  // ─── Database & SQL ───────────────────────────────────────────────────────────
  ["sql-generate", 3000],
  ["sql-explain", 3000],
  ["sql-optimize", 3000],
  ["schema-migration-generate", 3000],
  // ─── API development workflow ─────────────────────────────────────────────────
  ["openapi-validate", 30],
  ["openapi-generate", 3000],
  ["http-to-curl", 10],
  ["curl-to-code", 3000],
  ["jwt-decode", 10],
  ["webhook-test-payload", 3000],
  // ─── Code transformation ──────────────────────────────────────────────────────
  ["json-to-typescript", 10],
  ["json-to-zod", 10],
  ["json-to-pydantic", 10],
  ["regex-explain", 2000],
  ["code-convert", 3000],
  // ─── Git & version control ────────────────────────────────────────────────────
  ["commit-message-generate", 2000],
  ["pr-description-generate", 2000],
  ["release-notes-generate", 3000],
  // ─── Documentation ────────────────────────────────────────────────────────────
  ["readme-generate", 3000],
  ["jsdoc-generate", 3000],
  ["docstring-generate", 3000],
  // ─── Monitoring & observability ───────────────────────────────────────────────
  ["log-parse", 20],
  ["error-explain", 2000],
  ["uptime-check", 3000],
  ["crontab-generate", 2000],
  // ─── Government & public records ──────────────────────────────────────────────
  ["uk-companies-house-officers", 3000],
  ["eu-trademark-search", 12000],
  ["patent-search", 3000],
  ["charity-lookup-uk", 2000],
  ["food-safety-rating-uk", 2000],
  // ─── Real-time data feeds ─────────────────────────────────────────────────────
  ["weather-lookup", 1000],
  ["ip-geolocation", 500],
  ["shipping-track", 10],
  ["flight-status", 2000],
  ["crypto-price", 2000],
  // ─── Network & infrastructure ─────────────────────────────────────────────────
  ["port-check", 5000],
  ["mx-lookup", 500],
  ["redirect-trace", 3000],
  ["robots-txt-parse", 1000],
  ["sitemap-parse", 2000],
  // ─── Social & professional data ───────────────────────────────────────────────
  ["github-user-profile", 1000],
  ["npm-package-info", 1000],
  ["pypi-package-info", 1000],
  ["docker-hub-info", 1000],
  ["github-repo-compare", 2000],
  // ─── Compliance & business verification ───────────────────────────────────────
  ["gdpr-website-check", 5000],
  ["ssl-certificate-chain", 2000],
  ["domain-reputation", 3000],
  // ─── E-commerce & product data ────────────────────────────────────────────────
  ["barcode-lookup", 2000],
  ["amazon-price", 12000],
];

const db = getDb();
for (const [slug, ms] of updates) {
  await db
    .update(capabilities)
    .set({ avgLatencyMs: ms })
    .where(eq(capabilities.slug, slug));
  console.log(`  ${slug} -> ${ms}ms ${ms > 10000 ? "(async)" : "(sync)"}`);
}

console.log("Done.");
process.exit(0);
