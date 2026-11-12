/**
 * Recovery advice for one failed step of a bundle (promise-audit T1
 * follow-up 42).
 *
 * Before this module, the bundle routes rebuilt each step's advice from the
 * step's error STRING after the run, and set the bundle's own `retryable` from
 * "did every step fail" alone. The string has lost what the error object knew:
 * a refusal's exact fix, and whether a typed upstream failure can change on a
 * retry (a caller's site answering 404 cannot). So a bundle whose every step
 * was a site refusal told the caller to retry with backoff, and each step's
 * refusal advice was replaced by a generic one.
 *
 * The advice is now read from the error object at the moment the executor
 * catches it, and the bundle is retryable only when at least one failed step
 * is.
 */
import { recoveryDetails } from "./errors.js";
import { refusalDetails } from "./capability-refusal.js";
import { sanitizeFailureReason } from "./sanitize.js";
import { UpstreamUnavailableError } from "./upstream-result.js";

export interface StepFailure {
  capability_slug: string;
  /** This step's own advice: `retryable`, a `fix` or `next_step`, and its sanitized `error`. */
  details: Record<string, unknown>;
}

const RETRY_NEXT_STEP = "Retry with exponential backoff; contact support with the transaction_id if the failure continues.";
const NO_RETRY_NEXT_STEP = "A retry with the same input gets the same answer for this step; check the step's input or choose another tool.";

/**
 * Advice for one failed step, from the error (or the message) the executor
 * caught. `final` marks a step the platform itself stopped (withheld, not
 * deployed, refused by the guarded executor): a retry with the same input meets
 * the same stop, so the step says so instead of advising a backoff.
 */
export function stepFailure(capabilitySlug: string, err: unknown, opts: { final?: boolean } = {}): StepFailure {
  const message = err instanceof Error ? err.message : String(err);
  const error = sanitizeFailureReason(message.slice(0, 200));
  const refusal = refusalDetails(err);
  let details: Record<string, unknown>;
  if (opts.final) details = { retryable: false, next_step: NO_RETRY_NEXT_STEP, error };
  else if (refusal) details = { ...refusal, error };
  else if (err instanceof UpstreamUnavailableError)
    details = { retryable: err.retryable, next_step: err.retryable ? RETRY_NEXT_STEP : NO_RETRY_NEXT_STEP, error };
  else details = recoveryDetails("execution_failed", "", { error });
  return { capability_slug: capabilitySlug, details };
}

/** True when a retry could change at least one failed step. */
export function anyStepRetryable(failures: readonly StepFailure[]): boolean {
  return failures.some((f) => f.details.retryable !== false);
}

/** The per-step entries a bundle response lists under `details.errors`. */
export function stepFailureEntries(failures: readonly StepFailure[]): Record<string, unknown>[] {
  return failures.map((f) => ({ capability_slug: f.capability_slug, ...f.details }));
}
