// Capability executor registry
// Each capability is a TypeScript function that receives structured input
// and returns structured output + provenance.

import { getChain, executeWithFallback } from "../lib/data-provider.js";

export interface CapabilityInput {
  [key: string]: unknown;
}

export interface CapabilityResult {
  output: Record<string, unknown>;
  provenance: {
    source: string;
    fetched_at: string;
    [key: string]: unknown;
  };
}

export type CapabilityExecutor = (
  input: CapabilityInput,
) => Promise<CapabilityResult>;

// Registry maps slug → executor function
const executors = new Map<string, CapabilityExecutor>();

export function registerCapability(
  slug: string,
  executor: CapabilityExecutor,
): void {
  executors.set(slug, executor);
}

/**
 * Get the executor for a capability. If the capability has a DataProvider
 * fallback chain registered, returns a wrapper that executes through the
 * chain (trying providers in priority order). Otherwise returns the
 * directly registered executor.
 *
 * All call sites (do.ts, test-runner, recalibrate) get chain behavior
 * transparently — no per-site changes needed.
 */
export function getExecutor(slug: string): CapabilityExecutor | undefined {
  const chain = getChain(slug);
  if (chain) {
    return (input) => executeWithFallback(chain, input);
  }
  return executors.get(slug);
}

/**
 * Get the directly registered executor, bypassing any fallback chain.
 * Used by chain providers that delegate to the existing executor as fallback,
 * avoiding infinite recursion through getExecutor → chain → getExecutor.
 */
export function getDirectExecutor(slug: string): CapabilityExecutor | undefined {
  return executors.get(slug);
}

/** Number of directly registered executors. Used by the startup health gate. */
export function getRegisteredCount(): number {
  return executors.size;
}
