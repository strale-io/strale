// Cert-audit C3 + C10 follow-up: graceful-shutdown machinery so that a
// Railway redeploy (which sends SIGTERM, then SIGKILL after ~30s) drains
// in-flight HTTP requests, closes the DB pool cleanly, and stops background
// jobs instead of being torn down mid-write.
//
// Pattern: modules call `onShutdown(label, fn)` to register cleanup work;
// `installShutdownHandlers()` wires SIGTERM/SIGINT to run them in LIFO order
// with a hard timeout. Background jobs check `isShuttingDown()` at the top
// of their tick to avoid starting new units of work during the drain window.

import { log, logError } from "./log.js";

type Cleanup = { label: string; fn: () => Promise<void> | void };

const cleanups: Cleanup[] = [];
let shuttingDown = false;
let installed = false;

export function onShutdown(label: string, fn: () => Promise<void> | void): void {
  cleanups.push({ label, fn });
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// ─── Background task tracking (cert-audit Y-6) ─────────────────────────────
//
// `server.close()` only drains in-flight HTTP REQUESTS. The async
// /v1/do path returns HTTP 202 immediately and continues executing in
// a fire-and-forget promise — by the time SIGTERM arrives, the HTTP
// layer thinks the request already finished and lets the server close,
// after which SIGKILL kills the executor mid-write at +25s. The DB row
// stays in `executing` until the 30-min integrity-hash-retry janitor
// flips it to `failed`. Customer's wallet was already debited; refund
// only fires on completion of the catch block in executeInBackground,
// which never runs because the process was killed.
//
// Fix: every fire-and-forget background task that mutates DB state
// registers itself with the tracker. On shutdown, we await all tracked
// promises (with a deadline that respects the overall 25s budget)
// BEFORE the HTTP server / DB pool cleanup runs.

const inflightTasks = new Set<Promise<unknown>>();

/**
 * Register a background promise so graceful shutdown can wait for it.
 * Returns the promise verbatim so callers can chain `.catch(...)`.
 *
 * Use for: executeInBackground, executeSolutionInBackground, anything
 * else that mutates DB state outside the HTTP request lifecycle.
 *
 * Don't use for: lightweight metric/circuit-breaker fire-and-forget
 * (they're short and idempotent; awaiting them on shutdown adds no
 * customer-visible value).
 */
export function trackBackgroundTask<T>(
  label: string,
  promise: Promise<T>,
): Promise<T> {
  inflightTasks.add(promise);
  // The underlying promise's rejection is the caller's concern; we
  // only catch here so the tracking chain doesn't surface as an
  // unhandled rejection on the .finally(). The arg shape (err) is
  // required by the F-0-009 lint guard — bare `() => {}` is forbidden.
  promise
    .finally(() => inflightTasks.delete(promise))
    .catch((err) => { void err; });
  // Trace tracking only at debug; the promise itself logs its own outcome.
  log.debug?.({ label: "background.tracked", task: label, inflight: inflightTasks.size }, "background.tracked");
  return promise;
}

/**
 * Returns the count of currently-tracked tasks. Exposed for ops surfaces
 * (e.g. /health) and for tests.
 */
export function getInflightTaskCount(): number {
  return inflightTasks.size;
}

// Test-only — vitest workers reuse module state across files; without a
// reset, a previous test's installed handlers stay attached and Node logs
// "MaxListenersExceededWarning". Not exported as part of the runtime API.
export function _resetForTests(): void {
  cleanups.length = 0;
  shuttingDown = false;
  installed = false;
  inflightTasks.clear();
}

export function installShutdownHandlers(opts?: { timeoutMs?: number }): void {
  if (installed) return;
  installed = true;
  // Railway sends SIGKILL 30s after SIGTERM, so the cleanup budget has to
  // leave enough room to finish + log + flush before the kernel kills us.
  const TIMEOUT = opts?.timeoutMs ?? 25_000;

  const handle = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ label: "shutdown.start", signal, cleanups: cleanups.length }, "shutdown.start");

    const force = setTimeout(() => {
      logError("shutdown.timeout", new Error(`exceeded ${TIMEOUT}ms cleanup budget`));
      process.exit(1);
    }, TIMEOUT);
    // Don't let the force-exit timer keep the loop alive on its own.
    force.unref();

    void (async () => {
      // Cert-audit Y-6: drain in-flight background tasks BEFORE the
      // HTTP server closes and the DB pool exits. Otherwise async
      // /v1/do calls that returned 202 keep running into a torn-down
      // pool and crash mid-write. Budget: half the cleanup deadline,
      // so the rest (server.close, db pool drain, log flush) still
      // has room before SIGKILL at +30s.
      const drainBudget = Math.max(5_000, Math.floor(TIMEOUT / 2));
      if (inflightTasks.size > 0) {
        log.info({ label: "shutdown.background.drain.start", count: inflightTasks.size, budget_ms: drainBudget }, "shutdown.background.drain.start");
        const tasks = [...inflightTasks];
        const deadline = new Promise<"deadline">((resolveDeadline) => {
          const t = setTimeout(() => resolveDeadline("deadline"), drainBudget);
          t.unref();
        });
        // Promise.allSettled never throws — we don't care about the
        // individual outcomes here, only that we waited.
        await Promise.race([Promise.allSettled(tasks), deadline]);
        log.info({ label: "shutdown.background.drain.end", remaining: inflightTasks.size }, "shutdown.background.drain.end");
      }

      // LIFO: HTTP server (registered last) drains before DB pool closes,
      // so requests in flight can still reach the database.
      for (const { label, fn } of [...cleanups].reverse()) {
        try {
          await Promise.resolve(fn());
          log.info({ label: "shutdown.step.ok", step: label }, "shutdown.step.ok");
        } catch (err) {
          logError(`shutdown.step.${label}`, err);
        }
      }
      log.info({ label: "shutdown.complete" }, "shutdown.complete");
      clearTimeout(force);
      process.exit(0);
    })();
  };

  process.on("SIGTERM", () => handle("SIGTERM"));
  process.on("SIGINT", () => handle("SIGINT"));
}
