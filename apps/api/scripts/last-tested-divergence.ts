/**
 * Diagnostic: compare capabilities.last_tested_at (scheduler's eligibility
 * field) against MAX(test_results.executed_at) (the truth). Divergence could
 * mask "scheduler not running" if last_tested_at is being stamped somewhere
 * without test_results actually being written.
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

console.log(`\n=== capabilities.last_tested_at vs MAX(test_results.executed_at) ===\n`);

// 1. Run the production scheduler eligibility query verbatim
const overdue = await sql<Array<{ slug: string; last_tested_at: Date | null; schedule_tier: string }>>`
  SELECT
    c.slug,
    c.last_tested_at,
    MIN(ts.schedule_tier) AS schedule_tier
  FROM capabilities c
  INNER JOIN test_suites ts
    ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    AND (
      c.last_tested_at IS NULL
      OR (ts.schedule_tier = 'A' AND c.last_tested_at < NOW() - INTERVAL '6 hours')
      OR (ts.schedule_tier = 'B' AND c.last_tested_at < NOW() - INTERVAL '24 hours')
      OR (ts.schedule_tier = 'C' AND c.last_tested_at < NOW() - INTERVAL '72 hours')
    )
  GROUP BY c.slug, c.last_tested_at
  ORDER BY c.last_tested_at ASC NULLS FIRST
`;
console.log(`Production scheduler eligibility query returns: ${overdue.length} caps overdue\n`);

// 2. Compare last_tested_at to MAX(test_results.executed_at)
const divergence = await sql<Array<{
  slug: string;
  caps_last_tested: Date | null;
  results_last_executed: Date | null;
  divergence_hours: number | null;
}>>`
  SELECT
    c.slug,
    c.last_tested_at AS caps_last_tested,
    MAX(tr.executed_at) AS results_last_executed,
    EXTRACT(EPOCH FROM (c.last_tested_at - MAX(tr.executed_at))) / 3600.0 AS divergence_hours
  FROM capabilities c
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.is_active = true AND c.visible = true
  GROUP BY c.slug, c.last_tested_at
  ORDER BY ABS(EXTRACT(EPOCH FROM (c.last_tested_at - MAX(tr.executed_at)))) DESC NULLS LAST
  LIMIT 20
`;

console.log("=== Top 20 by largest divergence (capabilities.last_tested_at vs MAX(test_results.executed_at)) ===\n");
for (const d of divergence) {
  const cap = d.caps_last_tested?.toISOString().slice(0, 19) ?? "NULL";
  const res = d.results_last_executed?.toISOString().slice(0, 19) ?? "NULL";
  const hrs = d.divergence_hours !== null ? Number(d.divergence_hours).toFixed(1) : "—";
  console.log(`  ${d.slug.padEnd(38)} caps=${cap}  results=${res}  div=${hrs}h`);
}

// 3. Recent test_results count by day, last 14 days
console.log("\n=== test_results inserts per day, last 14 days ===\n");
const daily = await sql<Array<{ day: string; n: number }>>`
  SELECT
    TO_CHAR(DATE_TRUNC('day', executed_at), 'YYYY-MM-DD') AS day,
    COUNT(*)::int AS n
  FROM test_results
  WHERE executed_at >= NOW() - INTERVAL '14 days'
  GROUP BY DATE_TRUNC('day', executed_at)
  ORDER BY day DESC
`;
for (const d of daily) {
  console.log(`  ${d.day}  ${String(d.n).padStart(6)} rows`);
}

await sql.end();
process.exit(0);
