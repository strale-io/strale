/**
 * WP10 — Durable Job Coordinator (CR-08).
 *
 * ## The defect this closes
 *
 * Every recurring job on the platform scheduled itself the same way:
 *
 *     setTimeout(() => { runOnce(); setInterval(runOnce, INTERVAL_MS); },
 *                STARTUP_DELAY_MS);
 *
 * Both arms live in process memory, so both are destroyed and rebuilt on every
 * process start. That makes the boot instant — not policy — the origin of the
 * schedule. Measured on production for the seven days to 2026-08-23:
 *
 *   - the median gap between process starts was **1.0 hour**;
 *   - `quality-floor`, declared `INTERVAL_MS = 24h`, completed **51 ticks**;
 *   - `capability-promotion`, declared 24h, completed **45 ticks**;
 *   - the **weekly** health sweep ran **141 times in 17.6 days** — 56x.
 *
 * Two consequences, and the second is the one that matters:
 *
 *  1. Long-period jobs run far too often. The `setInterval` arm is effectively
 *     unreachable for any period longer than a process lifetime, so the only
 *     arm that ever fires is the startup delay.
 *  2. The declared period is not merely inaccurate, it is *unobservable*. A
 *     reader of `INTERVAL_MS = 24h` has no way to learn that the job actually
 *     runs hourly. Enforcement jobs (quality-floor quarantines capabilities,
 *     capability-promotion publishes them) had their real policy window set by
 *     deploy frequency.
 *
 * ## The authority
 *
 * `job_schedule` owns *when a job is next due*. Code owns *how often* it
 * recurs; the table owns *when*. Registration at boot reconciles the interval
 * and deliberately leaves `next_run_at` alone — that single omission is what
 * makes a deploy stop resetting cadence.
 *
 * ## Why a lease and not an advisory lock
 *
 * The existing jobs already take advisory locks, and WP10 leaves those in
 * place. An advisory lock gives mutual exclusion *right now*; it vanishes the
 * instant the holder's connection drops, and it carries no memory. The lease
 * here is durable state with a deadline, which is what buys the other three
 * things CR-08 asks for: a crashed run is visible (`last_started_at` newer
 * than `last_finished_at`), it is recoverable (the lease expires and the job
 * becomes claimable again), and a failing run backs off instead of retrying at
 * full rate.
 *
 * Claiming is a single conditional UPDATE, so it is atomic without any lock:
 * two runners racing the same due job produce exactly one winner.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log, logError, logWarn } from "./log.js";
import { isShuttingDown } from "./shutdown.js";
import { randomUUID } from "node:crypto";
import { DeadlineExceeded, withDeadline } from "./with-deadline.js";

// ─── Tunables ───────────────────────────────────────────────────────────────

/**
 * How often the in-process timer asks the database what is due.
 *
 * This is the one timer WP10 keeps, and it is deliberately allowed to be
 * boot-relative: it holds no business fact. Losing it to a restart costs at
 * most one poll interval of latency, never a schedule.
 */
const POLL_INTERVAL_MS = 60_000;

/** First poll after boot. Short: the DB decides what is actually due. */
const POLL_STARTUP_DELAY_MS = 20_000;

/**
 * Lease duration. Must exceed the longest expected run: a lease that expires
 * under a still-running job lets a second runner start alongside it.
 * Overridable per job for the slow ones.
 */
const DEFAULT_LEASE_MS = 30 * 60 * 1000;

/** Retry backoff after a failed run: 2^failures minutes, capped. */
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 60 * 60 * 1000;

/** `last_error` is diagnostic, not an archive. */
const MAX_ERROR_LEN = 500;

/**
 * Hard ceiling on how long ONE handler may hold up the cycle.
 *
 * Jobs are awaited one after another, so waiting on a hung handler is time in
 * which no other job starts. Deriving the wait from the lease alone made that
 * ceiling the LEASE: the three 2h-lease jobs would have blocked every other job
 * for 118 minutes. `reindex-transactions` makes it concrete — it opens its own
 * postgres client and runs REINDEX with neither an AbortSignal nor a
 * statement_timeout, so it escapes the pool's 30s cap and genuinely can hang.
 *
 * Before WP10 each job had its own timer and could not delay any other, so an
 * unbounded wait here would be a regression the package introduced rather than
 * fixed.
 */
