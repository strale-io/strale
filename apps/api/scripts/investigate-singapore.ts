/**
 * Read-only investigation: why does singapore-company-data have no
 * passing test_results in the last 30 days?
 *
 * Pulls four independent slices:
 *   1. Capability row (is_active, last_tested_at, lifecycle_state).
 *   2. test_suites for the slug (active, external_cost_cents, test_status,
 *      test_type) — the gate for the new DB-driven scheduler is
 *      `external_cost_cents = 0` AND `active = true`.
 *   3. test_results last 10 rows (passed, executed_at, failure_reason).
 *   4. Aggregate of test_results in the last 30 / 90 / 365 days.
 *
 * No writes. No mutations.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

const SLUG = "singapore-company-data";

function rowsOf(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? [];
}

async function main() {
  const db = getDb();

  console.log(`\n=== 1. Capability row for '${SLUG}' ===\n`);
  const capRaw = await db.execute(sql`
    SELECT slug, is_active, lifecycle_state, last_tested_at,
           freshness_level, capability_type, created_at
    FROM capabilities
    WHERE slug = ${SLUG}
  `);
  console.table(rowsOf(capRaw));

  console.log(`\n=== 2. test_suites rows for '${SLUG}' ===\n`);
  const suitesRaw = await db.execute(sql`
    SELECT id, test_name, test_type, active, schedule_tier, test_status,
           external_cost_cents, test_mode, last_classification, updated_at
    FROM test_suites
    WHERE capability_slug = ${SLUG}
    ORDER BY test_type, test_name
  `);
  console.table(rowsOf(suitesRaw));

  console.log(`\n=== 3. Last 10 test_results for '${SLUG}' ===\n`);
  const resultsRaw = await db.execute(sql`
    SELECT id, test_suite_id, passed, executed_at, response_time_ms,
           failure_classification,
           LEFT(COALESCE(failure_reason, ''), 240) AS failure_reason_excerpt
    FROM test_results
    WHERE capability_slug = ${SLUG}
    ORDER BY executed_at DESC
    LIMIT 10
  `);
  const resultsRows = rowsOf(resultsRaw);
  console.table(resultsRows);

  console.log(`\n=== 4. test_results aggregates ===\n`);
  const aggRaw = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_all_time,
      COUNT(*) FILTER (WHERE passed = true)::int AS passed_all_time,
      COUNT(*) FILTER (WHERE executed_at > NOW() - INTERVAL '30 days')::int AS total_30d,
      COUNT(*) FILTER (WHERE passed = true AND executed_at > NOW() - INTERVAL '30 days')::int AS passed_30d,
      COUNT(*) FILTER (WHERE executed_at > NOW() - INTERVAL '90 days')::int AS total_90d,
      COUNT(*) FILTER (WHERE passed = true AND executed_at > NOW() - INTERVAL '90 days')::int AS passed_90d,
      MAX(executed_at) AS most_recent,
      MAX(executed_at) FILTER (WHERE passed = true) AS most_recent_passing
    FROM test_results
    WHERE capability_slug = ${SLUG}
  `);
  console.table(rowsOf(aggRaw));

  console.log(`\n=== 5. Comparison: peer recently-shipped FREE caps (lv-/lt-/ie-) ===\n`);
  const peerRaw = await db.execute(sql`
    SELECT
      c.slug,
      c.is_active,
      c.last_tested_at,
      COUNT(ts.id) FILTER (WHERE ts.active = true)::int AS active_suites,
      MIN(ts.external_cost_cents)::int AS min_cost_cents,
      MAX(ts.external_cost_cents)::int AS max_cost_cents,
      (SELECT COUNT(*) FROM test_results tr
        WHERE tr.capability_slug = c.slug
          AND tr.executed_at > NOW() - INTERVAL '30 days')::int AS results_30d,
      (SELECT COUNT(*) FROM test_results tr
        WHERE tr.capability_slug = c.slug
          AND tr.passed = true
          AND tr.executed_at > NOW() - INTERVAL '30 days')::int AS passed_30d
    FROM capabilities c
    LEFT JOIN test_suites ts ON ts.capability_slug = c.slug
    WHERE c.slug IN (
      'singapore-company-data',
      'lv-company-data',
      'lt-company-data',
      'ireland-company-data',
      'czech-company-data',
      'estonia-company-data'
    )
    GROUP BY c.slug, c.is_active, c.last_tested_at
    ORDER BY c.slug
  `);
  console.table(rowsOf(peerRaw));

  console.log(`\n=== 6. Scheduler-gate dry-run for '${SLUG}' ===\n`);
  // Mirrors findOverdueCapabilities() in jobs/test-scheduler.ts but without
  // the per-minute hashtext stagger filter — answers "would the scheduler
  // ever pick this up if the timing aligned?"
  const gateRaw = await db.execute(sql`
    SELECT
      c.slug,
      c.is_active                    AS cap_is_active,
      c.last_tested_at,
      ts.active                      AS suite_active,
      ts.external_cost_cents,
      ts.test_status,
      ts.test_type,
      (abs(hashtext(c.slug)) % 60)   AS stagger_minute,
      EXTRACT(MINUTE FROM NOW())::int AS current_minute,
      (c.is_active = true
        AND ts.active = true
        AND ts.scheduled_testing_eligible = TRUE
      )                              AS would_be_picked_if_overdue
    FROM capabilities c
    LEFT JOIN test_suites ts ON ts.capability_slug = c.slug
    WHERE c.slug = ${SLUG}
  `);
  console.table(rowsOf(gateRaw));

  console.log("\nDone. No writes performed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
