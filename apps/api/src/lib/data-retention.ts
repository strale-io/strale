import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log } from "./log.js";

const BATCH_SIZE = 1000;
const BATCH_DELAY_MS = 100;

/**
 * Transaction retention window for GDPR Art. 30 record-of-processing
 * compliance (Colorado AI Act SB 24-205). Rows with `legal_hold = false`
 * and `created_at < now - TRANSACTION_RETENTION_DAYS` are hard-deleted
 * by the weekly retention sweep. SA.2a.3a: also surfaced in the
 * compliance payload returned from POST /v1/do — changes here propagate
 * to the public claim without additional edits.
 */
export const TRANSACTION_RETENTION_DAYS = 1095; // 3 years

/**
 * Retention policies aligned with regulatory requirements:
 * - Compliance data (transactions, quality): 3 years (Colorado AI Act SB 24-205)
 * - Operational data (test results, events): 90-180 days
 * - Trend data (snapshots): 1 year
 *
 * Transactions with legal_hold = true are NEVER deleted regardless of age.
 */

async function purgeTestResults(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM test_results
      WHERE id IN (
        SELECT id FROM test_results
        WHERE executed_at < ${cutoff.toISOString()}::timestamptz
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = (result as any).rowCount ?? 0;
    deleted += count;
    if (count < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

async function purgeTransactionQuality(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  while (true) {
    // Skip transaction_quality rows linked to transactions with legal_hold
    const result = await db.execute(sql`
      DELETE FROM transaction_quality
      WHERE id IN (
        SELECT tq.id FROM transaction_quality tq
        JOIN transactions t ON t.id = tq.transaction_id
        WHERE tq.created_at < ${cutoff.toISOString()}::timestamptz
          AND t.legal_hold = false
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = (result as any).rowCount ?? 0;
    deleted += count;
    if (count < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

async function purgeTransactions(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  while (true) {
    // NEVER delete transactions with legal_hold = true
    const result = await db.execute(sql`
      DELETE FROM transactions
      WHERE id IN (
        SELECT id FROM transactions
        WHERE created_at < ${cutoff.toISOString()}::timestamptz
          AND legal_hold = false
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = (result as any).rowCount ?? 0;
    deleted += count;
    if (count < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

async function purgeHealthMonitorEvents(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM health_monitor_events
      WHERE id IN (
        SELECT id FROM health_monitor_events
        WHERE created_at < ${cutoff.toISOString()}::timestamptz
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = (result as any).rowCount ?? 0;
    deleted += count;
    if (count < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

async function purgeSqsSnapshots(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM sqs_daily_snapshot
      WHERE id IN (
        SELECT id FROM sqs_daily_snapshot
        WHERE created_at < ${cutoff.toISOString()}::timestamptz
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = (result as any).rowCount ?? 0;
    deleted += count;
    if (count < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

/**
 * Run data retention cleanup. Safe to call multiple times — idempotent.
 *
 * Retention windows:
 * - transactions: 3 years (Colorado AI Act compliance)
 * - transaction_quality: 3 years (paired with transactions)
 * - test_results: 90 days (operational)
 * - health_monitor_events: 180 days (operational)
 * - sqs_daily_snapshot: 365 days (trend analysis)
 *
 * Transactions with legal_hold = true are never deleted.
 */
export async function cleanupOldTestData(): Promise<void> {
  const now = new Date();

  // Operational data — short retention
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const oneEightyDaysAgo = new Date(now);
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Compliance data — 3 year retention
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setDate(threeYearsAgo.getDate() - TRANSACTION_RETENTION_DAYS);

  const testResultsDeleted = await purgeTestResults(ninetyDaysAgo);
  const txQualityDeleted = await purgeTransactionQuality(threeYearsAgo);
  const txDeleted = await purgeTransactions(threeYearsAgo);
  const eventsDeleted = await purgeHealthMonitorEvents(oneEightyDaysAgo);
  const snapshotsDeleted = await purgeSqsSnapshots(oneYearAgo);

  log.info(
    {
      label: "retention-cleanup-done",
      test_results_deleted: testResultsDeleted,
      transaction_quality_deleted: txQualityDeleted,
      transactions_deleted: txDeleted,
      health_monitor_events_deleted: eventsDeleted,
      sqs_daily_snapshot_deleted: snapshotsDeleted,
    },
    "retention-cleanup-done",
  );
}
