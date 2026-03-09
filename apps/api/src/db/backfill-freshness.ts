import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { eq } from "drizzle-orm";

// Freshness classification taxonomy:
// live-fetch    — executor calls external API/service/website on every invocation (data is real-time)
// reference-data — uses bundled/static dataset with a known update cycle (e.g., IBAN rules, country codes)
// computed      — pure computation on user input, no external data dependency

type FreshnessEntry = {
  freshnessCategory: "live-fetch" | "reference-data" | "computed";
  dataUpdateCycleDays?: number; // only for reference-data
};

const FRESHNESS_MAP: Record<string, FreshnessEntry> = {
  // ══════════════════════════════════════════════════════════════════════════
  // LIVE-FETCH — external API, Browserless, Claude API, DNS/net, fetch()
  // ══════════════════════════════════════════════════════════════════════════

  // ── Company data (registry APIs / Browserless scraping) ────────────────
  "swedish-company-data": { freshnessCategory: "live-fetch" },
  "norwegian-company-data": { freshnessCategory: "live-fetch" },
  "danish-company-data": { freshnessCategory: "live-fetch" },
  "finnish-company-data": { freshnessCategory: "live-fetch" },
  "us-company-data": { freshnessCategory: "live-fetch" },
  "uk-company-data": { freshnessCategory: "live-fetch" },
  "dutch-company-data": { freshnessCategory: "live-fetch" },
  "german-company-data": { freshnessCategory: "live-fetch" },
  "french-company-data": { freshnessCategory: "live-fetch" },
  "belgian-company-data": { freshnessCategory: "live-fetch" },
  "austrian-company-data": { freshnessCategory: "live-fetch" },
  "irish-company-data": { freshnessCategory: "live-fetch" },
  "spanish-company-data": { freshnessCategory: "live-fetch" },
  "italian-company-data": { freshnessCategory: "live-fetch" },
  "portuguese-company-data": { freshnessCategory: "live-fetch" },
  "polish-company-data": { freshnessCategory: "live-fetch" },
  "estonian-company-data": { freshnessCategory: "live-fetch" },
  "latvian-company-data": { freshnessCategory: "live-fetch" },
  "lithuanian-company-data": { freshnessCategory: "live-fetch" },
  "swiss-company-data": { freshnessCategory: "live-fetch" },
  "hong-kong-company-data": { freshnessCategory: "live-fetch" },
  "singapore-company-data": { freshnessCategory: "live-fetch" },
  "japanese-company-data": { freshnessCategory: "live-fetch" },
  "indian-company-data": { freshnessCategory: "live-fetch" },
  "australian-company-data": { freshnessCategory: "live-fetch" },
  "canadian-company-data": { freshnessCategory: "live-fetch" },
  "brazilian-company-data": { freshnessCategory: "live-fetch" },
  "uk-companies-house-officers": { freshnessCategory: "live-fetch" },

  // ── Compliance / regulatory (external APIs) ───────────────────────────
  "vat-validate": { freshnessCategory: "live-fetch" }, // VIES API
  "lei-lookup": { freshnessCategory: "live-fetch" }, // GLEIF API
  "eori-validate": { freshnessCategory: "live-fetch" }, // EU Customs API
  "sanctions-check": { freshnessCategory: "live-fetch" }, // sanctions lists
  "eu-court-case-search": { freshnessCategory: "live-fetch" }, // CURIA
  "eu-regulation-search": { freshnessCategory: "live-fetch" }, // EUR-Lex
  "eu-trademark-search": { freshnessCategory: "live-fetch" }, // EUIPO
  "ted-procurement": { freshnessCategory: "live-fetch" }, // TED API
  "gdpr-fine-lookup": { freshnessCategory: "live-fetch" }, // enforcementtracker
  "data-protection-authority-lookup": { freshnessCategory: "live-fetch" },
  "patent-search": { freshnessCategory: "live-fetch" }, // Google Patents via Browserless
  "business-license-check-se": { freshnessCategory: "live-fetch" },

  // ── Finance / banking (external APIs) ─────────────────────────────────
  "exchange-rate": { freshnessCategory: "live-fetch" }, // ECB/Frankfurter
  "ecb-interest-rates": { freshnessCategory: "live-fetch" }, // ECB SDW
  "forex-history": { freshnessCategory: "live-fetch" }, // Frankfurter
  "crypto-price": { freshnessCategory: "live-fetch" }, // CoinGecko
  "stock-quote": { freshnessCategory: "live-fetch" },
  "ticker-lookup": { freshnessCategory: "live-fetch" }, // Yahoo Finance
  "credit-report-summary": { freshnessCategory: "live-fetch" },
  "customs-duty-lookup": { freshnessCategory: "live-fetch" }, // TARIC

  // ── Web infrastructure (DNS, SSL, HTTP, fetch) ────────────────────────
  "dns-lookup": { freshnessCategory: "live-fetch" }, // DNS protocol
  "mx-lookup": { freshnessCategory: "live-fetch" }, // DNS module
  "ssl-certificate-chain": { freshnessCategory: "live-fetch" }, // TLS module
  "ssl-check": { freshnessCategory: "live-fetch" },
  "header-security-check": { freshnessCategory: "live-fetch" }, // fetch()
  "redirect-trace": { freshnessCategory: "live-fetch" }, // fetch()
  "port-check": { freshnessCategory: "live-fetch" }, // net.Socket
  "whois-lookup": { freshnessCategory: "live-fetch" },
  "domain-reputation": { freshnessCategory: "live-fetch" },
  "uptime-check": { freshnessCategory: "live-fetch" },
  "url-health-check": { freshnessCategory: "live-fetch" },
  "robots-txt-parse": { freshnessCategory: "live-fetch" }, // fetches robots.txt
  "sitemap-parse": { freshnessCategory: "live-fetch" }, // fetches sitemap
  "email-deliverability-check": { freshnessCategory: "live-fetch" },

  // ── Web scraping / content extraction (Browserless / fetch) ───────────
  "url-to-markdown": { freshnessCategory: "live-fetch" },
  "url-to-text": { freshnessCategory: "live-fetch" },
  "structured-scrape": { freshnessCategory: "live-fetch" },
  "screenshot-url": { freshnessCategory: "live-fetch" },
  "web-extract": { freshnessCategory: "live-fetch" },
  "meta-extract": { freshnessCategory: "live-fetch" },
  "link-extract": { freshnessCategory: "live-fetch" },
  "og-image-check": { freshnessCategory: "live-fetch" },
  "tech-stack-detect": { freshnessCategory: "live-fetch" },
  "company-tech-stack": { freshnessCategory: "live-fetch" },
  "cookie-scan": { freshnessCategory: "live-fetch" },
  "gdpr-website-check": { freshnessCategory: "live-fetch" },
  "privacy-policy-analyze": { freshnessCategory: "live-fetch" },
  "terms-of-service-extract": { freshnessCategory: "live-fetch" },
  "pricing-page-extract": { freshnessCategory: "live-fetch" },
  "product-search": { freshnessCategory: "live-fetch" },
  "product-reviews-extract": { freshnessCategory: "live-fetch" },
  "price-compare": { freshnessCategory: "live-fetch" },
  "trustpilot-score": { freshnessCategory: "live-fetch" },
  "return-policy-extract": { freshnessCategory: "live-fetch" },
  "employer-review-summary": { freshnessCategory: "live-fetch" },
  "salary-benchmark": { freshnessCategory: "live-fetch" },
  "accessibility-audit": { freshnessCategory: "live-fetch" },
  "seo-audit": { freshnessCategory: "live-fetch" },
  "page-speed-test": { freshnessCategory: "live-fetch" }, // Google PageSpeed
  "website-carbon-estimate": { freshnessCategory: "live-fetch" },
  "landing-page-roast": { freshnessCategory: "live-fetch" },
  "startup-domain-check": { freshnessCategory: "live-fetch" },
  "amazon-price": { freshnessCategory: "live-fetch" },
  "container-track": { freshnessCategory: "live-fetch" },

  // ── External API lookups ──────────────────────────────────────────────
  "ip-geolocation": { freshnessCategory: "live-fetch" }, // ip-api.com
  "weather-lookup": { freshnessCategory: "live-fetch" }, // Open-Meteo
  "cve-lookup": { freshnessCategory: "live-fetch" }, // OSV API
  "npm-package-info": { freshnessCategory: "live-fetch" }, // npm registry
  "pypi-package-info": { freshnessCategory: "live-fetch" }, // PyPI
  "docker-hub-info": { freshnessCategory: "live-fetch" }, // Docker Hub
  "github-user-profile": { freshnessCategory: "live-fetch" }, // GitHub API
  "github-repo-analyze": { freshnessCategory: "live-fetch" },
  "github-repo-compare": { freshnessCategory: "live-fetch" },
  "barcode-lookup": { freshnessCategory: "live-fetch" }, // Open Food Facts
  "charity-lookup-uk": { freshnessCategory: "live-fetch" }, // Charity Commission
  "food-safety-rating-uk": { freshnessCategory: "live-fetch" }, // FSA
  "public-holiday-lookup": { freshnessCategory: "live-fetch" }, // Nager.Date
  "flight-status": { freshnessCategory: "live-fetch" }, // AviationStack
  "google-search": { freshnessCategory: "live-fetch" }, // Serper.dev
  "brand-mention-search": { freshnessCategory: "live-fetch" }, // Serper.dev
  "keyword-suggest": { freshnessCategory: "live-fetch" }, // Google Autocomplete
  "backlink-check": { freshnessCategory: "live-fetch" }, // CommonCrawl
  "job-board-search": { freshnessCategory: "live-fetch" }, // Arbetsformedlingen/Adzuna
  "social-profile-check": { freshnessCategory: "live-fetch" },
  "serp-analyze": { freshnessCategory: "live-fetch" },
  "webhook-test-payload": { freshnessCategory: "live-fetch" },
  "api-health-check": { freshnessCategory: "live-fetch" },
  "dependency-audit": { freshnessCategory: "live-fetch" }, // npm audit
  "shipping-track": { freshnessCategory: "live-fetch" },
  "shipping-cost-estimate": { freshnessCategory: "live-fetch" },

  // ── Claude API (AI-powered extraction/analysis) ───────────────────────
  "invoice-extract": { freshnessCategory: "live-fetch" }, // Claude API
  "pdf-extract": { freshnessCategory: "live-fetch" },
  "annual-report-extract": { freshnessCategory: "live-fetch" },
  "company-enrich": { freshnessCategory: "live-fetch" },
  "pii-redact": { freshnessCategory: "live-fetch" },
  "image-to-text": { freshnessCategory: "live-fetch" },
  "contract-extract": { freshnessCategory: "live-fetch" },
  "meeting-notes-extract": { freshnessCategory: "live-fetch" },
  "resume-parse": { freshnessCategory: "live-fetch" },
  "receipt-categorize": { freshnessCategory: "live-fetch" },
  "youtube-summarize": { freshnessCategory: "live-fetch" },
  "competitor-compare": { freshnessCategory: "live-fetch" },
  "job-posting-analyze": { freshnessCategory: "live-fetch" },
  "linkedin-url-validate": { freshnessCategory: "live-fetch" },

  // ══════════════════════════════════════════════════════════════════════════
  // REFERENCE-DATA — bundled/static datasets with known update cycles
  // ══════════════════════════════════════════════════════════════════════════

  "iban-validate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // IBAN structure rarely changes
  },
  "swift-validate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 90, // SWIFT codes update quarterly
  },
  "bank-bic-lookup": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 90,
  },
  "iso-country-lookup": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // ISO 3166 rarely changes
  },
  "vat-format-validate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // VAT format rules rarely change
  },
  "vat-rate-lookup": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 90, // VAT rates change ~quarterly
  },
  "country-tax-rates": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 90,
  },
  "country-trade-data": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365,
  },
  "isbn-validate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365,
  },
  "port-lookup": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // IANA port assignments
  },
  "incoterms-explain": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 3650, // Incoterms 2020, next revision ~2030
  },
  "dangerous-goods-classify": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 730, // UN classifications, updated every 2 years
  },
  "hs-code-lookup": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // Harmonized System codes
  },
  "work-permit-requirements": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 180, // immigration rules change ~semi-annually
  },
  "employment-cost-estimate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // labor cost benchmarks
  },
  "marketplace-fee-calculate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 90, // marketplace fee schedules
  },
  "currency-convert": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 1, // rates bundled but updated daily
  },
  "llm-cost-calculate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 30, // LLM pricing changes monthly
  },
  "company-id-detect": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // ID format patterns rarely change
  },
  "financial-year-dates": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365,
  },
  "sepa-xml-validate": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // SEPA schema rarely changes
  },
  "swift-message-parse": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365,
  },
  "password-strength": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 365, // password rules/dictionaries
  },
  "timezone-meeting-find": {
    freshnessCategory: "reference-data",
    dataUpdateCycleDays: 180, // timezone rules change semi-annually
  },

  // ══════════════════════════════════════════════════════════════════════════
  // COMPUTED — pure computation on user input, no external data
  // ══════════════════════════════════════════════════════════════════════════

  // ── Text processing ───────────────────────────────────────────────────
  "json-repair": { freshnessCategory: "computed" },
  "email-validate": { freshnessCategory: "computed" }, // regex/format check only
  "classify-text": { freshnessCategory: "computed" },
  "sentiment-analyze": { freshnessCategory: "computed" },
  "summarize": { freshnessCategory: "computed" },
  "translate": { freshnessCategory: "computed" },
  "name-parse": { freshnessCategory: "computed" },
  "address-parse": { freshnessCategory: "computed" },
  "date-parse": { freshnessCategory: "computed" },
  "phone-normalize": { freshnessCategory: "computed" },
  "skill-extract": { freshnessCategory: "computed" },
  "skill-gap-analyze": { freshnessCategory: "computed" },
  "deduplicate": { freshnessCategory: "computed" },
  "data-quality-check": { freshnessCategory: "computed" },
  "log-parse": { freshnessCategory: "computed" },
  "token-count": { freshnessCategory: "computed" },

  // ── Data conversion ───────────────────────────────────────────────────
  "csv-to-json": { freshnessCategory: "computed" },
  "json-to-csv": { freshnessCategory: "computed" },
  "xml-to-json": { freshnessCategory: "computed" },
  "markdown-to-html": { freshnessCategory: "computed" },
  "csv-clean": { freshnessCategory: "computed" },
  "flatten-json": { freshnessCategory: "computed" },
  "diff-json": { freshnessCategory: "computed" },
  "unit-convert": { freshnessCategory: "computed" },
  "base64-encode-url": { freshnessCategory: "computed" },
  "html-to-pdf": { freshnessCategory: "computed" },
  "image-resize": { freshnessCategory: "computed" },
  "http-to-curl": { freshnessCategory: "computed" },

  // ── Code generation / analysis ────────────────────────────────────────
  "json-to-typescript": { freshnessCategory: "computed" },
  "json-to-zod": { freshnessCategory: "computed" },
  "json-to-pydantic": { freshnessCategory: "computed" },
  "json-schema-validate": { freshnessCategory: "computed" },
  "schema-infer": { freshnessCategory: "computed" },
  "code-review": { freshnessCategory: "computed" },
  "code-convert": { freshnessCategory: "computed" },
  "sql-generate": { freshnessCategory: "computed" },
  "sql-explain": { freshnessCategory: "computed" },
  "sql-optimize": { freshnessCategory: "computed" },
  "regex-generate": { freshnessCategory: "computed" },
  "regex-explain": { freshnessCategory: "computed" },
  "cron-explain": { freshnessCategory: "computed" },
  "crontab-generate": { freshnessCategory: "computed" },
  "curl-to-code": { freshnessCategory: "computed" },
  "error-explain": { freshnessCategory: "computed" },
  "jwt-decode": { freshnessCategory: "computed" },
  "secret-scan": { freshnessCategory: "computed" },

  // ── Document generation ───────────────────────────────────────────────
  "api-docs-generate": { freshnessCategory: "computed" },
  "openapi-generate": { freshnessCategory: "computed" },
  "openapi-validate": { freshnessCategory: "computed" },
  "api-mock-response": { freshnessCategory: "computed" },
  "dockerfile-generate": { freshnessCategory: "computed" },
  "gitignore-generate": { freshnessCategory: "computed" },
  "github-actions-generate": { freshnessCategory: "computed" },
  "nginx-config-generate": { freshnessCategory: "computed" },
  "env-template-generate": { freshnessCategory: "computed" },
  "readme-generate": { freshnessCategory: "computed" },
  "changelog-generate": { freshnessCategory: "computed" },
  "release-notes-generate": { freshnessCategory: "computed" },
  "pr-description-generate": { freshnessCategory: "computed" },
  "commit-message-generate": { freshnessCategory: "computed" },
  "docstring-generate": { freshnessCategory: "computed" },
  "jsdoc-generate": { freshnessCategory: "computed" },
  "test-case-generate": { freshnessCategory: "computed" },
  "schema-migration-generate": { freshnessCategory: "computed" },
  "fake-data-generate": { freshnessCategory: "computed" },

  // ── AI/LLM utilities ──────────────────────────────────────────────────
  "prompt-optimize": { freshnessCategory: "computed" },
  "prompt-compress": { freshnessCategory: "computed" },
  "context-window-optimize": { freshnessCategory: "computed" },
  "llm-output-validate": { freshnessCategory: "computed" },
  "tool-call-validate": { freshnessCategory: "computed" },
  "agent-trace-analyze": { freshnessCategory: "computed" },

  // ── Content generation ────────────────────────────────────────────────
  "email-draft": { freshnessCategory: "computed" },
  "blog-post-outline": { freshnessCategory: "computed" },
  "social-post-generate": { freshnessCategory: "computed" },

  // ── Compliance classification (algorithmic) ───────────────────────────
  "eu-ai-act-classify": { freshnessCategory: "computed" },
  "invoice-validate": { freshnessCategory: "computed" },
  "payment-reference-generate": { freshnessCategory: "computed" },
};

