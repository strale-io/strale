/**
 * Integrity-hash retry worker (F-0-009 Stage 2).
 *
 * Before: storeIntegrityHash was called as a fire-and-forget
 * `.catch(() => {})` at six sites in do.ts. Every failure silently
 * vanished. Because the hash chain is compliance-critical (SOC 2
 * tamper-evident logging; an earlier comment also cited ISO/IEC 24970
 * but that's a Draft International Standard — see cert-audit
 * 2026-04-30 for the cleanup), silence in failure was the worst
 * possible mode.
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
 * Uses pg_try_advisory_xact_lock inside a db.transaction to cooperate
 * with multi-instance deploys (even though today is 1 replica per
 * Phase A Q2). Xact-scoped locks auto-release at transaction end and
 * are guaranteed to sit on the same connection as the work — avoiding
 * the stuck-lock pool-reuse bug that crippled this worker on the first
 * Phase C deploy.
 */

import { sql, eq, and, lt, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import {
  computeIntegrityHashVersioned,
  getPreviousHash,
  CHAIN_PAYLOAD_V1,
  CHAIN_PAYLOAD_V2,
  type ChainPayloadVersion,
} from "../lib/integrity-hash.js";
import { log, logError, logWarn } from "../lib/log.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { isShuttingDown } from "../lib/shutdown.js";

const INTERVAL_MS = 30_000;               // how often to wake
const STARTUP_DELAY_MS = 10_000;          // don't fire immediately on boot
const GRACE_MS = 10_000;                  // don't race the inserting tx's commit
const STALE_WARN_MS = 5 * 60_000;         // warn on rows pending > 5 min
const STALE_DEFERRED_MS = 30 * 60_000;    // CCO #6: 'deferred' rows older than this are stuck (route handler died between INSERT and completion UPDATE)
const BATCH_SIZE = 50;                    // process N rows per wake
const MAX_HASH_ATTEMPTS = 3;              // after this, flip to 'failed'
const ADVISORY_LOCK_ID = 20260417;

let _running = false;

/**
 * Exported as a test seam (WP1). The worker is otherwise only reachable
 * through startIntegrityHashRetry()'s interval, so the chain-admission
 * behaviour it owns — the single writer of `integrity_hash` — could not be
 * exercised deterministically. Tests call this directly against an ephemeral
 * Postgres; nothing in production should.
 */
export async function runIntegrityHashRetryOnce(): Promise<void> {
  return runOnce();
}

async function runOnce(): Promise<void> {
  const db = getDb();

  // Advisory-lock + all work runs inside a single transaction so the
  // xact-scoped lock sits on the same connection as every subsequent
  // statement. Lock auto-releases at commit/rollback — no explicit
  // pg_advisory_unlock needed (which is what broke the session-scoped
  // pattern on a pooled connection).
  try {
    await db.transaction(async (tx) => {
      const [lock] = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
      );
      if (!(lock as { acquired?: boolean })?.acquired) {
        logWarn(
          "integrity-hash-retry-lock-busy",
          "another holder; skipping tick",
        );
        return;
      }

      const pendingCutoff = new Date(Date.now() - GRACE_MS);
      // CRIT-6: ORDER BY (createdAt, id) ASC — without explicit ordering,
      // PostgreSQL returns heap-scan order, which is non-deterministic.
      // Two same-second inserts would chain in arbitrary order, producing
      // a chain that's non-deterministically reproducible after the fact.
      // id is the secondary tiebreaker for same-millisecond inserts; it's
      // a uuid().defaultRandom(), so the order is deterministic without
      // implying time semantics.
      // WP7 — CHAIN_ORDER_NOTE. Two changes, both load-bearing:
      //
      // 1. TERMINAL-ONLY ADMISSION. `status` and `completed_at` are hashed
      //    fields, so admitting a row that is still running bakes in values
      //    that will change, and its hash silently stops describing it —
      //    indistinguishable from tampering. Production had 507 such rows: 506
      //    health probes with a null completed_at, and one transaction stuck in
      //    'executing' since 2026-04-07 that WP3's reconciler will eventually
      //    move. Requiring a completed_at is also what stops another null-head
      //    row from ever entering the chain.
      //
      // 2. ONE ORDERING. This ordered by (created_at, id) while
      //    getPreviousHash picked the head by (completed_at, id), so the tip a
      //    batch produced was not the head the next tick resumed from. Both now
      //    use completed_at with id as the deterministic tiebreaker. If you
      //    change one, change the other; they are one decision expressed twice.
      const pending = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.complianceHashState, "pending"),
            lt(transactions.createdAt, pendingCutoff),
            sql`${transactions.completedAt} IS NOT NULL`,
            sql`${transactions.status} IN ('completed', 'failed')`,
            // A row whose RECEIPT is still pending must not be chained.
            //
            // Chain v2 anchors the receipt digest. Hashing a row while its
            // receipt is unbuilt would anchor `null` and the real digest would
            // arrive afterwards — the stored hash would then describe a receipt
            // state the row no longer has, and completing the receipt would
            // require rewriting an already-chained fact. Reviewer-found; the
            // hazard is guaranteed rather than theoretical, because retries are
            // owned by THIS worker, so any row needing one would be chained
            // while pending and completed after.
            //
            // 'complete' and 'failed' are both admissible and both terminal.
            // A failed receipt enters the chain with a null digest, and the
            // chain then commits to "at chain time this row had no
            // recomputable receipt" — permanently true, because failed never
            // recovers. Excluding failures instead would leave a real, billed
            // transaction outside the tamper-evident record, which is worse.
            //
            // NULL is admissible too: that is a pre-epoch row, or a row from a
            // rail not yet wired. Those chain under v1, exactly as before.
            sql`(${transactions.receiptStatus} IS NULL
                 OR ${transactions.receiptStatus} IN ('complete', 'failed'))`,
          ),
        )
        .orderBy(asc(transactions.completedAt), asc(transactions.id))
        .limit(BATCH_SIZE);

      // Rows that will never be chain-eligible must LEAVE the queue, or they
      // are reselected every tick forever and the bounded batch fills with work
      // that cannot progress — the starvation shape WP5's review caught one
      // package earlier. 'excluded' is terminal and says why.
      await tx
        .update(transactions)
        .set({ complianceHashState: "excluded" })
        .where(
          and(
            eq(transactions.complianceHashState, "pending"),
            lt(transactions.createdAt, pendingCutoff),
            // ALLOWLIST, not a denylist. A denylist silently drops any status
            // literal added later — 'refunded', 'cancelled', 'expired' — from
            // the audit chain with no signal at all. Naming what is excluded
            // means a new status stays 'pending' and shows up in the backlog
            // check instead of vanishing.
            sql`${transactions.status} IN ('health_probe')`,
          ),
        );

      if (pending.length === 0) return;

      let staleCount = 0;
      let completed = 0;
      let failed = 0;
      const staleCutoff = Date.now() - STALE_WARN_MS;

      // F-A-002: read the chain tip ONCE before the loop, then advance
      // `currentPrevious` on each successful row. `getPreviousHash()` uses a
      // pooled connection that can't see this tx's uncommitted writes, so
      // per-iteration queries would return the same predecessor for every
      // row in the batch — the chain would branch into a star instead of
      // linearising. Threading the hash manually restores linearity.
      //
      // Fault tolerance preserved: if a row's compute/update throws,
      // `currentPrevious` is NOT advanced, so the next row still chains
      // from the last good hash. The failed row flips to 'failed' via the
      // existing STALE_WARN_MS guard below.
      let currentPrevious = await getPreviousHash();

      for (const txn of pending) {
        if (txn.createdAt.getTime() < staleCutoff) {
          staleCount++;
        }

        try {
          // WHICH RULE HASHES THIS ROW, decided here and recorded here.
          //
          // The version column says which payload rule produced the hash, so
          // only this site may write it. The lifecycle module used to stamp
          // v2 independently, which produced rows hashed under v1 while
          // declaring v2 — they verified only because nothing had yet
          // implemented the documented rule.
          //
          // A row with receipt state is v2; a row without is v1. There is no
          // third case, because the admission predicate above already excluded
          // 'pending'.
          const chainVersion: ChainPayloadVersion =
            txn.receiptStatus === null ? CHAIN_PAYLOAD_V1 : CHAIN_PAYLOAD_V2;

          const hash = computeIntegrityHashVersioned(
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
              // v1 ignores this member entirely, so passing it is harmless
              // there and load-bearing here.
              receiptDigest: txn.receiptDigest ?? null,
            },
            currentPrevious,
            chainVersion,
          );

          await tx
            .update(transactions)
            .set({
              integrityHash: hash,
              previousHash: currentPrevious,
              complianceHashState: "complete",
              // WP7: claim the next chain position AT HASH TIME. This is what
              // makes the head well-defined — see getPreviousHash. Assigning it
              // here, in the same UPDATE as the hash, means a row cannot be
              // hashed without taking a position or take one without being
              // hashed.
              chainSeq: sql`nextval('transactions_chain_seq')`,
              // Same UPDATE as the hash, for the same reason chain_seq is:
              // a row cannot be hashed without recording which rule hashed it,
              // and cannot record a rule without being hashed.
              integrityPayloadVersion:
                chainVersion === CHAIN_PAYLOAD_V2 ? CHAIN_PAYLOAD_V2 : null,
            })
            .where(eq(transactions.id, txn.id));
          currentPrevious = hash;
          completed++;
        } catch (err) {
          // One row failing shouldn't take down the whole batch. Log and move on.
          logError("integrity-hash-retry-row-failed", err, { transactionId: txn.id });
          failed++;

          // If this row has been pending for well past STALE_WARN_MS, flip to
          // 'failed' so it stops clogging the queue and operators get a ping.
          if (Date.now() - txn.createdAt.getTime() > STALE_WARN_MS * MAX_HASH_ATTEMPTS) {
            await tx
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
        // CRIT-11: emit a structured health event so meta-monitoring's
        // alert channel surfaces the worker stall in real time, not just
        // when chain-health-monitoring runs its hourly tick. A silent worker
        // stall keeps customers' /v1/audit/:id at 202 forever — the brand
        // promise fails silently. logHealthEvent never throws.
        await logHealthEvent({
          eventType: "integrity_hash_stale",
          tier: 1,
          actionTaken: "logged",
          details: {
            stale_count: staleCount,
            batch_size: pending.length,
            stale_warn_ms: STALE_WARN_MS,
            note: "Worker likely behind or stalled. Check chain_pending_backlog metric and integrity-hash-retry log stream.",
          },
        });
      }

      log.info(
        { completed, failed, stale: staleCount, batch_size: pending.length },
        "integrity-hash-batch-done",
      );

      // CCO P0 #6: stuck-deferred sweep. The async/solution paths INSERT
      // rows as 'deferred' and flip to 'pending' on completion. If the
      // route handler dies between INSERT and completion UPDATE (Railway
      // restart, OOM, panic in the executor), the row stays 'deferred'
      // forever — invisible to this worker's primary query. Sweep them
      // up after STALE_DEFERRED_MS and flip to 'failed' so operators
      // see the drift in metrics rather than as silent integrity drift.
      const stuckDeferredCutoff = new Date(Date.now() - STALE_DEFERRED_MS);
      const stuckDeferred = await tx
        .select({ id: transactions.id, createdAt: transactions.createdAt })
        .from(transactions)
        .where(
          and(
            eq(transactions.complianceHashState, "deferred"),
            lt(transactions.createdAt, stuckDeferredCutoff),
          ),
        )
        .limit(BATCH_SIZE);

      if (stuckDeferred.length > 0) {
        for (const row of stuckDeferred) {
          await tx
            .update(transactions)
            .set({ complianceHashState: "failed" })
            .where(eq(transactions.id, row.id));
        }
        logWarn(
          "integrity-hash-stuck-deferred",
          `${stuckDeferred.length} transactions stuck in 'deferred' > 30 min — route handler likely died between INSERT and completion UPDATE; flipped to 'failed' for visibility`,
          { count: stuckDeferred.length },
        );
        // CRIT-11: same alert channel as integrity_hash_stale — these
        // are operationally similar (worker can't make progress) but
        // structurally different (a route handler died, not the worker).
        await logHealthEvent({
          eventType: "integrity_hash_stuck_deferred",
          tier: 1,
          actionTaken: "flipped_to_failed",
          details: {
            count: stuckDeferred.length,
            stale_deferred_ms: STALE_DEFERRED_MS,
            note: "Route handler died between INSERT (deferred) and completion UPDATE. Flipped to 'failed' for visibility. Investigate logs around the affected transaction IDs.",
          },
        });
      }
    });
  } catch (err) {
    logError("integrity-hash-retry-batch-failed", err);
  }
}

export function startIntegrityHashRetry(): void {
  if (_running) return;
  _running = true;

  log.info(`integrity-hash-retry: started (${INTERVAL_MS}ms interval, ${STARTUP_DELAY_MS}ms initial delay)`);

  setTimeout(() => {
    if (isShuttingDown()) return;
    runOnce().catch((err) => logError("integrity-hash-retry-startup-run-failed", err));
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    if (isShuttingDown()) return;
    runOnce().catch((err) => logError("integrity-hash-retry-run-failed", err));
  }, INTERVAL_MS);
}