const MAX_HANDLER_WAIT_MS = 15 * 60 * 1000;

/**
 * How long to wait for a handler, given its lease.
 *
 * Two properties, and earlier versions of this package violated each in turn:
 *
 *  1. **Strictly shorter than the lease.** The first version set them equal, so
 *     abandoning a hung handler made the row claimable at that same instant and
 *     the next poll started a second copy on top of live work — in the same
 *     process, within one poll interval, for five jobs that hold no advisory
 *     lock. The margin is what the abandoned run keeps: exclusion until the
 *     full lease elapses, after which it is treated as crashed, which is the
 *     honest reading — we stopped waiting precisely because we no longer know
 *     whether it is alive.
 *  2. **Never above MAX_HANDLER_WAIT_MS**, so fixing (1) does not let one job
 *     stall the others for hours.
 *
 * Both are pinned across every lease size in real use by
 * `job-coordinator.watchdog.test.ts`.
 */
export function watchdogFor(leaseMs: number): number {
  return Math.min(
    MAX_HANDLER_WAIT_MS,
    Math.max(Math.floor(leaseMs / 2), leaseMs - 2 * POLL_INTERVAL_MS),
  );
}

/**
 * A handler that never settles must not be able to stop every other job.
 *
 * Before WP10 each job owned its own timer, so a hung handler stalled only
 * itself. Running them all from one poll cycle would hand any single job the
 * power to freeze the rest — a regression this package must not introduce,
 * and a worse failure than the boot-relative scheduling it replaces.
 *
 * The watchdog does not cancel the handler; nothing here can safely abort
 * arbitrary in-flight work. It stops the cycle AWAITING it, so the remaining
 * jobs get their turn.
 */
// ─── Types ──────────────────────────────────────────────────────────────────

export interface JobDefinition {
  /** Stable name. Changing it starts a fresh schedule, so treat it as an id. */
  name: string;
  /** Recurrence. Code is the authority for this; the table is reconciled to it. */
  intervalMs: number;
  /**
   * Delay before the FIRST-EVER run, applied only when the row is created.
   * On every later boot the stored `next_run_at` decides, so this cannot be
   * used to re-delay an existing schedule.
   */
  startupDelayMs?: number;
  /** Override when a run can legitimately exceed DEFAULT_LEASE_MS. */
  leaseMs?: number;
  handler: () => Promise<unknown>;
}

