/**
 * One-off script: reclassify existing "unknown" test results using the
 * updated failure classifier patterns.
 *
 * Usage: npx tsx scripts/reclassify-unknowns.ts [--dry-run]
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { testResults, testSuites, capabilities } from "../src/db/schema.js";
import { classifyFailure } from "../src/lib/failure-classifier.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log(`[reclassify] ${DRY_RUN ? "DRY RUN — " : ""}Loading unknown failures from last 30 days...`);

  // Load unknown results with their suite + capability context
  const unknowns = await db.execute(sql`
    SELECT
      tr.id,
      tr.failure_reason,
      tr.capability_slug,
      tr.passed,
      tr.actual_output IS NOT NULL AS has_output,
      ts.test_type,
      ts.input AS test_input,
      ts.last_classification,
      c.capability_type
    FROM test_results tr
    JOIN test_suites ts ON tr.test_suite_id = ts.id
    JOIN capabilities c ON c.slug = tr.capability_slug
    WHERE tr.failure_classification = 'unknown'
      AND tr.executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    ORDER BY tr.executed_at DESC
  `);

  const rows = (Array.isArray(unknowns) ? unknowns : (unknowns as any)?.rows ?? []) as any[];
  console.log(`[reclassify] Found ${rows.length} unknown failures`);

  const counts: Record<string, number> = {};
  let reclassified = 0;

  for (const row of rows) {
    const failureReason = row.failure_reason ?? "";
    const testInput = (typeof row.test_input === "string" ? JSON.parse(row.test_input) : row.test_input) ?? {};
    const hasOutput = row.has_output;
    const previouslyPassed = row.last_classification
      ? (typeof row.last_classification === "string" ? JSON.parse(row.last_classification) : row.last_classification)?.verdict !== "test_design"
      : false;

    // Reconstruct executionSucceeded / validationFailed from context
    const executionSucceeded = hasOutput;
    const validationFailed = hasOutput && !row.passed;

    const result = classifyFailure(
      failureReason,
      executionSucceeded,
      validationFailed,
      row.test_type,
      testInput,
      previouslyPassed,
      row.capability_type,
    );

    counts[result.verdict] = (counts[result.verdict] ?? 0) + 1;

    if (result.verdict !== "unknown") {
      reclassified++;
      if (!DRY_RUN) {
        await db
          .update(testResults)
          .set({ failureClassification: result.verdict })
          .where(eq(testResults.id, row.id));
      }
    }
  }

  console.log(`\n[reclassify] Results:`);
  console.log(`  Total unknowns analyzed: ${rows.length}`);
  console.log(`  Reclassified: ${reclassified} (${((reclassified / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  Still unknown: ${rows.length - reclassified}`);
  console.log(`\n  New distribution:`);
  for (const [verdict, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${verdict}: ${count}`);
  }

  if (DRY_RUN) {
    console.log(`\n  (Dry run — no changes applied. Remove --dry-run to apply.)`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
