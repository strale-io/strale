/**
 * REINDEX Transactions — monthly index-maintenance job.
 *
 * Context (2026-04-16 outage): the `transactions` table is the highest-
 * write table in the schema. Under sustained write load, Postgres B-tree
 * indexes accumulate dead-tuple references between VACUUM cycles and can
 * bloat enough to cause index-scan regressions and, in the outage case,
 * a cascading timeout on /v1/do's INSERT path. A periodic REINDEX rebuilds
 * the affected indexes and prevents the drift.
 *
 * Why `REINDEX CONCURRENTLY` and not plain `REINDEX`:
 *   Plain REINDEX takes an ACCESS EXCLUSIVE lock on the table for the
 *   duration of the rebuild (minutes, at our row count). During that
 *   window every /v1/do write blocks — we'd cause an outage to prevent
 *   an outage. `REINDEX CONCURRENTLY` builds a shadow index, swaps it in
 *   with a brief lock, and cleans up the old one in the background. No
 *   visible interruption to writes. Postgres 12+ only (we're on 16).
 *
 * Why the dedicated-connection advisory-lock pattern and NOT the
 * xact-scoped pattern used by db-retention / activation-drip / the
 * integrity-hash retry worker:
 *   `REINDEX CONCURRENTLY` **cannot run inside a transaction block** —
 *   it's a hard Postgres restriction. That rules out the
 *   `pg_try_advisory_xact_lock` pattern that every other job here uses.
 *   Instead we follow `test-scheduler.ts`'s model: a dedicated
 *   `postgres(url, { max: 1 })` client holds a session-scoped lock while
 *   the REINDEX runs on the regular pool — outside any transaction. The
 *   dedicated client is never shared with the rest of the app, so the
 *   pool-reuse bug that cost Phase C a hotfix cannot apply here. See
 *   SCF-4 in SESSION_5_CARRY_FORWARD.md for the decision rule.
 *
 * Scheduling: the job wakes every 24 hours (+ 15-minute startup delay)
 * and asks the DB "when did I last complete?". If it was less than 30
 * days ago, it skips. Storing the last-run timestamp in
 * `health_monitor_events` (rather than a new `job_runs` table) keeps the
 * schema small — the same table already holds scheduler heartbeats, so
 * this fits the existing pattern.
 *
 * Failure handling: a REINDEX that throws does NOT write a completion
 * event, so the next tick will retry. We also log the error to
 * `integrity-hash-retry`-style structured warn so operators see it.
 *
 * Advisory lock ID: 20260418 — distinct from the four existing IDs
 * (20260417, 20260402, 20260415, 314159).
 */

import { eq, desc, and, gte } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { log, logError, logWarn } from "../lib/log.js";

const INTERVAL_MS = 24 * 60 * 60 * 1000;       // check every 24h
const STARTUP_DELAY_MS = 15 * 60 * 1000;       // don't fire right after boot
const MIN_GAP_MS = 30 * 24 * 60 * 60 * 1000;   // only run if >30 days since last
const ADVISORY_LOCK_ID = 20260418;

let _running = false;

/**
 * Query health_monitor_events for the most recent successful completion.
 * Returns null if the job has never completed (first run ever).
 */
async function findLastCompletion(): Promise<Date | null> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // look back 60 days
  const [latest] = await db
    .select({ createdAt: healthMonitorEvents.createdAt })
    .from(healthMonitorEvents)
    .where(
      and(
        eq(healthMonitorEvents.eventType, "reindex_transactions_complete"),
        gte(healthMonitorEvents.createdAt, cutoff),
      ),
    )
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(1);
  return latest?.createdAt ?? null;
}

/**
 * Dedicated-connection advisory lock (same pattern as test-scheduler.ts).
 * REINDEX CONCURRENTLY cannot run inside a transaction block, so the
 * xact-scoped pattern used elsewhere doesn't apply here.
 */
