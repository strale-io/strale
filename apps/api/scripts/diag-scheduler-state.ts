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

console.log("=== Most recent browserless probes (last 5) ===");
const probes = await sql`
  SELECT created_at, details FROM health_monitor_events
  WHERE event_type='dependency_probe' AND details->>'dependency'='browserless'
  ORDER BY created_at DESC LIMIT 5
`;
for (const r of probes) console.log(`  ${(r.created_at as Date).toISOString()} ${JSON.stringify(r.details)}`);

console.log("\n=== test_results in last 6 hours (by capability) ===");
const recent = await sql`
  SELECT capability_slug, COUNT(*)::int AS n, MAX(executed_at) AS last
  FROM test_results
  WHERE executed_at > NOW() - INTERVAL '6 hours'
  GROUP BY capability_slug
  ORDER BY last DESC
`;
for (const r of recent) console.log(`  ${r.capability_slug.padEnd(40)} n=${r.n} last=${(r.last as Date).toISOString()}`);
console.log(`Total distinct caps tested in last 6h: ${recent.length}`);

console.log("\n=== Specific caps state ===");
const slugs = ["xrp-address-validate","solana-address-validate","iban-validate","forex-history","dns-lookup","email-validate","bitcoin-address-validate"];
const specific = await sql`
  SELECT slug, last_tested_at, matrix_sqs, qp_score, rp_score, freshness_level, is_active, visible
  FROM capabilities WHERE slug = ANY(${slugs})
`;
for (const r of specific) console.log(`  ${(r.slug as string).padEnd(30)} last=${r.last_tested_at} matrix=${r.matrix_sqs} sqs=${r.sqs_score} ${r.sqs_label} fresh=${r.freshness_level} active=${r.is_active}/${r.visible}`);

console.log("\n=== cap.last_tested_at vs MAX(test_results.executed_at) drift (>1h, last 24h activity) ===");
const drift = await sql`
  SELECT
    c.slug,
    c.last_tested_at AS cap_lt,
    MAX(tr.executed_at) AS result_lt,
    EXTRACT(EPOCH FROM (MAX(tr.executed_at) - c.last_tested_at)) / 3600.0 AS hours_diff
  FROM capabilities c
  LEFT JOIN test_results tr ON tr.capability_slug = c.slug
  WHERE c.is_active = true
    AND tr.executed_at > NOW() - INTERVAL '24 hours'
  GROUP BY c.slug, c.last_tested_at
  HAVING MAX(tr.executed_at) - c.last_tested_at > INTERVAL '1 hour' OR c.last_tested_at IS NULL
  ORDER BY hours_diff DESC NULLS LAST
  LIMIT 20
`;
for (const r of drift) console.log(`  ${(r.slug as string).padEnd(30)} cap_lt=${r.cap_lt} result_lt=${(r.result_lt as Date | null)?.toISOString()} drift=${r.hours_diff}h`);

console.log("\n=== Top 20 head of scheduler queue (replicates findOverdueCapabilities) ===");
const head = await sql`
  SELECT
    c.slug,
    c.last_tested_at,
    MIN(ts.schedule_tier) AS tier,
    STRING_AGG(DISTINCT ts.test_status, ',') AS statuses
  FROM capabilities c
  INNER JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true
    AND (
      c.last_tested_at IS NULL
      OR c.last_tested_at < NOW() - GREATEST(
        CASE ts.schedule_tier WHEN 'A' THEN INTERVAL '6 hours' WHEN 'B' THEN INTERVAL '24 hours' WHEN 'C' THEN INTERVAL '72 hours' ELSE INTERVAL '24 hours' END,
        CASE ts.test_status WHEN 'upstream_broken' THEN INTERVAL '24 hours' WHEN 'infra_limited' THEN INTERVAL '24 hours' WHEN 'quarantined' THEN INTERVAL '168 hours' ELSE INTERVAL '0 hours' END
      )
    )
  GROUP BY c.slug, c.last_tested_at
  ORDER BY c.last_tested_at ASC NULLS FIRST
  LIMIT 20
`;
for (const r of head) console.log(`  ${(r.slug as string).padEnd(35)} last=${r.last_tested_at} tier=${r.tier} statuses=${r.statuses}`);

console.log("\n=== Provider health snapshot (health_monitor_events, last 2h) ===");
const ev_cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'health_monitor_events'`;
console.log("  columns:", ev_cols.map(r => r.column_name).join(","));
const events = await sql`SELECT * FROM health_monitor_events ORDER BY 1 DESC LIMIT 5`;
console.log("  sample row keys:", events[0] ? Object.keys(events[0]).join(",") : "(none)");

console.log("\n=== Browserless probe history (last 10) ===");
const probeTables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND (table_name ILIKE '%dependency%' OR table_name ILIKE '%provider%' OR table_name ILIKE '%probe%')
`;
console.log("  candidate tables:", probeTables.map((r:any)=>r.table_name).join(","));

console.log("\n=== Last health_monitor_events for browserless / scheduler ===");
const evs = await sql`
  SELECT created_at, event_type, capability_slug, details
  FROM health_monitor_events
  WHERE created_at > NOW() - INTERVAL '4 hours'
    AND (event_type ILIKE '%browserless%' OR event_type ILIKE '%scheduler%' OR event_type ILIKE '%dependency%' OR capability_slug ILIKE '%browserless%' OR details::text ILIKE '%browserless%')
  ORDER BY created_at DESC LIMIT 20
`;
for (const r of evs) console.log(`  ${(r.created_at as Date).toISOString()} ${(r.event_type as string).padEnd(35)} ${r.capability_slug || ''} ${JSON.stringify(r.details).slice(0,140)}`);

console.log("\n=== Overdue queue depth ===");
const depth = await sql`
  SELECT COUNT(DISTINCT c.slug)::int AS overdue_total
  FROM capabilities c
  INNER JOIN test_suites ts ON ts.capability_slug = c.slug AND ts.active = true
  WHERE c.is_active = true
    AND (
      c.last_tested_at IS NULL
      OR c.last_tested_at < NOW() - GREATEST(
        CASE ts.schedule_tier WHEN 'A' THEN INTERVAL '6 hours' WHEN 'B' THEN INTERVAL '24 hours' WHEN 'C' THEN INTERVAL '72 hours' ELSE INTERVAL '24 hours' END,
        CASE ts.test_status WHEN 'upstream_broken' THEN INTERVAL '24 hours' WHEN 'infra_limited' THEN INTERVAL '24 hours' WHEN 'quarantined' THEN INTERVAL '168 hours' ELSE INTERVAL '0 hours' END
      )
    )
`;
console.log(`  overdue_total = ${depth[0]?.overdue_total}`);

await sql.end();
