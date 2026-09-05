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
 *
 * Deliberately NOT built on lib/retry.ts withRetry(): that helper
 * classifies by message regex only (SQLSTATE/errno codes never appear
 * in a match-able form — "the database system is starting up" would be
 * non-retryable), is count-based rather than time-budget-based, and its
 * NON_RETRYABLE heuristics (/invalid/, /missing/) are tuned for
 * capability HTTP calls, not Postgres boot errors.
 */

import { logWarn } from "./log.js";
import { unwrapDbError } from "./db-error.js";

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
 * recovery, shutting down).
 *
 * 57014 (query_canceled) is deliberately NOT in this set: the DB config
 * applies a 30s statement_timeout, so a slow migration or invariant
 * query also surfaces as 57014 — retrying that for the full budget would
 * mask a real problem. It is treated as transient only when the message
 * matches the incident's specific "canceling authentication due to
 * timeout" shape (see isTransientDbConnectError).
 */
const TRANSIENT_SQLSTATE_PREFIXES = ["08", "53"];
const TRANSIENT_SQLSTATE_CODES = new Set(["57P01", "57P02", "57P03"]);

export function isTransientDbConnectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Since drizzle-orm 0.44 (PR #510, 2026-09-04), the migration/schema
  // functions this retries call db.execute() internally, and a connection
  // failure surfacing THROUGH a query attempt is rethrown wrapped in
  // DrizzleQueryError — the errno/SQLSTATE `code` this function keys on
  // moves from the caught error to its `.cause`. See lib/db-error.ts.
  const unwrapped = unwrapDbError(err);
  if (!(unwrapped instanceof Error)) return false;

  const code = (unwrapped as Error & { code?: unknown }).code;
  if (typeof code === "string") {
    if (TRANSIENT_ERRNO_CODES.has(code)) return true;
    if (TRANSIENT_POSTGRES_JS_CODES.has(code)) return true;
    if (TRANSIENT_SQLSTATE_CODES.has(code)) return true;
    if (TRANSIENT_SQLSTATE_PREFIXES.some((p) => code.length === 5 && code.startsWith(p))) {
      return true;
    }
    // 57014 = query_canceled. Transient only in its connection-phase form
    // ("canceling authentication due to timeout", the 2026-07-02 shape);
    // a statement_timeout on a real query must stay fatal.
    if (code === "57014" && /authenticat/i.test(unwrapped.message)) return true;
  }

  // Fallback: postgres-js sometimes surfaces timeouts as bare Errors
  // whose message carries the code (e.g. "write CONNECT_TIMEOUT ...").
  if (/CONNECT_TIMEOUT|ECONNREFUSED|ETIMEDOUT/.test(unwrapped.message)) return true;

  // AggregateError from Node's happy-eyeballs connect: transient if any
  // inner error is.
  if (unwrapped instanceof AggregateError) {
    return unwrapped.errors.some((inner) => isTransientDbConnectError(inner));
  }

  return false;
}

export interface StartupDbRetryOptions {
  /**
   * Total time budget for retries, ms. Default 10 min (env
   * STARTUP_DB_RETRY_BUDGET_MS). 0 disables retries entirely
   * (first transient error is fatal, the pre-2026-07-02 behaviour) —
   * it does NOT mean "retry forever".
   */
  budgetMs?: number;
  /**
   * Epoch ms the budget clock started. Pass the same value to every
   * call site in a boot sequence so the budget is shared across them
   * (one 10-min budget per boot, not 10 min × call sites). Defaults
   * to "now" at call time.
   */
  startedAt?: number;
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

  const startedAt = opts.startedAt ?? now();
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientDbConnectError(err)) throw err;

      attempt += 1;
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const elapsedMs = now() - startedAt;

      // >= so a delay ending exactly on the deadline doesn't schedule one
      // more attempt. Note the budget caps the SCHEDULING of retries, not
      // the duration of the final in-flight attempt — a connect/statement
      // timeout on the last try can run past the nominal budget by up to
      // its own timeout. That slack is acceptable; the cap exists to bound
      // the retry loop, not to be a hard wall-clock guarantee.
      if (elapsedMs + delayMs >= budgetMs) {
        logWarn(
          "startup-db-retry-exhausted",
          `${label}: database still unreachable after ${Math.round(elapsedMs / 1000)}s of automatic retries — giving up`,
          {
            label,
            attempt,
            elapsed_ms: elapsedMs,
            budget_ms: budgetMs,
            error: err instanceof Error ? err.message : String(err),
            next_action:
              "process will exit(1); Railway restart policy applies, then a critical email alert fires",
          },
        );
        throw err;
      }

      logWarn(
        "startup-db-retry",
        `${label}: database temporarily unreachable — retrying automatically in ${Math.round(delayMs / 1000)}s (attempt ${attempt}); no action needed yet`,
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
