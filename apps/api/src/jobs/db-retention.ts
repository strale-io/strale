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
 *   rate_limit_counters       > 7 days    (well past the longest live window)
 *
 * Does NOT prune: transactions, transaction_quality (EU AI Act audit trail — retained for compliance).
 * Does NOT VACUUM FULL (takes exclusive locks; disruptive to live API).
 * Plain VACUUM runs implicitly via autovacuum.
 *
 * Pagination (DEC-20260504-A, post-incident hardening). The previous form
 * did a single unbounded `DELETE … WHERE column < cutoff` per table. After
 * weeks of silent failure (PR-43-twin Date-encoding bug), the first
 * successful tick ran an unbounded DELETE on the accumulated backlog, which
 * generated several GB of WAL on a small Railway volume and crashed
 * postgres at 2026-05-04 09:30 UTC (`No space left on device` writing
 * pg_wal/xlogtemp). Recovery: 50 GB volume + this patch.
 *
 * The fix is mechanical: each rule loops in 10,000-row batches, exits when
 * the batch returns 0 rows affected, and stops if a per-rule wall-clock
 * budget (60 seconds) is exhausted. Bounded WAL per batch; no single
 * transaction holds more than one batch's worth of locks. Loop emits a
 * structured per-rule summary so a future regression is visible.
 */

import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import { log, logError, logWarn } from "../lib/log.js";
import { isShuttingDown } from "../lib/shutdown.js";

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 5 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260415;

/** Max rows deleted per batch within a rule. */
export const BATCH_SIZE = 10_000;

/** Wall-clock cap per rule. If reached mid-loop, the rule exits cleanly
 *  with `budget_hit: true` in the per-rule summary; the next tick picks
 *  up where this one left off (oldest first via the retention-column
 *  ORDER BY). */
export const PER_RULE_BUDGET_MS = 60 * 1000;

/**
 * Per-rule metadata.
 * - `column` is the retention timestamp.
 * - `idCols` is the SELECT/IN target for the batch subquery — single
 *   `id` for surrogate-key tables, the composite `(bucket_key,
 *   window_start)` for `rate_limit_counters`.
 * - `orderClause` is "<column>, <pk>" so the batch is "oldest first
 *   plus PK tie-breaker", giving forward progress + determinism.
 *   For `rate_limit_counters` the retention column IS already part of
 *   the PK, so the order clause is just the PK itself.
 */
export interface RetentionRule {
  table: string;
  column: string;
  days: number;
  idCols: string;
  orderClause: string;
}

export const RULES: readonly RetentionRule[] = [
  { table: "test_results",          column: "executed_at",  days: 30,  idCols: "id",                       orderClause: "executed_at, id" },
  { table: "health_monitor_events", column: "created_at",   days: 30,  idCols: "id",                       orderClause: "created_at, id" },
  { table: "failed_requests",       column: "created_at",   days: 90,  idCols: "id",                       orderClause: "created_at, id" },
  { table: "test_run_log",          column: "started_at",   days: 180, idCols: "id",                       orderClause: "started_at, id" },
  { table: "rate_limit_counters",   column: "window_start", days: 7,   idCols: "bucket_key, window_start", orderClause: "window_start, bucket_key" },
] as const;

let _running = false;

/**
 * Per-rule outcome. `deleted` is the cumulative count across all batches
 * for this rule; `batches` is how many DELETE statements were executed
 * (>=1 unless the table was already empty past the cutoff); `budgetHit`
 * indicates the loop bailed on the wall-clock budget. `error` is set on
 * SQL failure (in which case `deleted`/`batches` reflect work done before
 * the failure).
 */
export interface RuleResult {
  table: string;
  deleted: number;
  batches: number;
  duration_ms: number;
  budget_hit: boolean;
  error?: string;
}

/**
 * Minimal executor surface the loop needs. Lets unit tests inject a
 * stub without spinning up a transaction. The shape matches what
 * `db.transaction(tx => tx.execute(...))` returns at runtime.
 */
export interface RetentionExecutor {
  execute(query: SQL): Promise<{ count?: number } | unknown>;
}

/**
 * Run one retention rule with bounded-batch pagination. Exposed for
 * unit tests; production calls it via `runRetention()` inside the
 * transaction.
 *
 * @param rule         which table + column + retention window to prune
 * @param cutoffIso    ISO-string for the cutoff (Date is rejected by
 *                     postgres-js's bind path; see PR #44)
 * @param tx           query executor (real tx in prod, stub in tests)
 * @param now          clock injection for budget-cap testing
 */
