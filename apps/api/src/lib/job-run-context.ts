import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<{ failed: boolean }>();
/** A caught failure must not turn a resolved handler into a success heartbeat. */
export function noteJobFailure(): void {
  const current = context.getStore();
  if (current) current.failed = true;
}
export async function observeJobOutcome<T>(handler: () => Promise<T>): Promise<{ value: T; successful: boolean }> {
  return context.run({ failed: false }, async () => {
    const value = await handler();
    const result = value as { outcome?: string; failed?: number } | undefined;
    const outcome = result?.outcome;
    return { value, successful: !context.getStore()!.failed &&
      !(result?.failed && result.failed > 0) &&
      (!outcome || ["ok", "completed", "ingested", "skipped-unchanged", "unchanged"].includes(outcome)) };
  });
}

/** Failed findings still prove a check ran; a caught execution error does not. */
export function checksCompleted(results: readonly { details: string }[]): boolean {
  return results.length > 0 && !results.some((r) => /^Check (?:error|failed):/.test(r.details));
}
