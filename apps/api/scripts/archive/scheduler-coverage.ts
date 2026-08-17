/**
 * Diagnostic: of the 290 caps the scheduler considers eligible, how many
 * were actually tested in the last 24 hours? Identify which caps are
 * being repeatedly skipped.
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

console.log(`\n=== Distinct caps tested per recent window ===\n`);
const windows = [
  { label: "last 6h", interval: "6 hours" },
  { label: "last 24h", interval: "24 hours" },
  { label: "last 72h", interval: "72 hours" },
  { label: "last 7d", interval: "7 days" },
  { label: "last 14d", interval: "14 days" },
];
for (const w of windows) {
  const r = await sql<Array<{ n: number }>>`
    SELECT COUNT(DISTINCT capability_slug)::int AS n
    FROM test_results
    WHERE executed_at >= NOW() - INTERVAL '${sql.unsafe(w.interval)}'
  `;
  console.log(`  ${w.label.padEnd(12)} ${String(r[0]?.n ?? 0).padStart(4)} distinct caps`);
}

console.log(`\n=== Caps eligible per scheduler but NOT tested in last 7 days ===\n`);
const missed = await sql<Array<{ slug: string; last_tested_at: Date | null; tier: string; status: string | null; test_status: string | null }>>`
  SELECT
    c.slug,
    c.last_tested_at,
    MIN(ts.schedule_tier) AS tier,
    c.status::text AS status,
    string_agg(DISTINCT ts.test_status, ',') AS test_status
  FROM capabilities c
  INNER JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true AND c.visible = true
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    AND (c.last_tested_at IS NULL OR c.last_tested_at < NOW() - INTERVAL '7 days')
  GROUP BY c.slug, c.last_tested_at
  ORDER BY c.last_tested_at ASC NULLS FIRST
`;
console.log(`Total: ${missed.length} caps eligible but skipped >7d\n`);
for (const m of missed.slice(0, 40)) {
  const last = m.last_tested_at?.toISOString().slice(0, 10) ?? "NEVER";
  console.log(`  ${m.slug.padEnd(38)} last=${last} tier=${m.tier} test_status=${m.test_status} status=${m.status}`);
}
if (missed.length > 40) console.log(`  ... and ${missed.length - 40} more`);

console.log(`\n=== capabilities.status distribution for eligible-but-missed caps ===\n`);
const statusDist = await sql<Array<{ status: string; n: number }>>`
  SELECT
    COALESCE(c.status::text, 'NULL') AS status,
    COUNT(DISTINCT c.slug)::int AS n
  FROM capabilities c
  INNER JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true AND c.visible = true
    AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
    AND (c.last_tested_at IS NULL OR c.last_tested_at < NOW() - INTERVAL '7 days')
  GROUP BY c.status
  ORDER BY n DESC
`;
for (const s of statusDist) {
  console.log(`  ${s.status.padEnd(20)} ${String(s.n).padStart(4)} caps`);
}

await sql.end();
process.exit(0);
