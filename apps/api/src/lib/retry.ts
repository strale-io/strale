/**
 * Retry utility for transient network failures.
 *
 * Wraps an async function with a single retry on transient errors.
 * Non-retryable errors (validation, auth) propagate immediately.
 * On retry failure, throws the ORIGINAL error (more informative).
 */

import { logWarn } from "./log.js";

export interface RetryOptions {
  /** Max number of retries after the first attempt. Default: 1 */
  maxRetries?: number;
  /** Base delay before first retry in ms. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 5000 */
  maxDelayMs?: number;
  /** Additional retryable patterns beyond defaults */
  retryableErrors?: RegExp[];
  /** Slug for logging (optional) */
  slug?: string;
}

const DEFAULT_RETRYABLE: RegExp[] = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /fetch failed/i,
  /network error/i,
  /socket hang up/i,
  /HTTP 429/i,
  /HTTP 502/i,
  /HTTP 503/i,
  /HTTP 504/i,
];

const NON_RETRYABLE: RegExp[] = [
  /required/i,
  /invalid/i,
  /missing/i,
  /unauthorized/i,
  /api.key/i,
  /forbidden/i,
  /not found/i,
  /bad request/i,
];

function isRetryable(error: Error, extraPatterns: RegExp[]): boolean {
  const msg = error.message;

  // Check non-retryable first — these should never retry
  for (const pattern of NON_RETRYABLE) {
    if (pattern.test(msg)) return false;
  }

  // Check retryable patterns
  const allPatterns = [...DEFAULT_RETRYABLE, ...extraPatterns];
  for (const pattern of allPatterns) {
    if (pattern.test(msg)) return true;
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 1;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 5000;
  const extraPatterns = options?.retryableErrors ?? [];
  const slug = options?.slug ?? "unknown";

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (attempt === 0) {
        lastError = error;
      }

      // On last attempt or non-retryable error, throw
      if (attempt >= maxRetries || !isRetryable(error, extraPatterns)) {
        throw lastError ?? error;
      }

      // Compute delay with jitter
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitteredDelay = delay + Math.random() * delay * 0.2;

      logWarn("retry-attempt", "retry attempt failed, waiting", {
        slug,
        attempt: attempt + 1,
        err: error.message,
        delay_ms: Math.round(jitteredDelay),
      });

      await new Promise((r) => setTimeout(r, jitteredDelay));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error("withRetry: exhausted all attempts");
}
