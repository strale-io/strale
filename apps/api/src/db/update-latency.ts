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
