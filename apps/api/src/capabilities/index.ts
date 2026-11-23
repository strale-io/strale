import { PROVIDERS } from "../lib/dependency-manifest.js";
import { noteUnknownCost, withExpectedLlmUsage } from "../lib/call-cost.js";
// Capability executor registry
// Each capability is a TypeScript function that receives structured input
// and returns structured output + provenance.

import { getChain, executeWithFallback } from "../lib/data-provider.js";
import { getDataAccess, stampDataAccess, withAcquisitionMethod } from "../lib/data-access.js";
import { toStorableJson } from "../lib/storable-json.js";
import { logWarn } from "../lib/log.js";

export interface CapabilityInput {
  [key: string]: unknown;
}

export type { CapabilityFile } from "../lib/jobs/files.js";
import type { CapabilityFile } from "../lib/jobs/files.js";

export interface CapabilityResult {
  output: Record<string, unknown>;
  provenance: {
    source: string;
    fetched_at: string;
    [key: string]: unknown;
  };
  /**
   * Files the execution produced (portfolio 2.11). Stored and served by
   * signed URL on the async path only; see lib/jobs/files.ts for the caps.
   */
  files?: CapabilityFile[];
}

export type CapabilityExecutor = (
  input: CapabilityInput,
) => Promise<CapabilityResult>;

// Registry maps slug → executor function
const anthropicProvider = PROVIDERS.find((provider) => provider.name === "anthropic");
const llmSlugs = new Set([...(anthropicProvider?.capabilities ?? []), ...(anthropicProvider?.fallbackCapabilities ?? [])]);
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
 *
 * The same holds for the manifest's `data_access` block (DEC-20261023-A):
 * the returned executor fills the acquisition method, lane and vendor into
 * provenance wherever the executor left them unset (see lib/data-access.ts).
 */
export function getExecutor(slug: string): CapabilityExecutor | undefined {
  const chain = getChain(slug);
  const base: CapabilityExecutor | undefined = chain
    ? (input) => executeWithFallback(chain, input)
    : executors.get(slug);
  if (!base) return undefined;
  const access = getDataAccess(slug);

  return async (input) => {
    if (!access || (access.acquisition_method !== "computed" &&
      !(access.acquisition_method === "vendor_api" && ["serper", "dilisense", "esortcode", "browserless", "openregister"].includes(access.upstream_vendor ?? "")))) noteUnknownCost(`unmetered_upstream:${slug}`);
    let raw: CapabilityResult;
    try {
      raw = await withAcquisitionMethod(access?.acquisition_method, () => llmSlugs.has(slug) ? withExpectedLlmUsage(() => base(input)) : base(input));
    } catch (err) {
      throw storableError(slug, err);
    }
    const result = storable(slug, raw);
    if (!access) return result;
    if (!result || typeof result.provenance !== "object" || result.provenance === null) return result;
    return { ...result, provenance: stampDataAccess(result.provenance, access) };
  };
}

/**
 * A failed call records its error message (the transaction row, the audit
 * trail, a solution's step list), so a message carrying U+0000 or an unpaired
 * surrogate fails that write the same way an output does. The error is cleaned
 * in place and rethrown, so its class and any fields callers read from it
 * (refusal details, error codes) are unchanged.
 */
function storableError(slug: string, err: unknown): unknown {
  if (typeof err === "string") {
    const cleaned = toStorableJson(err);
    if (cleaned.removed > 0) logWarn("capability-error-unstorable-chars-removed", "removed characters the database cannot store from a tool error", { slug, removed: cleaned.removed });
    return cleaned.value;
  }
  // Errors, and plain thrown objects whose message callers read (dispatch
  // reads `.message` off non-Error throws too).
  if (typeof err !== "object" || err === null) return err;
  const message = (err as { message?: unknown }).message;
  if (typeof message !== "string") return err;
  const cleaned = toStorableJson(message);
  if (cleaned.removed === 0) return err;
  const target = err as { message: unknown };
  let written = false;
  try {
    target.message = cleaned.value;
    written = target.message === cleaned.value;
  } catch {
    // degraded-ok: a frozen or read-only error is rethrown unchanged, and written stays false so capability-error-unstorable-chars-kept is logged below.
  }
  if (written) {
    logWarn("capability-error-unstorable-chars-removed", "removed characters the database cannot store from a tool error", { slug, removed: cleaned.removed });
  } else {
    // The write that records this failure may now fail; say so.
    logWarn("capability-error-unstorable-chars-kept", "a tool error carries characters the database cannot store and could not be cleaned", { slug, removed: cleaned.removed });
  }
  return err;
}

/**
 * Every tool's result passes here on its way to being recorded, so this is
 * where characters the database cannot store (U+0000, unpaired surrogates)
 * are removed. Without it one such character in any output fails the write
 * that records the finished call (url-to-text on PDFs, 2026-11-19). Each
 * removal is logged with the slug so the tool can be fixed at its source.
 */
function storable(slug: string, result: CapabilityResult): CapabilityResult {
  if (!result || typeof result !== "object") return result;
  const output = toStorableJson(result.output);
  const provenance = toStorableJson(result.provenance);
  const removed = output.removed + provenance.removed;
  if (removed === 0) return result;
  logWarn("capability-output-unstorable-chars-removed", "removed characters the database cannot store from a tool result", { slug, removed });
  // Recorded with the result, so the audit trail never presents altered text
  // as exactly what the source returned.
  return { ...result, output: output.value, provenance: { ...provenance.value, unstorable_chars_removed: removed } };
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
