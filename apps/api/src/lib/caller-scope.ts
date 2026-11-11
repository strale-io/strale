/** Opaque, request-local identity used only for fair sharing of scarce resources. */
import { AsyncLocalStorage } from "node:async_hooks";
import { hashIp } from "./middleware.js";
import { trialRateBucket } from "./trial-eligibility.js";

const callerScope = new AsyncLocalStorage<string>();

/** Run as a caller without allowing nested capability calls to replace the original caller. */
export function runAsCaller<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const outer = callerScope.getStore();
  return outer === undefined ? callerScope.run(key, fn) : fn();
}

export function currentCallerKey(): string | null {
  return callerScope.getStore() ?? null;
}

/** Build an opaque caller key, grouping IPv6 clients by their /64 bucket. */
export function callerKeyForRequest(
  ip: string | null | undefined,
  payer?: string | null,
): string {
  if (payer) return `x402:${payer.toLowerCase()}`;
  const bucket = trialRateBucket(ip ?? "unknown");
  return `ip:${bucket === null ? "unknown" : hashIp(bucket)}`;
}
