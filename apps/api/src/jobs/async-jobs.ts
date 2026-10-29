/**
 * Async-job housekeeping (portfolio plan 2.11): callback retries and the
 * file-output retention purge, on one 60s tick.
 *
 * Callbacks: claims due callbacks whose job is terminal, one at a time, and
 * sends each. The claim is a conditional UPDATE with SKIP LOCKED and a lease
 * (lib/jobs/callbacks.ts), so replicas cannot double-send; the per-tick cap
 * bounds outbound requests, and ticks never overlap within a process.
 *
 * Retention (DEC-20260504-B): file bytes are customer content. A file goes
 * when its transaction's content is redacted or the transaction is deleted, or
 * PII_RETENTION_DAYS after creation unless the transaction is on legal hold.
 * Callback rows (they hold a customer-supplied URL) go on the same window once
 * settled. Every DELETE is LIMIT-bounded, at most MAX_BATCHES_PER_TICK per
 * tick, each batch taking a cross-replica advisory lock, so the per-tick bound
 * holds however many replicas run. Both tables are new and start empty, so the
 * first production run has no backlog; the bound is what keeps a later surge
 * (an account closure with many files) from becoming a workload-resumption
 * event.
 */
import { sql } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { PII_RETENTION_DAYS } from "../lib/data-retention.js";
import { claimDueCallbacks, sendClaimed, type CallbackFetch } from "../lib/jobs/callbacks.js";
import { log, logError } from "../lib/log.js";

const CALLBACKS_PER_TICK = 25;
export const FILE_PURGE_BATCH = 50;
export const MAX_BATCHES_PER_TICK = 10;
const ADVISORY_LOCK_ID = 20261029;
const TICK_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 50_000;

function affected(result: unknown): number {
  return (result as { count?: number }).count ?? 0;
}

export interface AsyncJobsTickSummary {
  callbacksAttempted: number;
  callbacksDelivered: number;
  filesDeleted: number;
  callbacksDeleted: number;
  /** True when a purge stopped at the per-tick cap with rows possibly left. */
  purgeHitCap: boolean;
  errors: number;
}

/** One bounded, locked DELETE. Returns rows deleted, or null if another replica holds the lock. */
async function purgeBatch(statement: ReturnType<typeof sql>): Promise<number | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [lock] = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
    )) as unknown as Array<{ acquired?: boolean }>;
    if (!lock?.acquired) return null;
    return affected(await tx.execute(statement));
  });
}

async function purgeLoop(statement: ReturnType<typeof sql>): Promise<{ deleted: number; hitCap: boolean }> {
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
    const n = await purgeBatch(statement);
    if (n === null) return { deleted, hitCap: false };
    deleted += n;
    if (n < FILE_PURGE_BATCH) return { deleted, hitCap: false };
  }
  return { deleted, hitCap: true };
}

export async function purgeExpiredJobFiles(): Promise<{ deleted: number; hitCap: boolean }> {
  return purgeLoop(sql`
    DELETE FROM job_files
    WHERE id IN (
      SELECT f.id FROM job_files f
      JOIN transactions t ON t.id = f.transaction_id
      WHERE t.redacted_at IS NOT NULL
         OR t.deleted_at IS NOT NULL
         OR (f.created_at < now() - make_interval(days => ${PII_RETENTION_DAYS}) AND t.legal_hold = false)
      LIMIT ${FILE_PURGE_BATCH}
    )
  `);
}

export async function purgeSettledCallbacks(): Promise<{ deleted: number; hitCap: boolean }> {
  return purgeLoop(sql`
    DELETE FROM job_callbacks
    WHERE transaction_id IN (
      SELECT c.transaction_id FROM job_callbacks c
      JOIN transactions t ON t.id = c.transaction_id
      WHERE (c.state IN ('delivered', 'failed')
             AND (t.redacted_at IS NOT NULL OR t.deleted_at IS NOT NULL))
         -- Past the window the URL goes whatever its state, so a callback
         -- whose job never settled cannot keep it forever.
         OR (c.created_at < now() - make_interval(days => ${PII_RETENTION_DAYS}) AND t.legal_hold = false)
      LIMIT ${FILE_PURGE_BATCH}
    )
  `);
}

/** One tick. Exported so tests drive it rather than waiting on the interval. */
export async function runAsyncJobsTickOnce(fetchImpl?: CallbackFetch): Promise<AsyncJobsTickSummary> {
  const db = getDb();
  const summary: AsyncJobsTickSummary = {
    callbacksAttempted: 0,
    callbacksDelivered: 0,
    filesDeleted: 0,
    callbacksDeleted: 0,
    purgeHitCap: false,
    errors: 0,
  };

  try {
    // One claim per send. Claiming a batch up front would let the 60s lease
    // run out on rows still queued behind slow receivers, and another tick or
    // replica would send them a second time.
    for (let i = 0; i < CALLBACKS_PER_TICK; i++) {
      const [row] = await claimDueCallbacks(db, 1);
      if (!row) break;
      summary.callbacksAttempted += 1;
      const outcome = await sendClaimed(db, row, fetchImpl);
      if (outcome.state === "delivered") summary.callbacksDelivered += 1;
    }
  } catch (err) {
    summary.errors += 1;
    logError("async-jobs-callbacks-failed", err);
  }

  try {
    const files = await purgeExpiredJobFiles();
    const callbacks = await purgeSettledCallbacks();
    summary.filesDeleted = files.deleted;
    summary.callbacksDeleted = callbacks.deleted;
    summary.purgeHitCap = files.hitCap || callbacks.hitCap;
  } catch (err) {
    summary.errors += 1;
    logError("async-jobs-purge-failed", err);
  }

  // Quiet when idle; any work, a capped purge or an error is logged, so a
  // failing purge cannot read as "nothing to do" (DEC-20260504-A).
  if (summary.callbacksAttempted || summary.filesDeleted || summary.callbacksDeleted || summary.purgeHitCap || summary.errors) {
    log.info(
      {
        label: "async-jobs-tick",
        callbacks_attempted: summary.callbacksAttempted,
        callbacks_delivered: summary.callbacksDelivered,
        files_deleted: summary.filesDeleted,
        callbacks_deleted: summary.callbacksDeleted,
        purge_hit_cap: summary.purgeHitCap,
        errors: summary.errors,
      },
      "async-jobs-tick",
    );
  }
  return summary;
}

/** A tick can outlast the interval (slow receivers); never run two at once. */
let tickRunning = false;
async function guardedTick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await runAsyncJobsTickOnce();
  } catch (err) {
    logError("async-jobs-tick-unhandled", err);
  } finally {
    tickRunning = false;
  }
}

export function startAsyncJobs(): void {
  setTimeout(() => {
    void guardedTick();
    setInterval(() => void guardedTick(), TICK_INTERVAL_MS).unref();
  }, STARTUP_DELAY_MS).unref();
}
