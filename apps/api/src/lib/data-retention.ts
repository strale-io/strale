import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

const BATCH_SIZE = 1000;
const BATCH_DELAY_MS = 100;

/**
 * Delete rows from test_results in batches.
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

/**
 * Delete rows from transaction_quality in batches.
 */
async function purgeTransactionQuality(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM transaction_quality
      WHERE id IN (
        SELECT id FROM transaction_quality
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
 * Delete rows from health_monitor_events in batches.
 */
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

/**
 * Delete rows from sqs_daily_snapshot in batches.
 */
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
 * Run data retention cleanup across all tables with retention policies.
 * Safe to call multiple times — idempotent.
 *
 * Retention windows:
 * - test_results: 90 days
 * - transaction_quality: 90 days
 * - health_monitor_events: 180 days
 * - sqs_daily_snapshot: 365 days
 */
export async function cleanupOldTestData(): Promise<void> {
  const now = new Date();

  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const oneEightyDaysAgo = new Date(now);
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const testResultsDeleted = await purgeTestResults(ninetyDaysAgo);
  const txQualityDeleted = await purgeTransactionQuality(ninetyDaysAgo);
  const eventsDeleted = await purgeHealthMonitorEvents(oneEightyDaysAgo);
  const snapshotsDeleted = await purgeSqsSnapshots(oneYearAgo);

  console.log(
    `[retention] Cleanup: deleted ${testResultsDeleted} test_results, ` +
    `${txQualityDeleted} transaction_quality, ` +
    `${eventsDeleted} health_monitor_events, ` +
    `${snapshotsDeleted} sqs_daily_snapshot`,
  );
}
