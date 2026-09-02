#!/usr/bin/env node
// WP10 seven-day cadence acceptance gate (docs/remediation/packages/WP10.yaml).
// Read-only against production: job_schedule current state, health_monitor_events
// tick_complete counts/intervals for quality_floor and capability_promotion since
// the WP10 merge (ce5e63f, 2026-08-23T09:29Z reconciliation time), and
// upstream_escalation clustering. See WP10-RECONCILIATION.md "Seven-day
// acceptance gate" for the exact measurement this reruns.
//
// Usage: node scripts/wp10-cadence-verdict.mjs [--since <ISO ts>]
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../..", ".env") });

const sinceArg = process.argv.includes("--since")
  ? process.argv[process.argv.indexOf("--since") + 1]
  : "2026-08-23T09:29:00Z"; // WP10-RECONCILIATION.md reconciliation timestamp

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: false, prepare: false });

async function main() {
  const out = { since: sinceArg };

  out.job_schedule = await sql`
    SELECT job_name, interval_ms, next_run_at, last_started_at, last_finished_at,
           lease_owner, lease_expires_at, consecutive_failures, last_outcome, last_error
    FROM job_schedule ORDER BY job_name
  `;

  out.tick_counts_7d = await sql`
    SELECT event_type, count(*)::int AS n
    FROM health_monitor_events
    WHERE action_taken = 'tick_complete' AND created_at >= now() - interval '7 days'
    GROUP BY event_type ORDER BY event_type
  `;

  out.tick_counts_since_merge = await sql`
    SELECT event_type, count(*)::int AS n, min(created_at) AS first_seen, max(created_at) AS last_seen
    FROM health_monitor_events
    WHERE action_taken = 'tick_complete' AND created_at >= ${sinceArg}::timestamptz
    GROUP BY event_type ORDER BY event_type
  `;

  out.daily_breakdown = await sql`
    SELECT event_type, date_trunc('day', created_at) AS day, count(*)::int AS n
    FROM health_monitor_events
    WHERE action_taken = 'tick_complete' AND created_at >= ${sinceArg}::timestamptz
    GROUP BY event_type, day ORDER BY event_type, day
  `;

  out.upstream_escalation = await sql`
    SELECT date_trunc('hour', created_at) AS hr, count(*)::int AS n
    FROM health_monitor_events
    WHERE event_type = 'upstream_escalation' AND created_at >= ${sinceArg}::timestamptz
    GROUP BY hr ORDER BY hr
  `;

  // Gaps between consecutive tick_complete events, to detect a boot-relative reset
  // pattern (many small/irregular gaps) versus durable cadence (steady ~interval gaps).
  out.intervals = await sql`
    WITH ticks AS (
      SELECT event_type, created_at,
             LAG(created_at) OVER (PARTITION BY event_type ORDER BY created_at) AS prev
      FROM health_monitor_events
      WHERE action_taken = 'tick_complete' AND created_at >= ${sinceArg}::timestamptz
    )
    SELECT event_type, count(*)::int AS n_gaps,
           round(avg(extract(epoch FROM (created_at - prev)))/3600.0, 2) AS avg_hours,
           round(min(extract(epoch FROM (created_at - prev)))/3600.0, 2) AS min_hours,
           round(max(extract(epoch FROM (created_at - prev)))/3600.0, 2) AS max_hours,
           round(stddev(extract(epoch FROM (created_at - prev)))/3600.0, 2) AS stddev_hours
    FROM ticks WHERE prev IS NOT NULL
    GROUP BY event_type ORDER BY event_type
  `;

  console.log(JSON.stringify(out, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
