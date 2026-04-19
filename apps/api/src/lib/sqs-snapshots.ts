import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, sqsDailySnapshot } from "../db/schema.js";
import { computeDualProfileSQS } from "./sqs.js";
import { computeHealthState } from "./health-state.js";
import { getTestResultsForSlug } from "./trust-helpers.js";
import { log, logError } from "./log.js";

/**
 * Capture daily SQS snapshots for all active capabilities.
 * Idempotent — uses ON CONFLICT DO UPDATE so safe to call multiple times per day.
 */
export async function captureDailySnapshots(): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const activeCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  let captured = 0;

  for (const cap of activeCaps) {
    try {
      const dual = await computeDualProfileSQS(cap.slug);
      if (dual.matrix.pending) continue;

      // Compute health state from test history
      const testData = await getTestResultsForSlug(cap.slug);
      const healthState = computeHealthState(testData.history_30d ?? []);

      // Count runs analyzed (from the rolling window used by SQS)
      const runsAnalyzed =
        dual.qp.factors.correctness.total +
        dual.qp.factors.schema.total +
        dual.qp.factors.error_handling.total +
        dual.qp.factors.edge_cases.total;

      await db
        .insert(sqsDailySnapshot)
        .values({
          capabilitySlug: cap.slug,
          snapshotDate: today,
          matrixSqs: String(dual.matrix.score),
          qpScore: dual.qp.pending ? null : String(dual.qp.score),
          rpScore: dual.rp.pending ? null : String(dual.rp.score),
          qpGrade: dual.qp.grade === "pending" ? null : dual.qp.grade,
          rpGrade: dual.rp.grade === "pending" ? null : dual.rp.grade,
          trend: dual.rp.trend,
          healthState,
          runsAnalyzed,
        })
        .onConflictDoUpdate({
          target: [sqsDailySnapshot.capabilitySlug, sqsDailySnapshot.snapshotDate],
          set: {
            matrixSqs: sql`EXCLUDED.matrix_sqs`,
            qpScore: sql`EXCLUDED.qp_score`,
            rpScore: sql`EXCLUDED.rp_score`,
            qpGrade: sql`EXCLUDED.qp_grade`,
            rpGrade: sql`EXCLUDED.rp_grade`,
            trend: sql`EXCLUDED.trend`,
            healthState: sql`EXCLUDED.health_state`,
            runsAnalyzed: sql`EXCLUDED.runs_analyzed`,
          },
        });

      captured++;
    } catch (err) {
      logError("sqs-snapshot-capture-failed", err, { capability_slug: cap.slug });
    }
  }

  log.info(
    { label: "sqs-snapshot-captured", captured_count: captured },
    "sqs-snapshot-captured",
  );
}
