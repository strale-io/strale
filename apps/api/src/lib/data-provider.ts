/**
 * DataProvider abstraction — multi-source fallback chains for capabilities.
 *
 * A capability declares which providers can serve its data, in priority order.
 * At execution time, the system tries each provider in order, skipping any
 * that are known to be unhealthy or missing credentials. The first successful
 * response wins.
 *
 * This is the foundation for Sprint 12 (EU registry migration) and the
 * future provider marketplace.
 */

import type { CapabilityResult } from "../capabilities/index.js";
import { log, logWarn } from "./log.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProviderType = "api" | "scraping" | "cached" | "ai_assisted" | "algorithmic";

export interface DataProviderConfig {
  /** Unique identifier, e.g. 'brreg-api', 'browserless-brreg' */
  id: string;
  /** Human-readable name, e.g. 'Brønnøysund Register Centre API' */
  name: string;
  /** Provider type — affects transparency reporting */
  type: ProviderType;
  /** Required env vars (checked before attempting fetch) */
  requiredEnvVars?: string[];
  /** Required healthy services, e.g. ['browserless'] */
  requiredServices?: string[];
  /** The actual fetch function */
  fetch: (input: Record<string, unknown>) => Promise<CapabilityResult>;
  /** Estimated latency in ms (for logging) */
  expectedLatencyMs?: number;
}

export interface FallbackChain {
  capabilitySlug: string;
  providers: DataProviderConfig[];
}

// ─── Chain registry ─────────────────────────────────────────────────────────

const chains = new Map<string, FallbackChain>();

export function registerChain(chain: FallbackChain): void {
  chains.set(chain.capabilitySlug, chain);
}

export function getChain(capabilitySlug: string): FallbackChain | undefined {
  return chains.get(capabilitySlug);
}

export function hasChain(capabilitySlug: string): boolean {
  return chains.has(capabilitySlug);
}

// ─── Executor ───────────────────────────────────────────────────────────────

/**
 * Execute through a fallback chain. Tries each provider in order, skipping
 * unhealthy or unconfigured ones. Returns the first successful result.
 *
 * Provenance tracking: the result includes which provider served the data
 * and whether a fallback was used, enabling transparency in the trust profile.
 */
export async function executeWithFallback(
  chain: FallbackChain,
  input: Record<string, unknown>,
): Promise<CapabilityResult> {
  const errors: Array<{ providerId: string; error: string }> = [];

  for (const provider of chain.providers) {
    // Check required env vars
    if (provider.requiredEnvVars?.length) {
      const missing = provider.requiredEnvVars.find((v) => !process.env[v]);
      if (missing) {
        errors.push({ providerId: provider.id, error: `Missing env var: ${missing}` });
        continue;
      }
    }

    // Check required services
    if (provider.requiredServices?.includes("browserless")) {
      try {
        const { isChromiumHealthy } = await import("./chromium-health.js");
        if (!isChromiumHealthy()) {
          errors.push({ providerId: provider.id, error: "Browserless unhealthy" });
          continue;
        }
      } catch {
        // chromium-health module not available — don't skip
      }
    }

    // Attempt the fetch
    try {
      const start = Date.now();
      const result = await provider.fetch(input);
      const latencyMs = Date.now() - start;

      // Enrich provenance with provider metadata
      const enrichedProvenance = {
        ...result.provenance,
        provider_id: provider.id,
        provider_type: provider.type,
        fallback_used: errors.length > 0,
        ...(errors.length > 0
          ? { fallback_reason: errors[errors.length - 1].error }
          : {}),
        latency_ms: latencyMs,
      };

      if (errors.length > 0) {
        log.info(
          {
            label: "data-provider-fallback-success",
            capability_slug: chain.capabilitySlug,
            provider_id: provider.id,
            skipped_count: errors.length,
          },
          "data-provider-fallback-success",
        );
      }

      return { output: result.output, provenance: enrichedProvenance };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ providerId: provider.id, error: msg });
      logWarn("data-provider-failed", "data provider attempt failed", {
        capability_slug: chain.capabilitySlug,
        provider_id: provider.id,
        err: msg.slice(0, 120),
      });
      continue;
    }
  }

  // All providers failed
  const summary = errors.map((e) => `${e.providerId}: ${e.error}`).join("; ");
  throw new Error(
    `All data providers failed for ${chain.capabilitySlug}: ${summary}`,
  );
}
