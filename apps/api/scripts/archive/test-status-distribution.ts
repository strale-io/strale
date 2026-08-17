/**
 * Diagnostic: distribution of test_suites.test_status across active caps.
 *
 * Production test-scheduler.ts (pre-WIP-refactor) filters its eligibility
 * query to test_status IN ('normal', 'env_dependent', 'upstream_broken').
 * Any test_suites row with a status outside that whitelist silently
 * excludes its parent capability from scheduling.
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

console.log(`\n=== test_suites.test_status distribution ===\n`);
const dist = await sql<Array<{ test_status: string; n: number }>>`
  SELECT test_status, COUNT(*)::int AS n
  FROM test_suites
  WHERE active = true
  GROUP BY test_status
  ORDER BY n DESC
`;
for (const r of dist) {
  console.log(`  ${(r.test_status ?? "NULL").padEnd(20)} ${String(r.n).padStart(5)}`);
}

console.log(`\n=== Caps with NO test suite in scheduler whitelist ===`);
console.log(`(scheduler filters test_status IN ('normal', 'env_dependent', 'upstream_broken'))\n`);
const excluded = await sql<Array<{ slug: string; statuses: string }>>`
  SELECT
    c.slug,
    string_agg(DISTINCT COALESCE(ts.test_status, 'NULL'), ',') AS statuses
  FROM capabilities c
  INNER JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true AND c.visible = true
  GROUP BY c.slug
  HAVING NOT bool_or(ts.test_status IN ('normal', 'env_dependent', 'upstream_broken'))
  ORDER BY c.slug
`;

console.log(`Total: ${excluded.length} caps excluded from scheduler eligibility\n`);
for (const c of excluded.slice(0, 30)) {
  console.log(`  - ${c.slug.padEnd(35)} statuses=${c.statuses}`);
}
if (excluded.length > 30) console.log(`  ... and ${excluded.length - 30} more`);

console.log(`\n=== Caps with mixed statuses (some in whitelist, some not) ===\n`);
const mixed = await sql<Array<{ slug: string; whitelisted: number; nonwhitelisted: number }>>`
  SELECT
    c.slug,
    SUM(CASE WHEN ts.test_status IN ('normal', 'env_dependent', 'upstream_broken') THEN 1 ELSE 0 END)::int AS whitelisted,
    SUM(CASE WHEN ts.test_status NOT IN ('normal', 'env_dependent', 'upstream_broken') OR ts.test_status IS NULL THEN 1 ELSE 0 END)::int AS nonwhitelisted
  FROM capabilities c
  INNER JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true AND c.visible = true
  GROUP BY c.slug
  HAVING SUM(CASE WHEN ts.test_status IN ('normal', 'env_dependent', 'upstream_broken') THEN 1 ELSE 0 END) > 0
     AND SUM(CASE WHEN ts.test_status NOT IN ('normal', 'env_dependent', 'upstream_broken') OR ts.test_status IS NULL THEN 1 ELSE 0 END) > 0
  ORDER BY c.slug
  LIMIT 20
`;
console.log(`Total: ${mixed.length} caps with mixed statuses (limit 20 shown)`);
for (const c of mixed) {
  console.log(`  - ${c.slug.padEnd(35)} whitelisted=${c.whitelisted} other=${c.nonwhitelisted}`);
}

await sql.end();
process.exit(0);
