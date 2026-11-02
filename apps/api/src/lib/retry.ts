/**
 * Retry utility for transient network failures.
 *
 * Wraps an async function with a single retry on transient errors.
 * Non-retryable errors (validation, auth) propagate immediately.
 * On retry failure, throws the ORIGINAL error (more informative).
 */

import { APIError, APIConnectionError, APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { remainingCallMs } from "./call-cost.js";
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

const MAX_RETRY_AFTER_MS = 10_000;

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
  // SDK 0.78 exports these classes; do not infer SDK status from JSON text.
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) return true;
  if (error instanceof APIError) return error.status !== undefined &&
    ([408, 409, 429].includes(error.status) || error.status >= 500);
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
  const maxRetries = Math.max(0, Math.min(1, options?.maxRetries ?? 1));
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
      let jitteredDelay = delay + Math.random() * delay * 0.2;
      const retryAfter = error instanceof APIError ? error.headers?.get("retry-after") : null;
      if (retryAfter !== null && retryAfter !== undefined) {
        const seconds = Number(retryAfter);
        const headerDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(headerDelay)) {
          if (headerDelay > MAX_RETRY_AFTER_MS) throw lastError ?? error;
          jitteredDelay = Math.max(0, headerDelay);
        }
      }
      // Do not shorten a server's minimum wait to fit our budget and retry early.
      // If no time remains for another attempt, preserve the original error.
      let budget: number;
      try { budget = remainingCallMs(Number.MAX_SAFE_INTEGER); } catch { throw lastError ?? error; }
      if (jitteredDelay >= budget) throw lastError ?? error;

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

/**
 * The one transient-retry policy for running a capability executor on a
 * customer rail. Deterministic capabilities run once (a retry cannot change
 * their answer); everything else gets one retry after ~1 s on the transient
 * patterns above (429/502/503/504, network resets).
 *
 * Shared on purpose. Until 2026-10-19 only POST /v1/do applied this policy;
 * the x402 gateway called the executor bare, so a wallet buyer whose request
 * met a registry's momentary "slow down" failed where an account buyer's
 * identical request was retried and served (2026-10-05: eight paid French
 * lookups lost to HTTP 429 in three minutes). All customer rails, including solution steps, call this so the
 * policy cannot drift between them again.
 */
export function executeWithTransientRetry<T>(
  executor: (input: Record<string, unknown>) => Promise<T>,
  input: Record<string, unknown>,
  capability: { slug: string; capabilityType: string | null | undefined },
): Promise<T> {
  return capability.capabilityType === "deterministic"
    ? executor(input)
    : withRetry(() => executor(input), {
        maxRetries: 1,
        baseDelayMs: 1000,
        slug: capability.slug,
      });
}