async function withAdvisoryLock<T>(
  id: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // Local dev without env — just run. A single-instance dev machine can't
    // collide with itself on an advisory lock.
    return { acquired: true, value: await fn() };
  }
  const client = postgres(dbUrl, { max: 1 });
  try {
    let acquired = false;
    try {
      const rows = await client<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(${id}) AS acquired
      `;
      acquired = rows[0]?.acquired === true;
    } catch (err) {
      logWarn(
        "reindex-transactions-lock-query-failed",
        "proceeding without lock",
        { err: err instanceof Error ? err.message : String(err) },
      );
      return { acquired: true, value: await fn() };
    }
    if (!acquired) {
      return { acquired: false };
    }
    try {
      return { acquired: true, value: await fn() };
    } finally {
      await client`SELECT pg_advisory_unlock(${id})`.catch((err) =>
        logError("reindex-transactions-lock-release-failed", err, { lockId: id }),
      );
    }
  } finally {
    await client.end({ timeout: 5 }).catch((err) =>
      logError("reindex-transactions-lock-client-end-failed", err, { lockId: id }),
    );
  }
}

async function runOnce(): Promise<void> {
  try {
    const last = await findLastCompletion();
    if (last) {
      const ageMs = Date.now() - last.getTime();
      if (ageMs < MIN_GAP_MS) {
        const daysAgo = (ageMs / 86_400_000).toFixed(1);
        log.info(
          { last_completion: last.toISOString(), days_ago: daysAgo },
          "reindex-transactions-skip-recent",
        );
        return;
      }
    }

    const outcome = await withAdvisoryLock(ADVISORY_LOCK_ID, async () => {
      // Re-check last completion under lock — guards the "two instances
      // both decided to run" case: instance B may have completed while
      // instance A was waiting to acquire.
      const lastUnderLock = await findLastCompletion();
      if (lastUnderLock) {
        const ageMs = Date.now() - lastUnderLock.getTime();
        if (ageMs < MIN_GAP_MS) {
          log.info(
            { last_completion: lastUnderLock.toISOString() },
            "reindex-transactions-skip-raced",
          );
          return { skipped: true as const };
        }
      }

      const started = Date.now();
      log.info("reindex-transactions-starting");

      // Dedicated client again — REINDEX CONCURRENTLY must run outside
      // any transaction, and the drizzle pool may hand us a connection
      // that's in a transaction state. Dedicated postgres client, max:1,
      // no implicit tx.
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        log.warn("reindex-transactions-no-db-url");
        return { skipped: true as const };
      }
      const client = postgres(dbUrl, { max: 1 });
      try {
        // Postgres: REINDEX TABLE CONCURRENTLY builds shadow indexes
        // and swaps them in. Brief lock during swap; no visible stall
        // on concurrent writes.
        await client.unsafe("REINDEX TABLE CONCURRENTLY transactions");
      } finally {
        await client.end({ timeout: 30 }).catch((err) =>
          logError("reindex-transactions-reindex-client-end-failed", err),
        );
      }

      const elapsedMs = Date.now() - started;
      return { skipped: false as const, elapsedMs };
    });

    if (!outcome.acquired) {
      logWarn(
        "reindex-transactions-lock-busy",
        "another holder; skipping tick",
      );
      return;
    }

    if (outcome.value.skipped) {
      return;
    }

    // Record completion. This is the signal the NEXT tick will read from
    // findLastCompletion(), so it's essential this write succeeds even if
    // the log pipeline is flaky.
    await logHealthEvent({
      eventType: "reindex_transactions_complete",
      tier: 2,
      actionTaken: "REINDEX TABLE CONCURRENTLY transactions",
      details: { elapsed_ms: outcome.value.elapsedMs },
    });

    log.info(
      { elapsed_ms: outcome.value.elapsedMs },
      "reindex-transactions-complete",
    );
  } catch (err) {
    logError("reindex-transactions-run-failed", err);
  }
}

export function startReindexTransactions(): void {
  if (_running) return;
  _running = true;

  log.info(
    `reindex-transactions: started (${INTERVAL_MS / 3600_000}h check interval, ${STARTUP_DELAY_MS / 60_000}min initial delay, min gap ${MIN_GAP_MS / 86_400_000}d)`,
  );

  setTimeout(() => {
    runOnce().catch((err) =>
      logError("reindex-transactions-startup-run-failed", err),
    );
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runOnce().catch((err) =>
      logError("reindex-transactions-run-failed", err),
    );
  }, INTERVAL_MS);
}
