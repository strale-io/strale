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

console.log("=== Lookup tables for assessments ===");
const tabs = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%situation%' OR table_name ILIKE '%alert%' OR table_name ILIKE '%assessment%')`;
console.log("  tables:", tabs.map((r:any)=>r.table_name).join(","));

console.log("\n=== Suspended capability state ===");
const susp = await sql`
  SELECT slug, lifecycle_state, last_tested_at, matrix_sqs, freshness_level
  FROM capabilities
  WHERE lifecycle_state IN ('suspended','degraded') AND is_active = true
  ORDER BY lifecycle_state, slug
`;
const byState: Record<string, number> = {};
for (const r of susp) byState[r.lifecycle_state as string] = (byState[r.lifecycle_state as string] ?? 0) + 1;
console.log("  by state:", byState);
console.log("\n  All suspended/degraded caps:");
for (const r of susp) {
  const lt = r.last_tested_at ? new Date(r.last_tested_at as Date).toISOString().slice(0,16) : "(never)";
  console.log(`    ${(r.slug as string).padEnd(30)} state=${r.lifecycle_state} sqs=${r.matrix_sqs} fresh=${r.freshness_level} last=${lt}`);
}

if (false) {
  const events = await sql`
    SELECT trigger, severity, alert_sent, alert_suppressed, suppression_reason, created_at,
           jsonb_extract_path_text(impact, 'capabilitiesAffected') as caps_affected
    FROM situation_assessments
    WHERE created_at > NOW() - INTERVAL '4 hours'
    ORDER BY created_at DESC LIMIT 60
  `;
  console.log(`\n  Total in 4h: ${events.length}`);
  const byTrig: Record<string, { sent: number; suppressed: number }> = {};
  for (const e of events) {
    const t = e.trigger as string;
    byTrig[t] ??= { sent: 0, suppressed: 0 };
    if (e.alert_sent) byTrig[t].sent++;
    if (e.alert_suppressed) byTrig[t].suppressed++;
  }
  console.log("  By trigger:");
  for (const [t, c] of Object.entries(byTrig).sort((a,b)=>b[1].sent-a[1].sent)) {
    console.log(`    ${t.padEnd(30)} sent=${c.sent} suppressed=${c.suppressed}`);
  }
  console.log("\n  Most recent 15 sent:");
  for (const e of events.filter((x:any)=>x.alert_sent).slice(0, 15)) {
    console.log(`    ${(e.created_at as Date).toISOString()} ${(e.trigger as string).padEnd(25)} sev=${e.severity} caps=${e.caps_affected}`);
  }
}

console.log("\n=== Capabilities table column discovery ===");
const capCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'capabilities' AND (column_name LIKE '%lifecycle%' OR column_name LIKE '%suspend%' OR column_name LIKE '%state%')`;
console.log("  ", capCols.map((r:any)=>r.column_name).join(","));

console.log("\n=== Recent health_monitor_events related to alerts/lifecycle (last 4h) ===");
const ev = await sql`
  SELECT created_at, event_type, capability_slug, action_taken, details
  FROM health_monitor_events
  WHERE created_at > NOW() - INTERVAL '4 hours'
    AND (event_type ILIKE '%alert%' OR event_type ILIKE '%suspend%' OR event_type ILIKE '%lifecycle%' OR event_type ILIKE '%mass%' OR event_type ILIKE '%situation%')
  ORDER BY created_at DESC LIMIT 40
`;
const byType: Record<string, number> = {};
for (const e of ev) {
  const t = (e.event_type as string) ?? "?";
  byType[t] = (byType[t] ?? 0) + 1;
}
console.log("  By type:");
for (const [t, n] of Object.entries(byType).sort((a,b)=>b[1]-a[1])) console.log(`    ${t.padEnd(30)} ${n}`);
console.log("\n  Sample (most recent 15):");
for (const e of ev.slice(0, 15)) console.log(`    ${(e.created_at as Date).toISOString()} ${(e.event_type as string).padEnd(30)} ${e.capability_slug ?? '-'}  ${(e.action_taken as string ?? '').slice(0,80)}`);

await sql.end();
