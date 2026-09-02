#!/usr/bin/env node
// WP9 two-week watch close (docs/remediation/packages/WP9.yaml "Two-week
// watch" section). Read-only against production. Watch opened 2026-08-22,
// baseline 0 suppressed_incomplete_evidence events as of 2026-08-22T17:22Z.
//
// Usage: node scripts/wp9-observation-close.mjs
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../..", ".env") });

const OPENED = "2026-08-22T17:22:00Z";

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: false, prepare: false });

async function main() {
  const out = { watch_opened: OPENED };

  // Primary watch signal: suppressed_incomplete_evidence events.
  out.suppressed_incomplete_evidence = await sql`
    SELECT count(*)::int AS n, min(created_at) AS first_seen, max(created_at) AS last_seen
    FROM health_monitor_events
    WHERE event_type = 'quality_floor' AND action_taken = 'suppressed_incomplete_evidence'
      AND created_at >= ${OPENED}::timestamptz
  `;

  // escalate_if condition 2: invocation_fact_write_failed events.
  out.invocation_fact_write_failed = await sql`
    SELECT count(*)::int AS n
    FROM health_monitor_events
    WHERE event_type = 'invocation_fact_write_failed' AND created_at >= ${OPENED}::timestamptz
  `;

  // escalate_if condition 3 + also_watch: facts_table_protected=false on any tick, and evidence_shortfalls seen on the daily heartbeat.
  out.tick_heartbeats = await sql`
    SELECT id, created_at,
           (details->>'facts_table_present')::boolean AS facts_table_present,
           (details->>'facts_table_protected')::boolean AS facts_table_protected,
           (details->>'evidence_holes')::int AS evidence_holes,
           (details->>'evidence_shortfalls')::int AS evidence_shortfalls,
           details->>'mode' AS mode,
           (details->>'evaluated')::int AS evaluated
    FROM health_monitor_events
    WHERE event_type = 'quality_floor' AND action_taken = 'tick_complete'
      AND created_at >= ${OPENED}::timestamptz
    ORDER BY created_at
  `;

  // also_watch condition 1: the first solution_step fact whose slug has no direct transaction traffic.
  // A solution-step fact is a capability_invocations row with context_kind indicating a step invocation
  // and no matching direct transactions.capability_id traffic for that slug in the same window.
  out.capability_invocations_present = await sql`SELECT to_regclass('public.capability_invocations') IS NOT NULL AS present`;
  if (out.capability_invocations_present[0].present) {
    out.fact_row_count = await sql`SELECT count(*)::int AS n, min(created_at) AS first_seen, max(created_at) AS last_seen FROM capability_invocations`;
    out.by_rail = await sql`
      SELECT rail, count(*)::int AS n
      FROM capability_invocations
      GROUP BY rail ORDER BY n DESC
    `;
    // Solution-step facts whose slug has NO direct (non-solution_step) transaction traffic
    // in the same window — the defect WP9 exists to close, closing.
    out.solution_step_only_slugs = await sql`
      SELECT ci.capability_slug, count(*)::int AS solution_step_facts
      FROM capability_invocations ci
      WHERE ci.rail = 'solution_step'
        AND NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.capability_id = (SELECT id FROM capabilities c WHERE c.slug = ci.capability_slug)
            AND t.created_at >= ${OPENED}::timestamptz
        )
      GROUP BY ci.capability_slug
      ORDER BY solution_step_facts DESC
    `;
  }

  // WP9's own residual: transaction_id linkage on facts (documented as RESIDUAL, not a blocker).
  if (out.capability_invocations_present[0].present) {
    out.transaction_id_null_count = await sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE transaction_id IS NULL)::int AS null_count
      FROM capability_invocations
    `;
  }

  console.log(JSON.stringify(out, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
