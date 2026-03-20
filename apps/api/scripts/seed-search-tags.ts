/**
 * Seed search_tags on capabilities and solutions for improved discovery.
 *
 * Idempotent — safe to run multiple times. Overwrites existing tags.
 *
 * Usage: cd apps/api && npx tsx scripts/seed-search-tags.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });
if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = line.substring("DATABASE_URL=".length);
      break;
    }
  }
}

import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);

// ─── Category → tags mapping ───────────────────────────────────────────────

const CATEGORY_TAGS: Record<string, string[]> = {
  compliance: ["compliance", "compliance screening", "regulatory", "AML", "KYC"],
  "compliance-verification": ["compliance", "compliance screening", "verification", "regulatory", "KYC", "KYB"],
  validation: ["validation", "verify", "check"],
  "data-extraction": ["data extraction", "lookup", "data"],
  finance: ["finance", "banking", "financial", "payment"],
  "finance-banking": ["finance", "banking", "financial", "payment"],
  legal: ["legal", "regulatory"],
  "legal-regulatory": ["legal", "regulatory", "compliance"],
  "security-risk": ["security", "risk", "cybersecurity"],
  "sales-outreach": ["sales", "outreach", "lead generation"],
  "data-research": ["research", "data", "analysis"],
  "developer-tools": ["developer", "tools", "API"],
  "agent-tooling": ["agent", "AI agent", "tooling", "automation"],
  "company-data": ["company data", "company verification", "KYB", "know your business", "business registry", "corporate data"],
};

// ─── Slug-specific tags ────────────────────────────────────────────────────

const CAPABILITY_TAGS: Record<string, string[]> = {
  "sanctions-check": ["AML", "anti-money laundering", "sanctions screening", "compliance screening", "OFAC", "watchlist", "sanctions", "KYC"],
  "pep-check": ["PEP", "politically exposed", "compliance screening", "AML", "anti-money laundering", "KYC"],
  "adverse-media-check": ["adverse media", "negative news", "compliance screening", "AML", "KYC", "media screening"],
  "risk-narrative-generate": ["risk assessment", "risk narrative", "compliance report", "due diligence report", "AI narrative"],
  "customer-risk-screen": ["AML screening", "customer due diligence", "CDD", "onboarding", "risk screening", "KYC"],
  "enhanced-due-diligence": ["EDD", "enhanced due diligence", "deep compliance", "beneficial ownership", "KYC", "KYB"],
  "vat-validate": ["VAT", "tax validation", "tax ID", "VIES", "tax number"],
  "vat-format-validate": ["VAT", "tax validation", "tax format", "VIES"],
  "iban-validate": ["IBAN", "bank account", "payment validation", "banking", "SEPA"],
  "bank-bic-lookup": ["BIC", "SWIFT", "bank lookup", "payment", "banking"],
  "swift-validate": ["SWIFT", "BIC", "bank code", "international transfer"],
  "lei-lookup": ["LEI", "legal entity identifier", "entity identification", "KYB"],
  "email-validate": ["email", "email verification", "deliverability", "contact validation"],
  "dns-lookup": ["DNS", "domain", "nameserver", "MX record"],
  "domain-reputation": ["domain", "reputation", "trust", "website safety"],
  "whois-lookup": ["WHOIS", "domain registration", "domain ownership", "domain age"],
  "ssl-check": ["SSL", "TLS", "certificate", "HTTPS", "security"],
  "ssl-certificate-chain": ["SSL", "TLS", "certificate chain", "security"],
  "redirect-trace": ["redirect", "URL trace", "redirect chain", "link safety"],
  "invoice-validate": ["invoice", "invoice validation", "document verification"],
  "invoice-extract": ["invoice", "invoice extraction", "OCR", "document processing"],
  "json-repair": ["JSON", "fix JSON", "malformed JSON", "developer tools"],
  "url-to-markdown": ["URL", "markdown", "web scraping", "content extraction"],
  "google-search": ["search", "Google", "web search", "SERP"],
  "gdpr-website-check": ["GDPR", "privacy", "data protection", "compliance"],
  "ai-act-classify": ["EU AI Act", "AI regulation", "risk classification", "compliance"],
  "company-id-detect": ["company ID", "registry number", "org number", "business ID", "KYB"],
  "credit-report-summary": ["credit report", "credit check", "financial health", "creditworthiness"],
  "annual-report-extract": ["annual report", "financial statements", "company financials"],
  "eori-validate": ["EORI", "customs", "trade", "import export"],
  "vat-rate-lookup": ["VAT rate", "tax rate", "sales tax"],
};

// ─── Company data capabilities → common tags ───────────────────────────────

const COMPANY_DATA_TAGS = [
  "company verification", "company check", "KYB", "know your business",
  "business registry", "corporate data", "company lookup", "company data",
  "business verification",
];

// ─── Solution pattern tags ─────────────────────────────────────────────────

const SOLUTION_PATTERN_TAGS: Record<string, string[]> = {
  "kyb-essentials": ["KYC", "KYB", "know your business", "company verification", "compliance", "quick verification"],
  "kyb-complete": ["KYC", "KYB", "due diligence", "enhanced due diligence", "EDD", "compliance screening", "full verification", "comprehensive check"],
  "invoice-verify": ["invoice fraud", "invoice verification", "payment fraud", "BEC", "business email compromise", "accounts payable", "AP automation"],
};

// ─── Seed logic ────────────────────────────────────────────────────────────

async function seed() {
  // 1. Seed capability tags
  console.log("=== Seeding capability search_tags ===");

  const caps = await sql`SELECT slug, category FROM capabilities WHERE is_active = true ORDER BY slug`;
  let capUpdated = 0;

  for (const cap of caps) {
    const tags = new Set<string>();

    // Add category tags
    const catTags = CATEGORY_TAGS[cap.category];
    if (catTags) for (const t of catTags) tags.add(t);

    // Add slug-specific tags
    const slugTags = CAPABILITY_TAGS[cap.slug];
    if (slugTags) for (const t of slugTags) tags.add(t);

    // Add company-data tags for all *-company-data capabilities
    if (cap.slug.endsWith("-company-data")) {
      for (const t of COMPANY_DATA_TAGS) tags.add(t);
    }

    if (tags.size > 0) {
      const tagArray = [...tags];
      await sql`UPDATE capabilities SET search_tags = ${tagArray} WHERE slug = ${cap.slug}`;
      capUpdated++;
    }
  }

  console.log(`  Updated ${capUpdated} of ${caps.length} capabilities`);

  // 2. Seed solution tags
  console.log("\n=== Seeding solution search_tags ===");

  const sols = await sql`SELECT slug, category FROM solutions WHERE is_active = true ORDER BY slug`;
  let solUpdated = 0;

  for (const sol of sols) {
    const tags = new Set<string>();

    // Add category tags
    const catTags = CATEGORY_TAGS[sol.category];
    if (catTags) for (const t of catTags) tags.add(t);

    // Add pattern-based tags (kyb-essentials-*, kyb-complete-*, invoice-verify-*)
    for (const [pattern, patternTags] of Object.entries(SOLUTION_PATTERN_TAGS)) {
      if (sol.slug.startsWith(pattern)) {
        for (const t of patternTags) tags.add(t);
      }
    }

    if (tags.size > 0) {
      const tagArray = [...tags];
      await sql`UPDATE solutions SET search_tags = ${tagArray} WHERE slug = ${sol.slug}`;
      solUpdated++;
    }
  }

  console.log(`  Updated ${solUpdated} of ${sols.length} solutions`);

  // 3. Verify
  console.log("\n=== Verification ===");
  const sample = await sql`SELECT slug, search_tags FROM capabilities WHERE array_length(search_tags, 1) > 0 ORDER BY slug LIMIT 10`;
  for (const r of sample) {
    console.log(`  ${r.slug}: [${(r.search_tags as string[]).join(", ")}]`);
  }

  const solSample = await sql`SELECT slug, search_tags FROM solutions WHERE array_length(search_tags, 1) > 0 ORDER BY slug LIMIT 5`;
  console.log("");
  for (const r of solSample) {
    console.log(`  ${r.slug}: [${(r.search_tags as string[]).join(", ")}]`);
  }

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
