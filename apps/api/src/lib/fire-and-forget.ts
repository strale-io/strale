/**
 * F-0-009: replacement for the bare `.catch(() => {})` anti-pattern.
 *
 * Before: 89 sites in apps/api/src did `someAsyncWork().catch(() => {})`.
 * Any error from circuit-breaker writes, audit trail, integrity hashing,
 * quality capture, piggyback monitoring, or conversion emails was silently
 * swallowed — no log, no metric, no alert. Because those same routines
 * are compliance-critical (EU AI Act, GDPR), silence in failure was
 * indistinguishable from working.
 *
 * After: every site uses `fireAndForget(fn, { label, context })`. The
 * label is a kebab-case slug that groups the call in Pino; context is
 * any structured fields relevant to debugging (transactionId, slug,
 * userId). Errors log at `error` level but do not propagate.
 *
 * IMPORTANT: use this ONLY for non-safety-critical side effects — email
 * dispatch, analytics, cache warming, circuit-breaker telemetry. For
 * anything where correctness depends on the work completing (integrity
 * hashing, payment state transitions, refund logic), AWAIT the promise
 * and handle the error explicitly. The helper documents the distinction
 * at every call site via the `label` argument.
 *
 * An ESLint rule in .eslintrc prohibits bare `.catch(() => {})` so this
 * is the only way a Promise can be left to fail silently.
 */

import { logError } from "./log.js";

export interface FireAndForgetOptions {
  /** Stable kebab-case slug for grouping in the log sink. */
  label: string;
  /** Structured fields attached to the log line. Keep it small and non-PII. */
  context?: Record<string, unknown>;
}

/**
 * Invoke `fn()` without blocking, but log the label + context if it
 * rejects. Synchronous throws from `fn` itself are also caught (via the
 * Promise.resolve().then wrapping) so callers cannot accidentally blow
 * up the caller's frame.
 */
export function fireAndForget(
  fn: () => Promise<unknown>,
  opts: FireAndForgetOptions,
): void {
  Promise.resolve()
    .then(fn)
    .catch((err: unknown) => {
      logError(opts.label, err, opts.context);
    });
}
