import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. Count by SQS bucket
  const buckets = await sql`
    SELECT
      CASE
        WHEN sqs_score IS NULL OR sqs_score = 0 THEN 'pending/zero'
        WHEN sqs_score >= 90 THEN 'excellent'
        WHEN sqs_score >= 75 THEN 'good'
        WHEN sqs_score >= 50 THEN 'fair'
        ELSE 'poor'
      END as bucket,
      COUNT(*) as count
    FROM capabilities
    WHERE is_active = true
    GROUP BY bucket
    ORDER BY count DESC`;
  console.log("=== SQS distribution ===");
  console.log(JSON.stringify(buckets, null, 2));

  // 2. Check capabilities with column sqs_score vs no score, and also qp_score/rp_score
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'capabilities'
    AND column_name IN ('sqs_score','qp_score','rp_score','matrix_sqs','qp_grade','rp_grade')
    ORDER BY column_name`;
  console.log("\n=== Cached score columns ===");
  console.log(JSON.stringify(cols, null, 2));

  // 3. Count recent test runs
  const testActivity = await sql`
    SELECT
      COUNT(DISTINCT capability_slug) as caps_with_tests,
      COUNT(*) as total_results,
      MAX(executed_at) as most_recent
    FROM test_results
    WHERE executed_at >= NOW() - INTERVAL '30 days'`;
  console.log("\n=== Test activity (30d) ===");
  console.log(JSON.stringify(testActivity, null, 2));

  // 4. Capabilities with ZERO test results in 30 days
  const noTests = await sql`
    SELECT c.slug
    FROM capabilities c
    LEFT JOIN test_results tr ON tr.capability_slug = c.slug
      AND tr.executed_at >= NOW() - INTERVAL '30 days'
    WHERE c.is_active = true
    GROUP BY c.slug
    HAVING COUNT(tr.id) = 0
    LIMIT 10`;
  console.log("\n=== Sample caps with NO test results (30d) ===");
  console.log(JSON.stringify(noTests, null, 2));

  // 5. How many caps have < 2 distinct run windows (MIN_RUNS threshold)
  const fewRuns = await sql`
    SELECT COUNT(*) as cap_count
    FROM (
      SELECT capability_slug, COUNT(DISTINCT DATE_TRUNC('hour', executed_at)) as run_windows
      FROM test_results
      WHERE executed_at >= NOW() - INTERVAL '30 days'
      GROUP BY capability_slug
      HAVING COUNT(DISTINCT DATE_TRUNC('hour', executed_at)) < 2
    ) sub`;
  console.log("\n=== Caps with < 2 distinct run windows (30d) ===");
  console.log(JSON.stringify(fewRuns, null, 2));

  // 6. Sample capabilities with recent tests - check if sqs_score is populated
  const sample = await sql`
    SELECT c.slug, c.sqs_score, c.matrix_sqs, c.qp_score, c.rp_score,
      COUNT(tr.id) as test_count,
      MAX(tr.executed_at) as last_test
    FROM capabilities c
    LEFT JOIN test_results tr ON tr.capability_slug = c.slug
      AND tr.executed_at >= NOW() - INTERVAL '30 days'
    WHERE c.is_active = true
    GROUP BY c.slug, c.sqs_score, c.matrix_sqs, c.qp_score, c.rp_score
    ORDER BY test_count DESC
    LIMIT 10`;
  console.log("\n=== Most-tested caps with scores ===");
  console.log(JSON.stringify(sample, null, 2));

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
