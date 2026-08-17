/** Verifies the loose threads from the close-out: hourly tick, chain-health events. */
import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";
config({ path: resolve(import.meta.dirname, "../../../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

console.log("=== Hourly meta-monitoring tick verification ===\n");

// Look for chain-health events in the last 90 minutes (covers 1+ hourly tick)
const events = await sql`
  SELECT event_type, COUNT(*)::int AS n, MAX(created_at) AS last_seen
  FROM health_monitor_events
  WHERE event_type LIKE 'chain_%'
    AND created_at > NOW() - INTERVAL '90 minutes'
  GROUP BY event_type
  ORDER BY event_type
`;
if (events.length === 0) {
  console.log("⚠ No chain_% events in last 90 minutes — tick may not have fired yet, or wiring is broken");
} else {
  console.log("✓ Chain-health events landing:");
  for (const r of events) {
    console.log(`   ${(r.event_type as string).padEnd(32)} n=${r.n}  last=${(r.last_seen as Date).toISOString()}`);
  }
}

// Look for any meta-monitoring events at all (regardless of chain prefix)
console.log("\n=== Recent meta-monitoring activity (last 90 min) ===\n");
const recent = await sql`
  SELECT event_type, COUNT(*)::int AS n, MAX(created_at) AS last_seen
  FROM health_monitor_events
  WHERE created_at > NOW() - INTERVAL '90 minutes'
  GROUP BY event_type
  ORDER BY n DESC
  LIMIT 20
`;
for (const r of recent) {
  console.log(`   ${(r.event_type as string).padEnd(32)} n=${r.n}  last=${(r.last_seen as Date).toISOString()}`);
}

// Confirm meta_monitoring runner is firing (per Petter's WIP CHECK_REGISTRY infra)
console.log("\n=== meta_monitoring events (should include chain_* now) ===\n");
const meta = await sql`
  SELECT details->>'check' AS check_name, COUNT(*)::int AS n, MAX(created_at) AS last_seen
  FROM health_monitor_events
  WHERE event_type = 'meta_monitoring'
    AND created_at > NOW() - INTERVAL '90 minutes'
  GROUP BY details->>'check'
  ORDER BY check_name
`;
if (meta.length === 0) {
  console.log("⚠ No meta_monitoring events in last 90 min");
} else {
  for (const r of meta) {
    console.log(`   ${((r.check_name as string) ?? "(no name)").padEnd(32)} n=${r.n}  last=${(r.last_seen as Date).toISOString()}`);
  }
}

await sql.end();
process.exit(0);
