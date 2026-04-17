/**
 * Integrity-hash retry worker (F-0-009 Stage 2).
 *
 * Before: storeIntegrityHash was called as a fire-and-forget
 * `.catch(() => {})` at six sites in do.ts. Every failure silently
 * vanished. Because the hash chain is compliance-critical (SOC 2,
 * ISO/IEC 24970), silence in failure was the worst possible mode.
 *
 * After: every new transaction row lands with
 * `compliance_hash_state = 'pending'` via the column default (migration
 * 0047). This job wakes every INTERVAL_MS, fetches pending rows older
 * than GRACE_MS (so we don't race the insertion commit), computes the
 * hash, and sets state = 'complete'. Rows still pending after
 * STALE_MS trigger a structured warn log so operators see the drift
 * before a regulator does.
 *
 * The /v1/audit/:id endpoint refuses to serve a row whose state is
 * still 'pending' — clients receive 202 + Retry-After: 30.
 *
 * Column naming: this worker queries `compliance_hash_state`, not
 * `integrity_hash_status`. The latter is owned by a separate, untracked
 * workflow on prod that tags 'customer' / 'test' for analytics.
 * See PHASE_C_COLUMN_INVESTIGATION.md.
 *
 * Uses pg_try_advisory_lock to cooperate with multi-instance deploys
 * (even though today is 1 replica per Phase A Q2).
 */

import { sql, eq, and, lt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import { computeIntegrityHash, getPreviousHash } from "../lib/integrity-hash.js";
import { log, logError, logWarn } from "../lib/log.js";

const INTERVAL_MS = 30_000;               // how often to wake
const STARTUP_DELAY_MS = 10_000;          // don't fire immediately on boot
const GRACE_MS = 10_000;                  // don't race the inserting tx's commit
const STALE_WARN_MS = 5 * 60_000;         // warn on rows pending > 5 min
const BATCH_SIZE = 50;                    // process N rows per wake
const MAX_HASH_ATTEMPTS = 3;              // after this, flip to 'failed'
const ADVISORY_LOCK_ID = 20260417;

let _running = false;

async function runOnce(): Promise<void> {
  const db = getDb();

  const [lock] = await db.execute(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`,
  );
  if (!(lock as { acquired?: boolean })?.acquired) {
    // Another instance has it. Not an error.
    return;
  }

  try {
    const pendingCutoff = new Date(Date.now() - GRACE_MS);
    const pending = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.complianceHashState, "pending"),
          lt(transactions.createdAt, pendingCutoff),
        ),
      )
      .limit(BATCH_SIZE);

    if (pending.length === 0) return;

    let staleCount = 0;
    let completed = 0;
    let failed = 0;
    const staleCutoff = Date.now() - STALE_WARN_MS;

    for (const txn of pending) {
      if (txn.createdAt.getTime() < staleCutoff) {
        staleCount++;
      }

      try {
        const previousHash = await getPreviousHash();
        const hash = computeIntegrityHash(
          {
            id: txn.id,
            userId: txn.userId,
            status: txn.status,
            input: txn.input,
            output: txn.output,
            error: txn.error,
            priceCents: txn.priceCents,
            latencyMs: txn.latencyMs,
            provenance: txn.provenance,
            auditTrail: txn.auditTrail,
            transparencyMarker: txn.transparencyMarker,
            dataJurisdiction: txn.dataJurisdiction,
            createdAt: txn.createdAt,
            completedAt: txn.completedAt,
          },
          previousHash,
        );

        await db
          .update(transactions)
          .set({
            integrityHash: hash,
            previousHash,
            complianceHashState: "complete",
          })
          .where(eq(transactions.id, txn.id));
        completed++;
      } catch (err) {
        // One row failing shouldn't take down the whole batch. Log and move on.
        logError("integrity-hash-retry-row-failed", err, { transactionId: txn.id });
        failed++;

        // If this row has been pending for well past STALE_WARN_MS, flip to
        // 'failed' so it stops clogging the queue and operators get a ping.
        if (Date.now() - txn.createdAt.getTime() > STALE_WARN_MS * MAX_HASH_ATTEMPTS) {
          await db
            .update(transactions)
            .set({ complianceHashState: "failed" })
            .where(eq(transactions.id, txn.id))
            .catch((err2) =>
              logError("integrity-hash-mark-failed-failed", err2, { transactionId: txn.id }),
            );
        }
      }
    }

    if (staleCount > 0) {
      logWarn(
        "integrity-hash-stale-rows",
        `${staleCount} transactions pending > 5 min; compliance chain falling behind`,
        { staleCount, batchSize: pending.length },
      );
    }

    log.info(
      { completed, failed, stale: staleCount, batch_size: pending.length },
      "integrity-hash-batch-done",
    );
  } catch (err) {
    logError("integrity-hash-retry-batch-failed", err);
  } finally {
    await db
      .execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`)
      .catch((err) => logError("advisory-unlock-failed", err, { job: "integrity-hash-retry" }));
  }
}

export function startIntegrityHashRetry(): void {
  if (_running) return;
  _running = true;

  log.info(`integrity-hash-retry: started (${INTERVAL_MS}ms interval, ${STARTUP_DELAY_MS}ms initial delay)`);

  setTimeout(() => {
    runOnce().catch((err) => logError("integrity-hash-retry-startup-run-failed", err));
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runOnce().catch((err) => logError("integrity-hash-retry-run-failed", err));
  }, INTERVAL_MS);
}
