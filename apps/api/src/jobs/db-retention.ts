/**
 * DB Retention — daily job that prunes old rows from high-volume internal tables.
 *
 * Schedule: every 24 hours, with a 5-minute delay after startup.
 * Uses pg_try_advisory_xact_lock inside a db.transaction to prevent duplicate
 * runs across instances (xact-scoped so the lock sits on the same connection
 * as the work and auto-releases on commit/rollback).
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

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log, logError, logWarn } from "../lib/log.js";
import { isShuttingDown } from "../lib/shutdown.js";

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
  const runId = randomUUID();
  const jobLog = log.child({ job: "db-retention", job_run_id: runId });

  // Advisory lock + all work runs inside a single transaction so the
  // xact-scoped lock sits on the same connection as every statement.
  // Auto-releases at commit/rollback. Session-scoped variant broke on
  // pool reuse (see Phase C deploy notes).
  await db.transaction(async (tx) => {
    const [lock] = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
    );
    if (!(lock as { acquired?: boolean })?.acquired) {
      logWarn("db-retention-lock-busy", "another holder; skipping tick", { job_run_id: runId });
      return;
    }

    const started = Date.now();
    const results: Array<{ table: string; deleted: number }> = [];

    for (const rule of RULES) {
      const cutoff = new Date(Date.now() - rule.days * 86_400_000);
      try {
        const res = await tx.execute(
          sql`DELETE FROM ${sql.raw(rule.table)} WHERE ${sql.raw(rule.column)} < ${cutoff}`,
        );
        const deleted = (res as { count?: number }).count ?? 0;
        results.push({ table: rule.table, deleted });
      } catch (err) {
        jobLog.error(
          { label: "db-retention-delete-failed", table: rule.table, err: err instanceof Error ? { message: err.message } : err },
          "db-retention-delete-failed",
        );
      }
    }

    const total = results.reduce((s, r) => s + r.deleted, 0);
    const elapsed_ms = Date.now() - started;
    jobLog.info(
      {
        label: "db-retention-pruned",
        total_deleted: total,
        elapsed_ms,
        per_table: Object.fromEntries(results.map((r) => [r.table, r.deleted])),
      },
      "db-retention-pruned",
    );
  });
}

export function startDbRetention(): void {
  if (_running) return;
  _running = true;

  log.info({ label: "db-retention-started", interval_ms: RETENTION_INTERVAL_MS, startup_delay_ms: STARTUP_DELAY_MS }, "db-retention-started");

  setTimeout(() => {
    if (isShuttingDown()) return;
    runRetention().catch((err) => logError("db-retention-startup-run-failed", err));
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    if (isShuttingDown()) return;
    runRetention().catch((err) => logError("db-retention-scheduled-run-failed", err));
  }, RETENTION_INTERVAL_MS);
}
