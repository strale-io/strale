/**
 * One-shot sync of capabilities.data_source from manifest YAML files to the
 * production DB, for the 12 capabilities whose data_source previously claimed
 * "Headless browser" but actually use the web-provider 3-tier fallback chain
 * (plain HTTP → Jina → Browserless). The manifests have been rewritten; this
 * pushes the new strings to prod so the public catalog matches.
 *
 * Scope: ONLY data_source. Does not touch description, schemas, pricing, or
 * any other field — that's what sync-manifest-text-to-db.ts is for.
 *
 * Usage:
 *   npx tsx scripts/sync-data-source-bulk.ts          # apply
 *   npx tsx scripts/sync-data-source-bulk.ts --dry-run
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";

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
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const SLUGS = [
  "cookie-scan",
  "container-track",
  "product-reviews-extract",
  "trustpilot-score",
  "product-search",
  "employer-review-summary",
  "price-compare",
  "salary-benchmark",
  "return-policy-extract",
  "patent-search",
  "pricing-page-extract",
  "structured-scrape",
];

const dryRun = process.argv.includes("--dry-run");

const updates: { slug: string; before: string | null; after: string }[] = [];

for (const slug of SLUGS) {
  const manifestPath = resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`);
  const m = yaml.load(readFileSync(manifestPath, "utf8")) as { data_source?: string };
  const newDs = m.data_source;
  if (!newDs) {
    console.error(`[skip] ${slug}: manifest has no data_source`);
    continue;
  }
  const rows = await sql<{ data_source: string | null }[]>`
    SELECT data_source FROM capabilities WHERE slug = ${slug}
  `;
  if (rows.length === 0) {
    console.error(`[skip] ${slug}: not found in DB`);
    continue;
  }
  const before = rows[0].data_source;
  if (before === newDs) {
    console.log(`[noop] ${slug}: already matches manifest`);
    continue;
  }
  updates.push({ slug, before, after: newDs });
}

console.log("\n=== Pending updates ===");
for (const u of updates) {
  console.log(`  ${u.slug}`);
  console.log(`    BEFORE: ${u.before}`);
  console.log(`    AFTER:  ${u.after}`);
}

if (dryRun) {
  console.log("\n--dry-run: not applying");
  await sql.end();
  process.exit(0);
}

if (updates.length === 0) {
  console.log("\nNothing to update.");
  await sql.end();
  process.exit(0);
}

console.log(`\nApplying ${updates.length} updates...`);
for (const u of updates) {
  await sql`
    UPDATE capabilities
    SET data_source = ${u.after}, updated_at = NOW()
    WHERE slug = ${u.slug}
  `;
  console.log(`  [ok] ${u.slug}`);
}

console.log(`\nDone — ${updates.length} rows updated.`);
await sql.end();