export async function runOneRulePaginated(
  rule: RetentionRule,
  cutoffIso: string,
  tx: RetentionExecutor,
  now: () => number = Date.now,
): Promise<RuleResult> {
  const ruleStart = now();
  let deleted = 0;
  let batches = 0;
  let budgetHit = false;
  let error: string | undefined;

  while (true) {
    if (now() - ruleStart >= PER_RULE_BUDGET_MS) {
      budgetHit = true;
      break;
    }

    let batchCount = 0;
    try {
      const res = await tx.execute(sql`
        DELETE FROM ${sql.raw(rule.table)}
        WHERE ${sql.raw(`(${rule.idCols})`)} IN (
          SELECT ${sql.raw(rule.idCols)}
          FROM ${sql.raw(rule.table)}
          WHERE ${sql.raw(rule.column)} < ${cutoffIso}::timestamptz
          ORDER BY ${sql.raw(rule.orderClause)}
          LIMIT ${BATCH_SIZE}
        )
      `);
      batchCount = (res as { count?: number }).count ?? 0;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      break;
    }

    if (batchCount === 0) {
      // No more rows past the cutoff — done with this rule.
      break;
    }

    deleted += batchCount;
    batches += 1;
  }

  return {
    table: rule.table,
    deleted,
    batches,
    duration_ms: now() - ruleStart,
    budget_hit: budgetHit,
    ...(error !== undefined ? { error } : {}),
  };
}

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
    const results: RuleResult[] = [];

    for (const rule of RULES) {
      // ISO-string cast, not a raw Date, because postgres-js's bind-parameter
      // encoder cannot serialize a Date object through the sql-template path
      // (it falls through to Buffer.byteLength(date) and throws). The throw
      // was being swallowed by the catch below — every retention tick logged
      // total: 0 and looked healthy while no rows were ever deleted. Same
      // bug shape as do.ts spendCapWouldExceed (fixed in PR #43); both came
      // from the 2026-04-30 cert-audit batch (this file: commit 968bc82;
      // do.ts: commit 6613bd7).
      const cutoffIso = new Date(Date.now() - rule.days * 86_400_000).toISOString();
      const result = await runOneRulePaginated(rule, cutoffIso, tx);
      results.push(result);

      if (result.error !== undefined) {
        jobLog.error(
          { label: "db-retention-delete-failed", table: rule.table, batches_completed: result.batches, deleted_before_failure: result.deleted, err: { message: result.error } },
          "db-retention-delete-failed",
        );
      }
    }

    const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
    const totalBatches = results.reduce((s, r) => s + r.batches, 0);
    const elapsed_ms = Date.now() - started;
    const failures = results.filter((r) => r.error !== undefined).map((r) => ({ table: r.table, error: r.error! }));
    const successes = results.filter((r) => r.error === undefined);
    const anyBudgetHit = results.some((r) => r.budget_hit);

    // Distinguish three states for dashboards:
    //   1. all-rules-failed — every rule errored, nothing deleted
    //   2. healthy / quiet  — at least one rule completed (deleted >= 0)
    //   3. budget-saturated — same as healthy but a rule hit its wall-clock
    //                         cap. Backlog will continue draining on next ticks.
    // Pre-fix, all-failed and quiet ticks both logged `db-retention-pruned`
    // with total: 0; the all-failed branch is the visibility fix from PR #44.
    const allFailed = successes.length === 0 && failures.length === RULES.length;
    const label = allFailed ? "db-retention-all-rules-failed" : "db-retention-pruned";
    const logFn = allFailed ? jobLog.error.bind(jobLog) : jobLog.info.bind(jobLog);
    logFn(
      {
        label,
        total_deleted: totalDeleted,
        total_batches: totalBatches,
        elapsed_ms,
        any_budget_hit: anyBudgetHit,
        per_table: Object.fromEntries(
          results.map((r) => [
            r.table,
            { deleted: r.deleted, batches: r.batches, duration_ms: r.duration_ms, budget_hit: r.budget_hit },
          ]),
        ),
        failures,
      },
      label,
    );
  });
}

/**
 * One-shot post-recovery ANALYZE on tables whose query-planner stats
 * were reset by the 2026-05-04 postgres restart. Stale stats cause
 * plan regressions on hot read paths until autovacuum runs (which can
 * take hours-to-days for large tables). Idempotent + safe to run on
 * every startup; cost is a single sequential scan per table, well
 * under a second on the current dataset (~316 MB DB total, largest
 * retention table 123 MB). Fire-and-forget — does not block API
 * startup.
 *
 * Not a recurring job. Autovacuum maintains stats during normal
 * operation. This exists to bridge the gap between restart and the
 * first autovacuum cycle on each table.
 */
const ANALYZE_RECOVERY_TABLES = [
  "test_results",
  "health_monitor_events",
  "transactions",
] as const;

export function runStartupAnalyzeRecovery(): void {
  fireAndForget(
    async () => {
      const db = getDb();
      const startedAt = Date.now();
      const completed: Array<{ table: string; duration_ms: number }> = [];
      const failed: Array<{ table: string; error: string }> = [];
      for (const table of ANALYZE_RECOVERY_TABLES) {
        const tableStart = Date.now();
        try {
          await db.execute(sql`ANALYZE ${sql.raw(table)}`);
          completed.push({ table, duration_ms: Date.now() - tableStart });
        } catch (err) {
          failed.push({ table, error: err instanceof Error ? err.message : String(err) });
        }
      }
      log.info(
        { label: "startup-analyze-recovery-done", elapsed_ms: Date.now() - startedAt, completed, failed },
        "startup-analyze-recovery-done",
      );
    },
    { label: "startup-analyze-recovery", context: { tables: [...ANALYZE_RECOVERY_TABLES] } },
  );
}

export function startDbRetention(): void {
  if (_running) return;
  _running = true;

  log.info({ label: "db-retention-started", interval_ms: RETENTION_INTERVAL_MS, startup_delay_ms: STARTUP_DELAY_MS }, "db-retention-started");

  // Refresh planner stats after the 2026-05-04 recovery. Idempotent +
  // cheap; runs concurrently with the rest of startup.
  runStartupAnalyzeRecovery();

  setTimeout(() => {
    if (isShuttingDown()) return;
    runRetention().catch((err) => logError("db-retention-startup-run-failed", err));
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    if (isShuttingDown()) return;
    runRetention().catch((err) => logError("db-retention-scheduled-run-failed", err));
  }, RETENTION_INTERVAL_MS);
}
