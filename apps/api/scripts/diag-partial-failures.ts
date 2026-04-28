/**
 * Pull most recent failed test runs for the partial-failure capabilities
 * surfaced by the post-Browserless bulk test. Used to triage what the
 * actual error is per cap before opening per-cap fixes.
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
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const slugs = [
  "adverse-media-check",
  "french-company-data",
  "og-image-check",
  "redirect-trace",
  "npm-package-info",
  "iso-country-lookup",
  "incoterms-explain",
  "llm-cost-calculate",
  "company-news",
  "nl-housing-price-index",
  "prompt-compress",
  "test-case-generate",
  "pii-redact",
  "danish-company-data",
  "polish-company-data",
];

console.log(`Fetching most-recent failed runs for ${slugs.length} caps\n`);

for (const slug of slugs) {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'test_results' AND column_name IN ('failure_reason','error_message','passed','executed_at','test_suite_id','capability_slug')
  `;
  const colNames = new Set(cols.map((r: any) => r.column_name as string));

  const failureCol = colNames.has("failure_reason") ? "failure_reason" :
                      colNames.has("error_message") ? "error_message" : null;
  if (!failureCol) {
    console.error("No failure column found");
    process.exit(1);
  }

  const rows = await sql.unsafe(`
    SELECT tr.${failureCol} AS reason, tr.executed_at, ts.test_type
    FROM test_results tr
    LEFT JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = $1
      AND tr.passed = false
      AND tr.executed_at > NOW() - INTERVAL '6 hours'
    ORDER BY tr.executed_at DESC
    LIMIT 5
  `, [slug]);

  console.log(`=== ${slug} (${rows.length} recent failures) ===`);
  const seen = new Set<string>();
  for (const r of rows as any[]) {
    const reason = (r.reason ?? "").toString().slice(0, 200);
    const key = `${r.test_type}|${reason.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${r.test_type ?? "?"}] ${reason}`);
  }
  console.log();
}

await sql.end();
