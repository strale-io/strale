export interface CheckAttempt {
  drift: string[];
  executorError?: { name: string; message: string };
  /**
   * True when every finding in this attempt is the upstream being briefly
   * unavailable rather than its contract changing: the executor's one failure
   * was a timeout or followed an upstream 5xx/429 answer, and any status the
   * recording no longer matches moved to 5xx/429. Set by the caller.
   */
  transient: boolean;
}

export interface TransientRetryResult {
  drift: string[];
  retried: boolean;
  /** Both attempts failed only because the upstream was unavailable. Reported, not drift. */
  unavailable: boolean;
}

export function isTimeoutError(error: { name: string; message: string } | undefined): boolean {
  return error !== undefined && (
    error.name === "TimeoutError"
    || error.name === "AbortError"
    || error.message.includes("The operation was aborted due to timeout")
  );
}

/** An upstream answer that says "not now" rather than "this request is wrong". */
export function isUnavailableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export interface LiveRunShape {
  /** Known-answer failures plus a thrown executor, as judged for this run. */
  failureCount: number;
  executorError?: { name: string; message: string };
  oversizeCount: number;
  /** Statuses of every response the executor received in this run. */
  liveStatuses: number[];
  /** Live statuses of the recorded requests whose status no longer matches. */
  changedToStatuses: number[];
  recordingExpired: boolean;
}

/**
 * The run failed only because the upstream was briefly unavailable: the one
 * failure is the executor throwing on a timeout or right after a 5xx/429
 * answer, and nothing else changed. A known-answer mismatch, a network error
 * before any answer ("fetch failed"), a 2xx turning 4xx, an oversize body or
 * an expired recording are never transient.
 */
export function isTransientRun(run: LiveRunShape): boolean {
  const causedByUpstream = run.executorError !== undefined && (
    isTimeoutError(run.executorError) || run.liveStatuses.some(isUnavailableStatus)
  );
  return run.failureCount === 1
    && causedByUpstream
    && run.oversizeCount === 0
    && run.changedToStatuses.every(isUnavailableStatus)
    && !run.recordingExpired;
}

/**
 * Retry one check attempt once when its caller classified it as transient.
 *
 * Thirty-two public sources are called once a week; on most weeks one of them
 * times out or answers 503 for a moment, and that alone turned the whole weekly
 * sweep red for four runs in a row (2026-10-26 to 2026-11-16) while no contract
 * had changed. A transient failure is retried after `waitMs`; if the second
 * attempt is still transient, it is reported as the upstream being unavailable
 * and is not counted as drift. Anything else (a changed answer, a request no
 * longer made by a working executor, a 2xx turning 4xx, an expired recording)
 * is drift on the first attempt.
 */
export async function retryTransientOnce(
  run: () => Promise<CheckAttempt>,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 20_000)),
): Promise<TransientRetryResult> {
  const first = await run();
  if (!first.transient) return { drift: first.drift, retried: false, unavailable: false };

  await wait();
  const second = await run();
  return {
    drift: second.drift.map((line) => `${line} (after one retry)`),
    retried: true,
    unavailable: second.transient && second.drift.length > 0,
  };
}
