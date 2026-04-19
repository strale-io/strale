import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log } from "./log.js";

const BATCH_SIZE = 1000;
const BATCH_DELAY_MS = 100;

/**
 * Retention policies aligned with regulatory requirements:
 * - Compliance data (transactions, quality): 3 years (Colorado AI Act SB 24-205)
 * - Operational data (test results, events): 90-180 days
 * - Trend data (snapshots): 1 year
 *
 * Transactions with legal_hold = true are NEVER deleted regardless of age.
 */

// F-A-004: single source of truth for the retention claim in audit
// payloads. buildFullAudit (routes/do.ts) and any future audit builder
// should import this rather than hardcoding days — prevents the claim
// from drifting out of sync with the actual purge window.
export const TRANSACTION_RETENTION_DAYS = 1095; // 3 years

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

  // Compliance data — 3 year retention (TRANSACTION_RETENTION_DAYS)
  const threeYearsAgo = new Date(now.getTime() - TRANSACTION_RETENTION_DAYS * 86_400_000);

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
