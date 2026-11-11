/** Opaque, request-local identity used only for fair sharing of scarce resources. */
import { AsyncLocalStorage } from "node:async_hooks";

const callerScope = new AsyncLocalStorage<string>();

/** Run as a caller without allowing nested capability calls to replace the original caller. */
export function runAsCaller<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const outer = callerScope.getStore();
  return outer === undefined ? callerScope.run(key, fn) : fn();
}

export function currentCallerKey(): string | null {
  return callerScope.getStore() ?? null;
}
