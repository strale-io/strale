/**
 * Quick truth-check: have any browserless-dependent caps been tested
 * recently? If yes, the production browserless probe is healthy at least
 * intermittently, and the "perpetually starved by unhealthy provider"
 * theory was a local-env false positive.
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
import { getActiveProviders } from "../src/lib/dependency-manifest.js";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const providers = getActiveProviders();
const browserless = providers.find((p) => p.name === "browserless");
const companiesHouse = providers.find((p) => p.name === "companies-house");

if (!browserless) { console.log("no browserless provider"); process.exit(1); }

console.log(`\n=== Test recency for browserless-dependent caps (${browserless.capabilities.length}) ===\n`);
const browserlessRecency = await sql<Array<{ slug: string; last: Date | null; n7d: number }>>`
  SELECT
    c.slug,
    MAX(tr.executed_at) AS last,
    SUM(CASE WHEN tr.executed_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS n7d
  FROM capabilities c
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.slug = ANY(${browserless.capabilities})
  GROUP BY c.slug
  ORDER BY MAX(tr.executed_at) DESC NULLS LAST
`;

const tested7d = browserlessRecency.filter((r) => r.n7d > 0);
const stale = browserlessRecency.filter((r) => r.n7d === 0);

console.log(`Tested in last 7 days: ${tested7d.length} caps`);
for (const r of tested7d.slice(0, 10)) {
  console.log(`  ${r.slug.padEnd(35)} last=${r.last?.toISOString().slice(0, 19)}  inserts7d=${r.n7d}`);
}

console.log(`\nNOT tested in last 7 days: ${stale.length} caps`);
console.log("  (sample, oldest first)");
const staleByOldest = [...stale].sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0));
for (const r of staleByOldest.slice(0, 10)) {
  console.log(`  ${r.slug.padEnd(35)} last=${r.last?.toISOString().slice(0, 19) ?? "NEVER"}`);
}

if (companiesHouse) {
  console.log(`\n=== Test recency for companies-house caps (${companiesHouse.capabilities.length}) ===\n`);
  const chRecency = await sql<Array<{ slug: string; last: Date | null; n7d: number }>>`
    SELECT
      c.slug, MAX(tr.executed_at) AS last,
      SUM(CASE WHEN tr.executed_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS n7d
    FROM capabilities c LEFT JOIN test_results tr ON tr.capability_slug = c.slug
    WHERE c.slug = ANY(${companiesHouse.capabilities})
    GROUP BY c.slug
  `;
  for (const r of chRecency) {
    console.log(`  ${r.slug.padEnd(35)} last=${r.last?.toISOString().slice(0, 19) ?? "NEVER"}  inserts7d=${r.n7d}`);
  }
}

await sql.end();
process.exit(0);
