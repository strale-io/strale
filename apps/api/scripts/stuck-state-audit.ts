/**
 * Audit for caps that could exhibit the same scheduler-starvation pattern
 * as ecb-interest-rates. Three risk classes:
 *
 * 1. capabilities.last_tested_at significantly older than MAX(test_results.executed_at)
 *    — the exact ECB pattern (last_tested_at frozen, test_results writing).
 *
 * 2. capabilities.matrix_sqs IS NULL (pending) AND test_results inserts in the
 *    last 24h — caps that the persistDualProfileScores fix is most relevant
 *    for. After the fix deploys, these should recover; before, they're at risk.
 *
 * 3. capabilities.last_tested_at IS NULL AND no test_results ever — caps that
 *    have NEVER been successfully tested. NULLS FIRST in the scheduler ORDER
 *    BY puts them at the head of the queue. If they fail every test, they
 *    stay there forever (the persistDualProfileScores fix only advances
 *    last_tested_at if there IS a test_result; with zero results, no advance).
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
    if (line.startsWith("DATABASE_URL=")) { process.env.DATABASE_URL = line.substring("DATABASE_URL=".length); break; }
  }
}

import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

console.log(`\n=== Risk class 1: last_tested_at frozen vs test_results advancing ===\n`);
const class1 = await sql<Array<{
  slug: string; cap_tested: Date | null; results_last: Date | null; div_hours: string | null; results_in_last_24h: number;
}>>`
  SELECT
    c.slug,
    c.last_tested_at AS cap_tested,
    MAX(tr.executed_at) AS results_last,
    EXTRACT(EPOCH FROM (MAX(tr.executed_at) - c.last_tested_at)) / 3600.0 AS div_hours,
    SUM(CASE WHEN tr.executed_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int AS results_in_last_24h
  FROM capabilities c
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.is_active = true AND c.visible = true
  GROUP BY c.slug, c.last_tested_at
  HAVING MAX(tr.executed_at) > COALESCE(c.last_tested_at, '1970-01-01'::timestamptz) + INTERVAL '6 hours'
  ORDER BY MAX(tr.executed_at) - COALESCE(c.last_tested_at, '1970-01-01'::timestamptz) DESC
  LIMIT 20
`;
if (class1.length === 0) {
  console.log("  (none — clean)");
} else {
  for (const r of class1) {
    const cap = r.cap_tested?.toISOString().slice(0, 19) ?? "NULL";
    const res = r.results_last?.toISOString().slice(0, 19) ?? "NULL";
    const div = r.div_hours ? Number(r.div_hours).toFixed(1) : "—";
    console.log(`  ${r.slug.padEnd(35)} cap=${cap}  results=${res}  div=${div}h  recent24h=${r.results_in_last_24h}`);
  }
}

console.log(`\n=== Risk class 2: matrix_sqs IS NULL with recent test_results inserts ===\n`);
const class2 = await sql<Array<{ slug: string; matrix_sqs: string | null; results_last_24h: number; results_total: number }>>`
  SELECT
    c.slug,
    c.matrix_sqs::text,
    SUM(CASE WHEN tr.executed_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int AS results_last_24h,
    COUNT(tr.id)::int AS results_total
  FROM capabilities c
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.is_active = true AND c.visible = true AND c.matrix_sqs IS NULL
  GROUP BY c.slug, c.matrix_sqs
  HAVING SUM(CASE WHEN tr.executed_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) > 0
  ORDER BY results_last_24h DESC
`;
if (class2.length === 0) {
  console.log("  (none — clean)");
} else {
  console.log(`  ${class2.length} cap(s) with NULL matrix_sqs but recent test inserts:`);
  for (const r of class2) {
    console.log(`  ${r.slug.padEnd(35)} matrix_sqs=NULL last24h=${r.results_last_24h} total=${r.results_total}`);
  }
}

console.log(`\n=== Risk class 3: NULL last_tested_at AND zero test_results ever ===\n`);
const class3 = await sql<Array<{ slug: string }>>`
  SELECT c.slug
  FROM capabilities c
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.is_active = true AND c.visible = true AND c.last_tested_at IS NULL
  GROUP BY c.slug
  HAVING COUNT(tr.id) = 0
  ORDER BY c.slug
`;
if (class3.length === 0) {
  console.log("  (none — clean)");
} else {
  console.log(`  ${class3.length} cap(s) never tested:`);
  for (const r of class3) console.log(`    ${r.slug}`);
}

console.log(`\n=== Provider-skip caps (perpetually filtered by health check) ===\n`);
const browserlessHealth = await sql<Array<{ slug: string; last_tested_at: Date | null }>>`
  SELECT slug, last_tested_at FROM capabilities WHERE is_active = true AND slug IN (
    'accessibility-audit', 'amazon-price', 'annual-report-extract',
    'australian-company-data', 'austrian-company-data'
  )
`;
console.log(`  Sample of browserless-dependent caps (probe currently flags browserless unhealthy):`);
for (const r of browserlessHealth) {
  const last = r.last_tested_at?.toISOString().slice(0, 10) ?? "NULL";
  console.log(`    ${r.slug.padEnd(35)} last_tested=${last}`);
}

console.log(`\n=== Recovery progress: caps tested in last 30 minutes ===\n`);
const recovery = await sql<Array<{ slug: string; n: number; last: Date }>>`
  SELECT capability_slug AS slug, COUNT(*)::int AS n, MAX(executed_at) AS last
  FROM test_results
  WHERE executed_at >= NOW() - INTERVAL '30 minutes'
  GROUP BY capability_slug
  ORDER BY last DESC
`;
if (recovery.length === 0) {
  console.log("  (none yet — scheduler not yet picked up new work)");
} else {
  for (const r of recovery) {
    console.log(`  ${r.slug.padEnd(35)} n=${r.n}  last=${r.last.toISOString().slice(11, 19)}`);
  }
}

await sql.end();
process.exit(0);
