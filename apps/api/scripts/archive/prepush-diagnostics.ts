/**
 * Pre-push diagnostics for PR1 (SQS deletion).
 * Read-only. Two queries:
 *   A. Lifecycle state distribution — predicts how many capabilities are
 *      stuck in degraded/suspended after auto-transitions are removed.
 *   B. Solutions cascade prediction — predicts how many currently-active
 *      solutions the new "every step has a passing test_result in 30d"
 *      gate would deactivate on the next test scheduler tick.
 *
 * Usage: npx tsx scripts/prepush-diagnostics.ts
 *
 * Schema deltas vs the prompt's assumed names (verified against schema.ts):
 *   - solution_steps links to solutions via solution_id (UUID), not solution_slug.
 *   - test_results columns are `passed` (bool) and `executed_at` (timestamptz),
 *     not `success` / `created_at`.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();

  console.log("=== Check A — lifecycle state distribution ===\n");
  const lifecycleRaw = await db.execute(sql`
    SELECT lifecycle_state, COUNT(*)::int AS count
    FROM capabilities
    WHERE is_active = true
    GROUP BY lifecycle_state
    ORDER BY count DESC
  `);
  const lifecycleRows = (
    Array.isArray(lifecycleRaw) ? lifecycleRaw : (lifecycleRaw as { rows?: unknown[] }).rows ?? []
  ) as Array<{ lifecycle_state: string; count: number }>;
  console.table(lifecycleRows);

  console.log("\n=== Check B — solutions cascade prediction ===\n");
  // Predicate: solution is currently is_active=true AND any of its step
  // capabilities has zero passing test_results in the last 30 days.
  // Joins through solution_id (UUID) per actual schema.
  const cascadeRaw = await db.execute(sql`
    WITH step_passing_30d AS (
      SELECT
        ss.solution_id,
        ss.capability_slug,
        COUNT(tr.id) FILTER (
          WHERE tr.passed = true
            AND tr.executed_at > NOW() - INTERVAL '30 days'
        ) AS passing_recent
      FROM solution_steps ss
      LEFT JOIN test_results tr ON tr.capability_slug = ss.capability_slug
      GROUP BY ss.solution_id, ss.capability_slug
    ),
    solutions_with_dead_step AS (
      SELECT DISTINCT solution_id
      FROM step_passing_30d
      WHERE passing_recent = 0
    ),
    summary AS (
      SELECT
        (SELECT COUNT(*)::int FROM solutions WHERE is_active = true) AS currently_active_total,
        (SELECT COUNT(*)::int FROM solutions s
          JOIN solutions_with_dead_step swds ON swds.solution_id = s.id
          WHERE s.is_active = true) AS would_deactivate
    )
    SELECT
      currently_active_total,
      would_deactivate,
      ROUND(100.0 * would_deactivate / NULLIF(currently_active_total, 0), 1) AS pct_would_deactivate
    FROM summary
  `);
  const cascadeRows = (
    Array.isArray(cascadeRaw) ? cascadeRaw : (cascadeRaw as { rows?: unknown[] }).rows ?? []
  ) as Array<{
    currently_active_total: number;
    would_deactivate: number;
    pct_would_deactivate: string | number | null;
  }>;
  console.table(cascadeRows);

  // List a sample of which solutions would be deactivated (top 10) so the
  // operator can spot-check whether the cascade is benign.
  console.log("\n=== Check B — sample of solutions that would be deactivated ===\n");
  const sampleRaw = await db.execute(sql`
    WITH step_passing_30d AS (
      SELECT
        ss.solution_id,
        ss.capability_slug,
        COUNT(tr.id) FILTER (
          WHERE tr.passed = true
            AND tr.executed_at > NOW() - INTERVAL '30 days'
        ) AS passing_recent
      FROM solution_steps ss
      LEFT JOIN test_results tr ON tr.capability_slug = ss.capability_slug
      GROUP BY ss.solution_id, ss.capability_slug
    )
    SELECT
      s.slug AS solution_slug,
      ARRAY_AGG(spd.capability_slug ORDER BY spd.capability_slug)
        FILTER (WHERE spd.passing_recent = 0) AS dead_steps
    FROM solutions s
    JOIN step_passing_30d spd ON spd.solution_id = s.id
    WHERE s.is_active = true
    GROUP BY s.id, s.slug
    HAVING COUNT(*) FILTER (WHERE spd.passing_recent = 0) > 0
    ORDER BY s.slug
    LIMIT 15
  `);
  const sampleRows = (
    Array.isArray(sampleRaw) ? sampleRaw : (sampleRaw as { rows?: unknown[] }).rows ?? []
  ) as Array<{ solution_slug: string; dead_steps: string[] }>;
  for (const row of sampleRows) {
    console.log(`  ${row.solution_slug}  →  dead steps: ${(row.dead_steps ?? []).join(", ")}`);
  }
  if (sampleRows.length === 0) {
    console.log("  (none)");
  }

  console.log("\nDone. No writes performed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
