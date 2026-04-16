/**
 * DB Retention — daily job that prunes old rows from high-volume internal tables.
 *
 * Schedule: every 24 hours, with a 5-minute delay after startup.
 * Uses pg_try_advisory_lock to prevent duplicate runs across instances.
 *
 * Retention windows:
 *   test_results              > 30 days   (SQS uses rolling 10-run window; 30d is ample history)
 *   health_monitor_events     > 30 days   (internal telemetry)
 *   failed_requests           > 90 days   (no-match diagnostics)
 *   test_run_log              > 180 days  (cost tracking history)
 *
 * Does NOT prune: transactions, transaction_quality (EU AI Act audit trail — retained for compliance).
 * Does NOT VACUUM FULL (takes exclusive locks; disruptive to live API).
 * Plain VACUUM runs implicitly via autovacuum.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 5 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260415;

const RULES = [
  { table: "test_results", column: "executed_at", days: 30 },
  { table: "health_monitor_events", column: "created_at", days: 30 },
  { table: "failed_requests", column: "created_at", days: 90 },
  { table: "test_run_log", column: "started_at", days: 180 },
  // F-0-002: prune old rate-limit windows. 7 days is well beyond the
  // longest window we use (1 day for signup), so no live counter is lost.
  { table: "rate_limit_counters", column: "window_start", days: 7 },
] as const;

let _running = false;

async function runRetention(): Promise<void> {
  const db = getDb();

  const [lock] = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`);
  if (!(lock as { acquired?: boolean })?.acquired) {
    console.log("[db-retention] Another instance holds the lock — skipping");
    return;
  }

  try {
    const started = Date.now();
    const results: Array<{ table: string; deleted: number }> = [];

    for (const rule of RULES) {
      const cutoff = new Date(Date.now() - rule.days * 86_400_000);
      try {
        const res = await db.execute(
          sql`DELETE FROM ${sql.raw(rule.table)} WHERE ${sql.raw(rule.column)} < ${cutoff}`,
        );
        const deleted = (res as { count?: number }).count ?? 0;
        results.push({ table: rule.table, deleted });
      } catch (err) {
        console.error(`[db-retention] DELETE from ${rule.table} failed:`, err instanceof Error ? err.message : err);
      }
    }

    const total = results.reduce((s, r) => s + r.deleted, 0);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[db-retention] Pruned ${total} rows in ${elapsed}s: ${results.map((r) => `${r.table}=${r.deleted}`).join(", ")}`,
    );
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`).catch(() => {});
  }
}

export function startDbRetention(): void {
  if (_running) return;
  _running = true;

  console.log("[db-retention] Started (24h interval, 5min initial delay)");

  setTimeout(() => {
    runRetention().catch((err) =>
      console.error("[db-retention] Startup run failed:", err),
    );
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runRetention().catch((err) =>
      console.error("[db-retention] Scheduled run failed:", err),
    );
  }, RETENTION_INTERVAL_MS);
}
