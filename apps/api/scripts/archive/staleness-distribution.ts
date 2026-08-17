/**
 * Diagnostic: how widespread is test-staleness across active capabilities?
 *
 * For every active capability, fetches the last test execution time, applies
 * the same computeFreshnessDecay logic the SQS engine uses, and reports
 * the staleness distribution. If a meaningful share of caps are
 * unverified/expired, the production test scheduler likely isn't running
 * the expected cadence.
 *
 * Usage: cd apps/api && npx tsx scripts/staleness-distribution.ts
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
import { computeFreshnessDecay, type StalenessLevel } from "../src/lib/freshness-decay.js";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const TIER_HOURS: Record<string, number> = {
  A: 6,
  B: 24,
  C: 72,
};

const rows = await sql<Array<{
  slug: string;
  schedule_tier: string | null;
  last_executed_at: Date | null;
}>>`
  SELECT
    c.slug,
    COALESCE(MIN(ts.schedule_tier), 'B') as schedule_tier,
    MAX(tr.executed_at) as last_executed_at
  FROM capabilities c
  LEFT JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.is_active = true AND c.visible = true
  GROUP BY c.slug
  ORDER BY c.slug
`;

const buckets: Record<StalenessLevel, Array<{ slug: string; tier: string; intervals_overdue: number; last_tested_at: string | null }>> = {
  fresh: [], aging: [], stale: [], expired: [], unverified: [],
};

for (const row of rows) {
  const tier = (row.schedule_tier ?? "B").toUpperCase();
  const tierHours = TIER_HOURS[tier] ?? 24;
  const lastTested = row.last_executed_at ? new Date(row.last_executed_at) : null;
  const fr = computeFreshnessDecay(lastTested, tierHours);
  buckets[fr.staleness_level].push({
    slug: row.slug,
    tier,
    intervals_overdue: fr.intervals_overdue === Infinity ? -1 : fr.intervals_overdue,
    last_tested_at: fr.last_tested_at,
  });
}

const total = rows.length;
console.log(`\n=== Staleness distribution across ${total} active+visible capabilities ===\n`);
const order: StalenessLevel[] = ["fresh", "aging", "stale", "expired", "unverified"];
for (const level of order) {
  const n = buckets[level].length;
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  const symbol = level === "fresh" ? "✓" : level === "aging" ? "·" : level === "stale" ? "~" : level === "expired" ? "!" : "✗";
  console.log(`  [${symbol}] ${level.padEnd(11)} ${String(n).padStart(4)} (${pct}%)`);
}

console.log("\n=== Caps in trouble ===\n");
console.log(`unverified (forced-0, BLOCKED on /v1/do): ${buckets.unverified.length}`);
for (const c of buckets.unverified.slice(0, 30)) {
  console.log(`  - ${c.slug} [tier ${c.tier}] last_tested=${c.last_tested_at ?? "never"}`);
}
if (buckets.unverified.length > 30) console.log(`  ... and ${buckets.unverified.length - 30} more`);

console.log(`\nexpired (decayed, floor 50, at risk of crossing into unverified): ${buckets.expired.length}`);
for (const c of buckets.expired.slice(0, 30)) {
  console.log(`  - ${c.slug} [tier ${c.tier}] intervals_overdue=${c.intervals_overdue}`);
}
if (buckets.expired.length > 30) console.log(`  ... and ${buckets.expired.length - 30} more`);

console.log(`\nstale (decayed below raw): ${buckets.stale.length}`);
if (buckets.stale.length <= 30) {
  for (const c of buckets.stale) {
    console.log(`  - ${c.slug} [tier ${c.tier}] intervals_overdue=${c.intervals_overdue}`);
  }
} else {
  console.log(`  (${buckets.stale.length} caps — listing first 10)`);
  for (const c of buckets.stale.slice(0, 10)) {
    console.log(`  - ${c.slug} [tier ${c.tier}] intervals_overdue=${c.intervals_overdue}`);
  }
}

await sql.end();
process.exit(0);