async function backfill() {
  const db = getDb();

  // Fetch all capabilities from DB
  const allCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities);
  const dbSlugs = new Set(allCaps.map((c) => c.slug));

  let updated = 0;
  let skipped = 0;

  for (const [slug, data] of Object.entries(FRESHNESS_MAP)) {
    if (!dbSlugs.has(slug)) {
      console.warn(`  SKIP (not in DB): ${slug}`);
      skipped++;
      continue;
    }

    await db
      .update(capabilities)
      .set({
        freshnessCategory: data.freshnessCategory,
        dataUpdateCycleDays: data.dataUpdateCycleDays ?? null,
        updatedAt: new Date(),
      })
      .where(eq(capabilities.slug, slug));

    updated++;
  }

  // Warn about unmapped capabilities
  const mappedSlugs = new Set(Object.keys(FRESHNESS_MAP));
  const unmapped = allCaps.filter((c) => !mappedSlugs.has(c.slug));
  if (unmapped.length > 0) {
    console.warn(`\n  UNMAPPED (${unmapped.length}):`);
    for (const c of unmapped) {
      console.warn(`    - ${c.slug}`);
    }
  }

  console.log(
    `\nBackfill complete: ${updated} updated, ${skipped} skipped (not in DB)`,
  );
  process.exit(0);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