export interface ClaimedJob {
  jobName: string;
  intervalMs: number;
  /**
   * The per-claim token in `lease_owner`. Pass it back to `releaseJob`; it is
   * what stops a stale handler from writing over a successor's claim.
   */
  leaseOwner: string;
  consecutiveFailures: number;
  /** True when the previous run started and never recorded a finish. */
  recoveredFromCrash: boolean;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const _registry = new Map<string, JobDefinition>();
/**
 * Jobs whose row is not known to exist yet.
 *
 * `registerJob` is called from synchronous `startX()` functions that nobody
 * awaits, so a transient DB error at boot would otherwise leave a job present
 * in `_registry` and absent from `job_schedule` — `claimJob` would return null
 * forever and the job would be silently dead. That is a worse failure than the
 * boot-relative scheduling this package replaces, so the poll cycle retries
 * the upsert until it lands.
 */
const _unpersisted = new Set<string>();
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _startTimer: ReturnType<typeof setTimeout> | null = null;
let _polling = false;

/**
 * Identifies the PROCESS. Unique per boot, shared by every claim it makes.
 *
 * Deliberately not the thing `releaseJob` guards on — see `mintClaimToken`.
 */
const RUNNER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

export function runnerId(): string {
  return RUNNER_ID;
}

/**
 * The identity written into `lease_owner`: unique per CLAIM, not per process.
 *
 * `releaseJob` guards on this value, and that distinction is the whole point.
 * Guarding on `RUNNER_ID` alone was insufficient, because the realistic
 * takeover path is a job re-claimed by the SAME process on a later poll after
 * its lease expired — where the runner id is identical on both sides. A stale
 * handler returning late would then have satisfied the guard and been able to
 * overwrite its successor's outcome, next run time, error and failure count.
 *
 * No current code path issues a release for an abandoned run (the watchdog
 * rejects and the cycle moves on without awaiting the original promise), so
 * this closes the gap before anything reaches it rather than after. The token
 * makes the guarantee a property of the data, not of the call graph.
 *
 * Fits `varchar(64)`: pid + 8 hex + separator + 12 hex is well under.
 */
function mintClaimToken(): string {
  return `${RUNNER_ID}:${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Test seam. Does not touch the database. */
export function _resetRegistryForTests(): void {
  _registry.clear();
  _unpersisted.clear();
  if (_pollTimer) clearInterval(_pollTimer);
  if (_startTimer) clearTimeout(_startTimer);
  _pollTimer = null;
  _startTimer = null;
  _polling = false;
}

export function registeredJobNames(): string[] {
  return [..._registry.keys()].sort();
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Reconcile a job's row, then remember its handler.
 *
 * The ON CONFLICT clause is the heart of WP10. It updates `interval_ms`,
 * because code owns recurrence — but it does **not** write `next_run_at`,
 * because the table owns the schedule and a boot must not move it.
 *
 * The one exception is the clamp: if the interval shrinks (24h to 1h), a
 * `next_run_at` computed under the old interval can sit further out than the
 * new interval permits, and the job would silently keep the old cadence. The
 * clamp pulls it in to `last_finished_at + new interval`, never pushes it out.
 */
export async function registerJob(def: JobDefinition): Promise<void> {
  if (_registry.has(def.name)) {
    throw new Error(`job-coordinator: duplicate job registration "${def.name}"`);
  }
  if (!Number.isFinite(def.intervalMs) || def.intervalMs <= 0) {
    throw new Error(`job-coordinator: job "${def.name}" needs a positive intervalMs`);
  }
  // watchdogFor(lease) is strictly less than the lease for every lease >= 1,
  // but only meaningfully so above the millisecond range. A degenerate lease
  // would collapse the margin that keeps an abandoned run exclusive.
  if (def.leaseMs !== undefined && (!Number.isFinite(def.leaseMs) || def.leaseMs < 1_000)) {
    throw new Error(
      `job-coordinator: job "${def.name}" needs leaseMs >= 1000 (got ${String(def.leaseMs)})`,
    );
  }
  _registry.set(def.name, def);
  _unpersisted.add(def.name);
  await persistRegistration(def);
}

/**
 * Fire-and-forget registration for the synchronous `startX()` call sites.
 *
 * The job is in the registry the moment this returns, and the poll cycle
 * heals the row if the write failed, so a caller that cannot await is not
 * thereby accepting a silently dead job.
 */
export function registerJobSync(def: JobDefinition): void {
  void registerJob(def).catch((err) =>
    logError("job-coordinator-register-failed", err, { job: def.name }),
  );
}

async function persistRegistration(def: JobDefinition): Promise<void> {
  const db = getDb();
  const startupDelaySecs = (def.startupDelayMs ?? 0) / 1000;
  const intervalSecs = def.intervalMs / 1000;

  await db.execute(sql`
    INSERT INTO job_schedule (job_name, interval_ms, next_run_at)
    VALUES (
      ${def.name},
      ${def.intervalMs},
      now() + make_interval(secs => ${startupDelaySecs})
    )
    ON CONFLICT (job_name) DO UPDATE SET
      interval_ms = EXCLUDED.interval_ms,
      -- Clamp only a job that has actually run. For one that has not,
      -- COALESCE(last_finished_at, now()) collapsed to now(), so re-registering
      -- a job whose startup delay exceeds its interval silently PULLED its
      -- first run in and discarded the stagger. No current job trips that
      -- (largest delay 20min against a 24h interval) but it was a trap for the
      -- next one, and the doc above promises only that a boot cannot push a
      -- run out — not that it may drag one forward.
      next_run_at = CASE
        WHEN job_schedule.last_finished_at IS NULL THEN job_schedule.next_run_at
        ELSE LEAST(
          job_schedule.next_run_at,
          job_schedule.last_finished_at + make_interval(secs => ${intervalSecs})
        )
      END,
      updated_at = now()
  `);
  _unpersisted.delete(def.name);
}

// ─── Claim / release ────────────────────────────────────────────────────────

/**
 * Atomically claim a job if it is due and unheld.
 *
 * One statement, so no lock is needed: concurrent runners serialise on the
 * row and exactly one sees a matching `WHERE`. A lease whose deadline has
 * passed is claimable — that is how a crashed run recovers.
 */
export async function claimJob(name: string): Promise<ClaimedJob | null> {
  const def = _registry.get(name);
  return claimRow(name, (def?.leaseMs ?? DEFAULT_LEASE_MS) / 1000);
}

/**
 * The claim statement itself. `claimJob` is its only caller; it is factored
 * out so there is exactly one definition of "due and unheld" in the codebase.
 */
async function claimRow(name: string, leaseSecs: number): Promise<ClaimedJob | null> {
  const db = getDb();
  const claimToken = mintClaimToken();

  // The CTE snapshots the row BEFORE the update, because "did the previous run
  // finish?" is a question about the old values and `RETURNING` sees the new
  // ones. Without it, `last_started_at = now()` makes every claim look like a
  // started-and-never-finished run, and a job's FIRST EVER execution would be
  // reported as crash recovery on every fresh deploy — noise that would bury
  // the real thing it exists to surface.
  const rows = await db.execute(sql`
    WITH prev AS (
      SELECT job_name, last_started_at, last_finished_at
        FROM job_schedule
       WHERE job_name = ${name}
    )
    UPDATE job_schedule js
       SET lease_owner = ${claimToken},
           lease_expires_at = now() + make_interval(secs => ${leaseSecs}),
           last_started_at = now(),
           updated_at = now()
      FROM prev
     WHERE js.job_name = prev.job_name
       AND js.next_run_at <= now()
       AND (js.lease_owner IS NULL OR js.lease_expires_at IS NULL OR js.lease_expires_at < now())
    RETURNING js.job_name, js.interval_ms, js.consecutive_failures,
              (prev.last_started_at IS NOT NULL AND prev.last_finished_at IS NULL) AS recovered
  `);

  const row = (rows as unknown as Array<Record<string, unknown>>)[0];
  if (!row) return null;

  const recoveredFromCrash = row.recovered === true;

  return {
    jobName: String(row.job_name),
    intervalMs: Number(row.interval_ms),
    leaseOwner: claimToken,
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    recoveredFromCrash,
  };
}

/**
 * Record a terminal outcome and schedule the next run.
 *
 * Success schedules `now() + interval`. Failure schedules an exponential
 * backoff that is capped at RETRY_MAX_MS and never pushed beyond the normal
 * interval — a failing daily job retries within the hour rather than tomorrow,
 * which is the durable retry state CR-08 asks for.
 *
 * Every write here is conditional on the CLAIM that produced it still holding
 * the row. A run whose lease expired and was taken over — by another process
 * or, more likely, by this same one on a later poll — matches nothing and
 * writes nothing: it cannot release the successor's lease, mark it complete or
 * failed, reset its attempt counter, move its next run, or overwrite its
 * error. The guard is the per-claim token, not the process id, because those
 * two are the same value on the re-claim path that actually happens.
 */
export async function releaseJob(
  claim: Pick<ClaimedJob, "jobName" | "leaseOwner">,
  outcome: "ok" | "error",
  errorMessage?: string,
): Promise<void> {
  const { jobName: name, leaseOwner: claimToken } = claim;
  const db = getDb();
  const failed = outcome === "error";
  const retryBaseSecs = RETRY_BASE_MS / 1000;
  const retryMaxSecs = RETRY_MAX_MS / 1000;

  await db.execute(sql`
    UPDATE job_schedule
       SET lease_owner = NULL,
           lease_expires_at = NULL,
           last_finished_at = now(),
           last_outcome = ${outcome},
           last_error = ${failed ? (errorMessage ?? "unknown").slice(0, MAX_ERROR_LEN) : null},
           consecutive_failures = ${
             failed ? sql`job_schedule.consecutive_failures + 1` : sql`0`
           },
           next_run_at = ${
             failed
               ? sql`now() + make_interval(secs => LEAST(
                   ${retryMaxSecs},
                   ${retryBaseSecs} * power(2, LEAST(job_schedule.consecutive_failures, 16)),
                   job_schedule.interval_ms / 1000.0
                 ))`
               : sql`now() + make_interval(secs => job_schedule.interval_ms / 1000.0)`
           },
           updated_at = now()
     WHERE job_name = ${name}
       AND lease_owner = ${claimToken}
  `);
}

// ─── Ad-hoc due-checks ──────────────────────────────────────────────────────

/**
 * Durable replacement for an in-process "have I done this recently?" throttle.
 *
 * The test scheduler gated seven auxiliary tasks on a module-level
 * `Record<string, number>` whose comment read "in-memory — reset on deploy is
 * fine". It was not fine. Two of those tasks are declared WEEKLY, and one of
 * them — the health sweep — probes external URLs and applies auto-remediation.
 * Measured on production: **141 sweep runs in 17.6 days, 56x the declared
 * weekly cadence**, because the map reset on every process start and the
 * median process lifetime was 1.0 hour.
 *
 * Unlike `registerJob` these tasks have no boot-time registration: the row is
 * created on first use, due immediately, which preserves the old behaviour of
 * a missing map entry meaning "run now".
 *
 * Returns true if the task ran (in which case `fn`'s own errors have already
 * propagated), false if it was not due or another runner held it.
 */
export async function consumeDueSlot(name: string, intervalMs: number): Promise<boolean> {
  const db = getDb();
  const intervalSecs = intervalMs / 1000;

  // Create the row due-now on first sight: a missing in-memory map entry used
  // to mean "run now", and that behaviour is preserved for a fresh database.
  await db.execute(sql`
    INSERT INTO job_schedule (job_name, interval_ms, next_run_at)
    VALUES (${name}, ${intervalMs}, now())
    ON CONFLICT (job_name) DO UPDATE SET
      interval_ms = EXCLUDED.interval_ms,
      -- Clamp only a job that has actually run. For one that has not,
      -- COALESCE(last_finished_at, now()) collapsed to now(), so re-registering
      -- a job whose startup delay exceeds its interval silently PULLED its
      -- first run in and discarded the stagger. No current job trips that
      -- (largest delay 20min against a 24h interval) but it was a trap for the
      -- next one, and the doc above promises only that a boot cannot push a
      -- run out — not that it may drag one forward.
      next_run_at = CASE
        WHEN job_schedule.last_finished_at IS NULL THEN job_schedule.next_run_at
        ELSE LEAST(
          job_schedule.next_run_at,
          job_schedule.last_finished_at + make_interval(secs => ${intervalSecs})
        )
      END,
      updated_at = now()
  `);

  // No lease: every caller of this helper already runs inside the test
  // scheduler's advisory lock (LOCK_ID 314159), so cross-process exclusion is
  // established. The single conditional UPDATE is still atomic on its own.
  //
  // Only the START is recorded. The first version also wrote
  // `last_finished_at = now(), last_outcome = 'ok'` here — before the task had
  // run — so a sweep that then threw was recorded as a success. These rows are
  // never claimed through `claimJob` (the poll cycle iterates the registry, and
  // these tasks are not in it), so a null finish mark misleads no one, whereas
  // a fabricated 'ok' would.
  const rows = await db.execute(sql`
    UPDATE job_schedule
       SET next_run_at = now() + make_interval(secs => job_schedule.interval_ms / 1000.0),
           last_started_at = now(),
           updated_at = now()
     WHERE job_name = ${name}
       AND next_run_at <= now()
    RETURNING job_name
  `);

  return (rows as unknown as Array<unknown>).length > 0;
}

// ─── Poll cycle ─────────────────────────────────────────────────────────────

/**
 * Try every registered job once. Exported for tests and for the admin path:
 * calling it is always safe, because the database decides what is due.
 *
 * Jobs are attempted SEQUENTIALLY, so MAX_HANDLER_WAIT_MS bounds one handler,
 * not one cycle: eleven simultaneous hangs would stall the last job for eleven
 * times that. Do not read the ceiling as a cycle bound.
 *
 * Nor is it the whole per-job bound. `claimJob` and `releaseJob` run OUTSIDE
 * the watchdog; both go through the shared pool, so each is capped by its
 * `statement_timeout` (30s, db/index.ts). The honest per-job worst case is
 * therefore the watchdog plus roughly two statement timeouts.
 */
export async function runDueJobs(): Promise<{
  ran: string[];
  skipped: string[];
  timedOut: string[];
}> {
  const ran: string[] = [];
  const skipped: string[] = [];
  const timedOut: string[] = [];

  // Heal any registration whose write failed at boot before deciding what is
  // due — a job with no row can never be claimed.
  for (const name of [..._unpersisted]) {
    const def = _registry.get(name);
    if (!def) {
      _unpersisted.delete(name);
      continue;
    }
    try {
      await persistRegistration(def);
      logWarn("job-coordinator-registration-healed", "job row created on a later poll", {
        job: name,
      });
    } catch (err) {
      logError("job-coordinator-register-retry-failed", err, { job: name });
    }
  }

  for (const def of _registry.values()) {
    if (isShuttingDown()) break;
    if (_unpersisted.has(def.name)) {
      skipped.push(def.name);
      continue;
    }

    let claim: ClaimedJob | null = null;
    try {
      claim = await claimJob(def.name);
    } catch (err) {
      logError("job-coordinator-claim-failed", err, { job: def.name });
      continue;
    }
    if (!claim) {
      skipped.push(def.name);
      continue;
    }

    if (claim.recoveredFromCrash) {
      logWarn("job-coordinator-recovered", "claimed a job whose previous run never finished", {
        job: def.name,
        consecutive_failures: claim.consecutiveFailures,
      });
    }

    const startedAt = Date.now();
    const leaseMs = def.leaseMs ?? DEFAULT_LEASE_MS;
    const watchdogMs = watchdogFor(leaseMs);
    const watchdogLabel = `job "${def.name}"`;
    try {
      // The label is the sentinel the catch matches on. `withDeadline` is a
      // shared primitive and handlers use it too (onboarding-retry bounds each
      // slug with it), so matching the CLASS alone would misread a handler's
      // own nested deadline as this cycle's watchdog firing — recording no
      // failure, arming no backoff, and leaving the job unclaimable for the
      // rest of its lease. Reviewer-found; latent, because the one handler
      // that uses withDeadline today catches its own.
      await withDeadline(watchdogLabel, watchdogMs, Promise.resolve(def.handler()));
      await releaseJob(claim, "ok");
      ran.push(def.name);
      log.info(
        {
          label: "job-coordinator-ran",
          job: def.name,
          duration_ms: Date.now() - startedAt,
          interval_ms: def.intervalMs,
        },
        "job-coordinator-ran",
      );
    } catch (err) {
      if (err instanceof DeadlineExceeded && err.label === watchdogLabel) {
        // Deliberately NOT released. The handler is still running — this
        // process merely stopped waiting for it. Releasing here would clear
        // the lease out from under live work and let the next poll start a
        // SECOND copy of the same job. Instead the lease runs out on its own,
        // which is the same state a crashed run leaves behind and is recovered
        // the same way: visibly, once, by whoever claims it next.
        logError("job-coordinator-job-timed-out", err, {
          job: def.name,
          waited_ms: watchdogMs,
          lease_ms: leaseMs,
          consequence:
            "still holds its lease for another " +
            `${Math.round((leaseMs - watchdogMs) / 1000)}s; not rescheduled by this runner`,
        });
        timedOut.push(def.name);
        continue;
      }

      const message = err instanceof Error ? err.message : String(err);
      logError("job-coordinator-job-failed", err, { job: def.name });
      // Releasing on the failure path is what arms the backoff. If this
      // itself throws the lease is left behind, and its deadline is the
      // backstop — the job becomes claimable again when the lease expires.
      await releaseJob(claim, "error", message).catch((relErr) =>
        logError("job-coordinator-release-failed", relErr, { job: def.name }),
      );
      ran.push(def.name);
    }
  }

  return { ran, skipped, timedOut };
}

async function pollCycle(): Promise<void> {
  if (_polling) return;
  _polling = true;
  try {
    await runDueJobs();
  } catch (err) {
    logError("job-coordinator-poll-failed", err);
  } finally {
    _polling = false;
  }
}

/**
 * Start the single timer.
 *
 * Idempotent, and safe to call before any job registers: the registry is read
 * at each poll, not captured here.
 */
export function startJobCoordinator(): void {
  if (_pollTimer || _startTimer) return;
  _startTimer = setTimeout(() => {
    void pollCycle();
    _pollTimer = setInterval(() => void pollCycle(), POLL_INTERVAL_MS);
    _pollTimer.unref?.();
  }, POLL_STARTUP_DELAY_MS);
  _startTimer.unref?.();

  log.info(
    {
      label: "job-coordinator-started",
      poll_interval_ms: POLL_INTERVAL_MS,
      runner_id: RUNNER_ID,
    },
    "job-coordinator-started",
  );
}
