import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { eq, sql } from "drizzle-orm";

// ─── maintenance_class taxonomy ─────────────────────────────────────────────
//
// pure-computation          No external dependency (regex, math, format conversion)
// free-stable-api           Government or public API, free, rarely changes
// commercial-stable-api     Paid API with SLA and stable contract (Anthropic, Serper, Dilisense, Companies House)
// scraping-stable-target    Scraping a government portal or stable institutional site
// scraping-fragile-target   Scraping a commercial/third-party site or user-provided URL
// requires-domain-expertise Output requires human judgment to verify (legal, compliance, trade classification)

type MaintenanceClass =
  | "pure-computation"
  | "free-stable-api"
  | "commercial-stable-api"
  | "scraping-stable-target"
  | "scraping-fragile-target"
  | "requires-domain-expertise";

const CLASSIFICATION: Record<string, MaintenanceClass> = {
  // ── pure-computation ────────────────────────────────────────────────────────
  // No external network calls. Algorithmic, regex, math, format conversion, reference data.
  "age-verify": "pure-computation",
  "aml-risk-score": "pure-computation",
  "bank-bic-lookup": "pure-computation",
  "business-day-check": "pure-computation",
  "company-id-detect": "pure-computation",
  "company-name-match": "pure-computation",
  "context-window-optimize": "pure-computation",
  "contract-verify-check": "pure-computation",
  "country-tax-rates": "pure-computation",
  "credit-score-band": "pure-computation",
  "cron-explain": "pure-computation",
  "csv-clean": "pure-computation",
  "csv-to-json": "pure-computation",
  "dangerous-goods-classify": "pure-computation",
  "data-protection-authority-lookup": "pure-computation",
  "data-quality-check": "pure-computation",
  "date-parse": "pure-computation",
  "deduplicate": "pure-computation",
  "diff-json": "pure-computation",
  "employment-cost-estimate": "pure-computation",
  "eu-ai-act-classify": "pure-computation",
  "financial-year-dates": "pure-computation",
  "flatten-json": "pure-computation",
  "gitignore-generate": "pure-computation",
  "http-to-curl": "pure-computation",
  "iban-validate": "pure-computation",
  "id-number-validate": "pure-computation",
  "image-resize": "pure-computation",
  "incoterms-explain": "pure-computation",
  "invoice-validate": "pure-computation",
  "isbn-validate": "pure-computation",
  "iso-country-lookup": "pure-computation",
  "json-repair": "pure-computation",
  "json-schema-validate": "pure-computation",
  "json-to-csv": "pure-computation",
  "json-to-pydantic": "pure-computation",
  "json-to-typescript": "pure-computation",
  "json-to-zod": "pure-computation",
  "jwt-decode": "pure-computation",
  "language-detect": "pure-computation",
  "license-compatibility-check": "pure-computation",
  "llm-cost-calculate": "pure-computation",
  "llm-output-validate": "pure-computation",
  "log-parse": "pure-computation",
  "markdown-to-html": "pure-computation",
  "marketplace-fee-calculate": "pure-computation",
  "name-parse": "pure-computation",
  "openapi-validate": "pure-computation",
  "password-strength": "pure-computation",
  "payment-reference-generate": "pure-computation",
  "phone-normalize": "pure-computation",
  "phone-type-detect": "pure-computation",
  "phone-validate": "pure-computation",
  "port-lookup": "pure-computation",
  "schema-infer": "pure-computation",
  "sepa-xml-validate": "pure-computation",
  "shipping-cost-estimate": "pure-computation",
  "skill-gap-analyze": "pure-computation",
  "swift-message-parse": "pure-computation",
  "swift-validate": "pure-computation",
  "tax-id-validate": "pure-computation",
  "timezone-lookup": "pure-computation",
  "timezone-meeting-find": "pure-computation",
  "token-count": "pure-computation",
  "tool-call-validate": "pure-computation",
  "unit-convert": "pure-computation",
  "vat-format-validate": "pure-computation",
  "vat-rate-lookup": "pure-computation",
  "work-permit-requirements": "pure-computation",
  "xml-to-json": "pure-computation",

  // ── free-stable-api ─────────────────────────────────────────────────────────
  // Government registries, international standard APIs, free public APIs, DNS/net/TLS checks.
  "address-geocode": "free-stable-api",
  "address-validate": "free-stable-api",
  "api-health-check": "free-stable-api",
  "approval-security-check": "free-stable-api",
  "au-company-data": "free-stable-api",             // ABN Lookup (Australian government)
  "barcode-lookup": "free-stable-api",               // Open Food Facts
  "base64-encode-url": "free-stable-api",
  "brazilian-company-data": "free-stable-api",       // CNPJ lookup + Anthropic name resolution
  "charity-lookup-uk": "free-stable-api",            // Charity Commission UK
  "country-trade-data": "free-stable-api",
  "crypto-price": "free-stable-api",                 // CoinGecko (free)
  "currency-convert": "free-stable-api",             // Frankfurter
  "cve-lookup": "free-stable-api",                   // OSV API
  "danish-company-data": "free-stable-api",          // CVR API + Anthropic name resolution
  "dns-lookup": "free-stable-api",
  "docker-hub-info": "free-stable-api",
  "domain-age-check": "free-stable-api",             // DNS + WHOIS
  "domain-reputation": "free-stable-api",
  "ecb-interest-rates": "free-stable-api",           // ECB SDW API
  "email-deliverability-check": "free-stable-api",   // DNS + SMTP checks
  "email-reputation-score": "free-stable-api",
  "email-validate": "free-stable-api",               // MX lookup
  "ens-resolve": "free-stable-api",                  // Ethereum RPC
  "ens-reverse-lookup": "free-stable-api",
  "eori-validate": "free-stable-api",                // EU EORI API
  "exchange-rate": "free-stable-api",                // Frankfurter
  "fear-greed-index": "free-stable-api",
  "finnish-company-data": "free-stable-api",         // PRH API + Anthropic name resolution
  "food-safety-rating-uk": "free-stable-api",        // FSA API
  "forex-history": "free-stable-api",                // Frankfurter
  "french-company-data": "free-stable-api",          // API Gouv + Anthropic name resolution
  "gas-price-check": "free-stable-api",              // Ethereum gas APIs
  "gdpr-website-check": "free-stable-api",
  "github-repo-compare": "free-stable-api",          // GitHub API (free)
  "github-user-profile": "free-stable-api",
  "header-security-check": "free-stable-api",
  "holiday-calendar": "free-stable-api",
  "iban-to-bank": "free-stable-api",
  "ip-geolocation": "free-stable-api",               // ip-api.com
  "ip-risk-score": "free-stable-api",
  "keyword-suggest": "free-stable-api",              // Google Autocomplete (free)
  "lei-lookup": "free-stable-api",                   // GLEIF
  "linkedin-url-validate": "free-stable-api",
  "mx-lookup": "free-stable-api",                    // DNS
  "norwegian-company-data": "free-stable-api",       // Brreg API + Anthropic name resolution
  "npm-package-info": "free-stable-api",
  "og-image-check": "free-stable-api",
  "package-security-audit": "free-stable-api",       // npm audit / OSV
  "page-speed-test": "free-stable-api",              // Google PageSpeed Insights (free)
  "paid-api-preflight": "free-stable-api",
  "phishing-site-check": "free-stable-api",
  "port-check": "free-stable-api",                   // TCP socket
  "postal-code-lookup": "free-stable-api",
  "protocol-fees-lookup": "free-stable-api",         // DeFi APIs
  "protocol-tvl-lookup": "free-stable-api",
  "public-holiday-lookup": "free-stable-api",        // Nager.Date
  "pypi-package-info": "free-stable-api",
  "redirect-trace": "free-stable-api",
  "robots-txt-parse": "free-stable-api",
  "shipping-track": "free-stable-api",
  "sitemap-parse": "free-stable-api",
  "social-profile-check": "free-stable-api",
  "ssl-certificate-chain": "free-stable-api",        // TLS connection
  "ssl-check": "free-stable-api",
  "stablecoin-flow-check": "free-stable-api",
  "startup-domain-check": "free-stable-api",
  "stock-quote": "free-stable-api",                  // Yahoo Finance
  "ted-procurement": "free-stable-api",              // TED API
  "ticker-lookup": "free-stable-api",
  "token-security-check": "free-stable-api",
  "uptime-check": "free-stable-api",
  "url-health-check": "free-stable-api",
  "url-to-text": "free-stable-api",
  "us-company-data": "free-stable-api",              // SEC EDGAR + Anthropic
  "vasp-non-compliant-check": "free-stable-api",
  "vasp-verify": "free-stable-api",
  "vat-validate": "free-stable-api",                 // VIES API
  "wallet-age-check": "free-stable-api",
  "wallet-balance-lookup": "free-stable-api",
  "wallet-risk-score": "free-stable-api",
  "wallet-transactions-lookup": "free-stable-api",
  "weather-lookup": "free-stable-api",               // Open-Meteo
  "website-carbon-estimate": "free-stable-api",
  "whois-lookup": "free-stable-api",

  // ── commercial-stable-api ───────────────────────────────────────────────────
  // Anthropic (LLM is core value), Serper, Dilisense, Companies House API key, Adzuna, AviationStack.
  "address-parse": "commercial-stable-api",          // Anthropic
  "adverse-media-check": "commercial-stable-api",    // Serper + Dilisense + Anthropic
  "agent-trace-analyze": "commercial-stable-api",    // Anthropic
  "api-docs-generate": "commercial-stable-api",      // Anthropic
  "api-mock-response": "commercial-stable-api",      // Anthropic
  "backlink-check": "commercial-stable-api",         // Serper
  "beneficial-ownership-lookup": "commercial-stable-api", // Companies House API key
  "blog-post-outline": "commercial-stable-api",      // Anthropic
  "brand-mention-search": "commercial-stable-api",   // Serper + Anthropic
  "changelog-generate": "commercial-stable-api",     // Anthropic
  "classify-text": "commercial-stable-api",          // Anthropic
  "code-convert": "commercial-stable-api",           // Anthropic
  "code-review": "commercial-stable-api",            // Anthropic
  "commit-message-generate": "commercial-stable-api", // Anthropic
  "company-industry-classify": "commercial-stable-api", // Anthropic
  "contract-extract": "commercial-stable-api",       // Anthropic
  "crontab-generate": "commercial-stable-api",       // Anthropic
  "curl-to-code": "commercial-stable-api",           // Anthropic
  "dependency-audit": "commercial-stable-api",       // Anthropic + npm/OSV
  "dockerfile-generate": "commercial-stable-api",    // Anthropic
  "docstring-generate": "commercial-stable-api",     // Anthropic
  "email-draft": "commercial-stable-api",            // Anthropic
  "env-template-generate": "commercial-stable-api",  // Anthropic
  "error-explain": "commercial-stable-api",          // Anthropic
  "fake-data-generate": "commercial-stable-api",     // Anthropic
  "flight-status": "commercial-stable-api",          // AviationStack API key
  "github-actions-generate": "commercial-stable-api", // Anthropic
  "github-repo-analyze": "commercial-stable-api",    // Anthropic + GitHub API
  "google-search": "commercial-stable-api",          // Serper
  "image-to-text": "commercial-stable-api",          // Anthropic vision
  "insolvency-check": "commercial-stable-api",       // Companies House API key
  "invoice-extract": "commercial-stable-api",        // Anthropic
  "job-board-search": "commercial-stable-api",       // Adzuna API
  "job-posting-analyze": "commercial-stable-api",    // Anthropic
  "jsdoc-generate": "commercial-stable-api",         // Anthropic
  "meeting-notes-extract": "commercial-stable-api",  // Anthropic
  "nginx-config-generate": "commercial-stable-api",  // Anthropic
  "openapi-generate": "commercial-stable-api",       // Anthropic
  "pdf-extract": "commercial-stable-api",            // Anthropic vision
  "pep-check": "commercial-stable-api",              // Dilisense / OpenSanctions
  "pii-redact": "commercial-stable-api",             // Anthropic
  "pr-description-generate": "commercial-stable-api", // Anthropic
  "prompt-compress": "commercial-stable-api",        // Anthropic
  "prompt-optimize": "commercial-stable-api",        // Anthropic
  "readme-generate": "commercial-stable-api",        // Anthropic
  "receipt-categorize": "commercial-stable-api",     // Anthropic
  "regex-explain": "commercial-stable-api",          // Anthropic
  "regex-generate": "commercial-stable-api",         // Anthropic
  "release-notes-generate": "commercial-stable-api", // Anthropic
  "resume-parse": "commercial-stable-api",           // Anthropic
  "sanctions-check": "commercial-stable-api",        // Dilisense
  "schema-migration-generate": "commercial-stable-api", // Anthropic
  "secret-scan": "commercial-stable-api",            // Anthropic
  "sentiment-analyze": "commercial-stable-api",      // Anthropic
  "serp-analyze": "commercial-stable-api",           // Serper
  "skill-extract": "commercial-stable-api",          // Anthropic
  "social-post-generate": "commercial-stable-api",   // Anthropic
  "sql-explain": "commercial-stable-api",            // Anthropic
  "sql-generate": "commercial-stable-api",           // Anthropic
  "sql-optimize": "commercial-stable-api",           // Anthropic
  "summarize": "commercial-stable-api",              // Anthropic
  "test-case-generate": "commercial-stable-api",     // Anthropic
  "translate": "commercial-stable-api",              // Anthropic
  "uk-companies-house-officers": "commercial-stable-api", // Companies House API key
  "uk-company-data": "commercial-stable-api",        // Companies House API key + Anthropic
  "webhook-test-payload": "commercial-stable-api",   // Anthropic
  "website-to-company": "commercial-stable-api",     // Anthropic + fetch

  // ── scraping-stable-target ──────────────────────────────────────────────────
  // Browserless scraping of government portals or large stable institutional sites.
  "australian-company-data": "scraping-stable-target",  // ASIC (Australian government)
  "austrian-company-data": "scraping-stable-target",    // Austrian commercial register
  "belgian-company-data": "scraping-stable-target",     // Belgian Crossroads Bank
  "business-license-check-se": "scraping-stable-target", // Bolagsverket
  "canadian-company-data": "scraping-stable-target",    // Canadian government registries
  "customs-duty-lookup": "scraping-stable-target",      // TARIC (EU customs)
  "dutch-company-data": "scraping-stable-target",       // KVK (Netherlands)
  "estonian-company-data": "scraping-stable-target",    // ariregister.rik.ee
  "eu-court-case-search": "scraping-stable-target",     // CURIA
  "eu-regulation-search": "scraping-stable-target",     // EUR-Lex
  "eu-trademark-search": "scraping-stable-target",      // EUIPO
  "gdpr-fine-lookup": "scraping-stable-target",         // enforcementtracker.com (institutional)
  "german-company-data": "scraping-stable-target",      // Handelsregister
  "hong-kong-company-data": "scraping-stable-target",   // HK Companies Registry
  "indian-company-data": "scraping-stable-target",      // Indian MCA
  "irish-company-data": "scraping-stable-target",       // CRO Ireland
  "italian-company-data": "scraping-stable-target",     // Italian Chamber of Commerce
  "japanese-company-data": "scraping-stable-target",    // Japanese e-Gov / EDINET
  "latvian-company-data": "scraping-stable-target",     // Latvian Enterprise Register
  "lithuanian-company-data": "scraping-stable-target",  // Lithuanian Centre of Registers
  "polish-company-data": "scraping-stable-target",      // KRS portal
  "portuguese-company-data": "scraping-stable-target",  // Portuguese commercial registry
  "singapore-company-data": "scraping-stable-target",   // ACRA Singapore
  "spanish-company-data": "scraping-stable-target",     // Spanish Registro Mercantil
  "swedish-company-data": "scraping-stable-target",     // Allabolag.se (commercial but very stable)
  "swiss-company-data": "scraping-stable-target",       // Swiss commercial register

  // ── scraping-fragile-target ─────────────────────────────────────────────────
  // Browserless scraping of commercial/third-party sites or user-provided URLs.
  "accessibility-audit": "scraping-fragile-target",     // User-provided URL
  "amazon-price": "scraping-fragile-target",            // Amazon (anti-bot, frequent changes)
  "annual-report-extract": "scraping-fragile-target",   // User-provided URL/PDF
  "company-enrich": "scraping-fragile-target",          // User-provided company website
  "company-tech-stack": "scraping-fragile-target",      // User-provided URL
  "competitor-compare": "scraping-fragile-target",      // Multiple user-provided URLs
  "container-track": "scraping-fragile-target",         // Shipping portals
  "cookie-scan": "scraping-fragile-target",             // User-provided URL
  "credit-report-summary": "scraping-fragile-target",   // Credit reporting sites
  "employer-review-summary": "scraping-fragile-target", // Review sites
  "html-to-pdf": "scraping-fragile-target",             // User-provided URL
  "landing-page-roast": "scraping-fragile-target",      // User-provided URL
  "link-extract": "scraping-fragile-target",            // User-provided URL
  "meta-extract": "scraping-fragile-target",            // User-provided URL
  "patent-search": "scraping-fragile-target",           // Google Patents
  "price-compare": "scraping-fragile-target",           // Shopping sites
  "pricing-page-extract": "scraping-fragile-target",    // User-provided URL
  "privacy-policy-analyze": "scraping-fragile-target",  // User-provided URL
  "product-reviews-extract": "scraping-fragile-target", // Review sites
  "product-search": "scraping-fragile-target",          // Shopping sites
  "return-policy-extract": "scraping-fragile-target",   // User-provided URL
  "salary-benchmark": "scraping-fragile-target",        // Salary data sites
  "screenshot-url": "scraping-fragile-target",          // User-provided URL
  "seo-audit": "scraping-fragile-target",               // User-provided URL
  "structured-scrape": "scraping-fragile-target",       // User-provided URL
  "tech-stack-detect": "scraping-fragile-target",       // User-provided URL
  "terms-of-service-extract": "scraping-fragile-target", // User-provided URL
  "trustpilot-score": "scraping-fragile-target",        // Trustpilot
  "url-to-markdown": "scraping-fragile-target",         // User-provided URL
  "web-extract": "scraping-fragile-target",             // User-provided URL
  "youtube-summarize": "scraping-fragile-target",       // YouTube

  // ── requires-domain-expertise ───────────────────────────────────────────────
  // Output is a judgment or analysis that requires specialist knowledge to verify.
  "hs-code-lookup": "requires-domain-expertise",        // Customs classification (trade expertise)
  "risk-narrative-generate": "requires-domain-expertise", // Compliance narrative (compliance expertise)
};

