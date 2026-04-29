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

// Test-only — vitest workers reuse module state across files; without a
// reset, a previous test's installed handlers stay attached and Node logs
// "MaxListenersExceededWarning". Not exported as part of the runtime API.
export function _resetForTests(): void {
  cleanups.length = 0;
  shuttingDown = false;
  installed = false;
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
