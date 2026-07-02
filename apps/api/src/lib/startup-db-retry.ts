/**
 * Retry-with-backoff for the startup DB touchpoint (2026-07-02 outage).
 *
 * Incident chain: Postgres on Railway had a ~30-minute I/O degradation
 * episode; runStartupMigrations() threw CONNECT_TIMEOUT, main() exited,
 * and Railway's restartPolicyMaxRetries=10 was exhausted in minutes —
 * leaving the service permanently CRASHED for ~11 hours after Postgres
 * had recovered on its own.
 *
 * The fix: treat *transient connectivity* failures at startup as
 * wait-and-retry (in-process, with backoff, up to a time budget) instead
 * of instantly fatal. Each boot now absorbs STARTUP_DB_RETRY_BUDGET_MS
 * (default 10 min) of DB unavailability before giving up, so the 10
 * Railway restarts multiply to hours of tolerance instead of minutes.
 *
 * Non-transient errors (SQL errors, schema problems, bad credentials)
 * still abort the boot immediately — retrying those would only mask a
 * real bug. Migration blocks are idempotent by design, so re-running
 * the whole migration pass after a partial failure is safe.
 */

import { logWarn } from "./log.js";

/** Node socket-level errno codes that indicate the DB host is unreachable. */
const TRANSIENT_ERRNO_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);

/** postgres-js connection lifecycle codes (set on its own Error instances). */
const TRANSIENT_POSTGRES_JS_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
]);

/**
 * Server-side SQLSTATE codes that mean "Postgres exists but can't take
 * this connection right now" — startup/recovery/shutdown/resource
 * exhaustion. Class 08 = connection exception, class 53 = insufficient
 * resources, 57P0x = operator intervention (server starting up, in
 * recovery, shutting down). 57014 (query_canceled) covers the
 * "canceling authentication due to timeout" seen in the incident.
 */
const TRANSIENT_SQLSTATE_PREFIXES = ["08", "53"];
const TRANSIENT_SQLSTATE_CODES = new Set(["57P01", "57P02", "57P03", "57014"]);

export function isTransientDbConnectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const code = (err as Error & { code?: unknown }).code;
  if (typeof code === "string") {
    if (TRANSIENT_ERRNO_CODES.has(code)) return true;
    if (TRANSIENT_POSTGRES_JS_CODES.has(code)) return true;
    if (TRANSIENT_SQLSTATE_CODES.has(code)) return true;
    if (TRANSIENT_SQLSTATE_PREFIXES.some((p) => code.length === 5 && code.startsWith(p))) {
      return true;
    }
  }

  // Fallback: postgres-js sometimes surfaces timeouts as bare Errors
  // whose message carries the code (e.g. "write CONNECT_TIMEOUT ...").
  if (/CONNECT_TIMEOUT|ECONNREFUSED|ETIMEDOUT/.test(err.message)) return true;

  // AggregateError from Node's happy-eyeballs connect: transient if any
  // inner error is.
  if (err instanceof AggregateError) {
    return err.errors.some((inner) => isTransientDbConnectError(inner));
  }

  return false;
}

export interface StartupDbRetryOptions {
  /** Total time budget for retries, ms. Default 10 min (env STARTUP_DB_RETRY_BUDGET_MS). */
  budgetMs?: number;
  /** First backoff delay, ms. Doubles each attempt. Default 1000. */
  baseDelayMs?: number;
  /** Backoff cap, ms. Default 30000. */
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests. */
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function resolveBudgetMs(): number {
  const raw = process.env.STARTUP_DB_RETRY_BUDGET_MS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 10 * 60 * 1000;
}

/**
 * Run `fn`, retrying with exponential backoff for as long as the failure
 * is a transient DB connectivity error and the time budget allows.
 * Non-transient errors rethrow immediately. On budget exhaustion the
 * last transient error rethrows — the caller's fatal path takes over.
 */
export async function withStartupDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: StartupDbRetryOptions = {},
): Promise<T> {
  const budgetMs = opts.budgetMs ?? resolveBudgetMs();
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 30_000;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  const startedAt = now();
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientDbConnectError(err)) throw err;

      attempt += 1;
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const elapsedMs = now() - startedAt;

      if (elapsedMs + delayMs > budgetMs) {
        logWarn(
          "startup-db-retry-exhausted",
          `${label}: transient DB error persisted past retry budget — giving up`,
          { label, attempt, elapsed_ms: elapsedMs, budget_ms: budgetMs },
        );
        throw err;
      }

      logWarn(
        "startup-db-retry",
        `${label}: transient DB connect error — retrying in ${delayMs}ms`,
        {
          label,
          attempt,
          delay_ms: delayMs,
          elapsed_ms: elapsedMs,
          budget_ms: budgetMs,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      await sleep(delayMs);
    }
  }
}