async function main() {
  const db = getDb();

  // ── Print classification grouped by maintenance_class ──────────────────────
  const grouped: Record<MaintenanceClass, string[]> = {
    "pure-computation": [],
    "free-stable-api": [],
    "commercial-stable-api": [],
    "scraping-stable-target": [],
    "scraping-fragile-target": [],
    "requires-domain-expertise": [],
  };

  for (const [slug, cls] of Object.entries(CLASSIFICATION)) {
    grouped[cls].push(slug);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         MAINTENANCE_CLASS CLASSIFICATION REPORT             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let totalClassified = 0;
  for (const [cls, slugs] of Object.entries(grouped)) {
    slugs.sort();
    console.log(`\n── ${cls} (${slugs.length}) ──`);
    for (const slug of slugs) {
      console.log(`  ${slug}`);
    }
    totalClassified += slugs.length;
  }

  console.log(`\n── Summary ──`);
  for (const [cls, slugs] of Object.entries(grouped)) {
    console.log(`  ${cls.padEnd(30)} ${slugs.length}`);
  }
  console.log(`  ${"TOTAL classified".padEnd(30)} ${totalClassified}`);

  // ── Fetch all active capabilities from DB ──────────────────────────────────
  const allCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`\n  Active capabilities in DB:    ${allCaps.length}`);

  const dbSlugs = new Set(allCaps.map((c) => c.slug));
  const classifiedSlugs = new Set(Object.keys(CLASSIFICATION));

  // Check for capabilities in DB but not classified
  const unclassified = [...dbSlugs].filter((s) => !classifiedSlugs.has(s));
  if (unclassified.length > 0) {
    console.log(`\n  ⚠ ${unclassified.length} capabilities in DB but NOT classified (will keep default scraping-fragile-target):`);
    for (const slug of unclassified.sort()) {
      console.log(`    ${slug}`);
    }
  }

  // Check for classified slugs not in DB
  const notInDb = [...classifiedSlugs].filter((s) => !dbSlugs.has(s));
  if (notInDb.length > 0) {
    console.log(`\n  ⚠ ${notInDb.length} classified slugs NOT in DB (will skip):`);
    for (const slug of notInDb.sort()) {
      console.log(`    ${slug}`);
    }
  }

  // ── Apply backfill ────────────────────────────────────────────────────────
  console.log(`\n── Applying backfill ──`);
  let updated = 0;
  let skipped = 0;

  for (const [slug, maintenanceClass] of Object.entries(CLASSIFICATION)) {
    if (!dbSlugs.has(slug)) {
      skipped++;
      continue;
    }

    await db
      .update(capabilities)
      .set({ maintenanceClass })
      .where(eq(capabilities.slug, slug));
    updated++;
  }

  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (not in DB): ${skipped}`);

  // ── Verify: count per maintenance_class ────────────────────────────────────
  const counts = await db.execute(sql`
    SELECT maintenance_class, COUNT(*) as count
    FROM capabilities
    WHERE is_active = true
    GROUP BY maintenance_class
    ORDER BY count DESC
  `);

  console.log(`\n── Verification: DB distribution ──`);
  let defaultCount = 0;
  for (const row of counts as unknown as Array<Record<string, unknown>>) {
    const cls = row.maintenance_class as string;
    const count = row.count as number;
    console.log(`  ${String(cls).padEnd(30)} ${count}`);
    if (cls === "scraping-fragile-target") {
      defaultCount = Number(count);
    }
  }

  // ── Flag capabilities that kept the default ────────────────────────────────
  if (unclassified.length > 0) {
    console.log(`\n── ⚠ Capabilities that kept default (scraping-fragile-target) due to ambiguity ──`);
    console.log(`  These ${unclassified.length} capabilities were not in the classification map.`);
    console.log(`  They need manual review:`);
    for (const slug of unclassified.sort()) {
      console.log(`    ${slug}`);
    }
  }

  console.log(`\n✓ Backfill complete.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
