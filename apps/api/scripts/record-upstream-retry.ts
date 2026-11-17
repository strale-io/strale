export interface CheckAttempt {
  drift: string[];
  executorError?: { name: string; message: string };
  hasNonTimeoutFailure: boolean;
}

export interface TimeoutRetryResult {
  drift: string[];
  retried: boolean;
}

/** Retry one check attempt only when its caller classified it as timeout-only. */
export async function retryTimeoutOnce(run: () => Promise<CheckAttempt>): Promise<TimeoutRetryResult> {
  const first = await run();
  const timedOut = first.executorError !== undefined && (
    first.executorError.name === "TimeoutError"
    || first.executorError.name === "AbortError"
    || first.executorError.message.includes("The operation was aborted due to timeout")
  );
  if (!timedOut || first.hasNonTimeoutFailure) return { drift: first.drift, retried: false };

  const second = await run();
  return {
    drift: second.drift.map((line) => `${line} (after one retry)`),
    retried: true,
  };
}
