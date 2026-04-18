/**
 * Upstream Health Gate — generalized dependency skip for the test runner.
 *
 * Maintains a shared health state per upstream dependency, updated by
 * dependency-health.ts probes. The test runner checks this before executing
 * any test for a capability that depends on that upstream.
 *
 * When an upstream is unhealthy, tests for dependent capabilities are skipped
 * (not failed) — preventing timeout failures from polluting the SQS window.
 *
 * Upstream → capability mapping is derived from the database (capability_type
 * and transparency_tag columns) with a 5-minute cache.
 */

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { fireAndForget } from "./fire-and-forget.js";

// ─── Upstream health state ──────────────────────────────────────────────────

const _upstreamHealth = new Map<string, boolean>();

/** Check if a named upstream is healthy. Unknown upstreams are assumed healthy. */
export function isUpstreamHealthy(dependencyName: string): boolean {
  return _upstreamHealth.get(dependencyName) ?? true;
}

/** Update the health state for a named upstream. Called by dependency-health.ts probes. */
export function updateUpstreamHealth(dependencyName: string, healthy: boolean): void {
  _upstreamHealth.set(dependencyName, healthy);
}

/** Get all upstream health states (for debugging/logging). */
export function getAllUpstreamHealth(): Record<string, boolean> {
  return Object.fromEntries(_upstreamHealth);
}

// ─── Capability → upstream mapping (DB-backed with cache) ───────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
let _capabilityUpstreamMap: Map<string, string[]> = new Map();
let _cacheExpiry = 0;

// Fixed mappings for capabilities that depend on specific APIs (not derivable from capability_type)
const FIXED_UPSTREAM_SLUGS: Record<string, string[]> = {
  vies: ["vat-validate", "eori-validate", "vat-format-validate"],
  dilisense: ["sanctions-check", "pep-check", "adverse-media-check"],
  gleif: ["lei-lookup"],
  brreg: ["norwegian-company-data"],
  "alchemy-eth": ["ens-resolve", "ens-reverse-lookup"],
};

/**
 * Refresh the capability → upstream mapping from the database.
 * Called periodically (on cache expiry) and at startup.
 */
export async function refreshUpstreamMapping(): Promise<void> {
  try {
    const db = getDb();

    // Scraping capabilities → depend on Browserless
    const scrapingRows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(and(
        eq(capabilities.capabilityType, "scraping"),
        eq(capabilities.isActive, true),
      ));

    // AI-assisted capabilities → depend on Anthropic
    const aiRows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(and(
        eq(capabilities.capabilityType, "ai_assisted"),
        eq(capabilities.isActive, true),
      ));

    // Build the map
    const newMap = new Map<string, string[]>();

    for (const row of scrapingRows) {
      const existing = newMap.get(row.slug) ?? [];
      existing.push("browserless");
      newMap.set(row.slug, existing);
    }

    for (const row of aiRows) {
      const existing = newMap.get(row.slug) ?? [];
      existing.push("anthropic");
      newMap.set(row.slug, existing);
    }

    // Add fixed mappings
    for (const [upstream, slugs] of Object.entries(FIXED_UPSTREAM_SLUGS)) {
      for (const slug of slugs) {
        const existing = newMap.get(slug) ?? [];
        if (!existing.includes(upstream)) existing.push(upstream);
        newMap.set(slug, existing);
      }
    }

    _capabilityUpstreamMap = newMap;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    console.error(
      "[upstream-gate] Failed to refresh mapping:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Get the upstream dependencies for a capability slug.
 * Returns empty array if no known dependencies (safe to proceed).
 * Uses cached data — call refreshUpstreamMapping() periodically.
 */
export function getCapabilityUpstreams(slug: string): string[] {
  return _capabilityUpstreamMap.get(slug) ?? [];
}

/**
 * Check if any upstream for this capability is unhealthy.
 * Returns the name of the first unhealthy upstream, or null if all healthy.
 */
export function findUnhealthyUpstream(slug: string): string | null {
  const upstreams = getCapabilityUpstreams(slug);
  for (const dep of upstreams) {
    if (!isUpstreamHealthy(dep)) return dep;
  }
  return null;
}

/** Whether the cache needs refreshing. */
export function isCacheExpired(): boolean {
  return Date.now() >= _cacheExpiry;
}

// Pre-warm cache 5s after module load
setTimeout(() => {
  fireAndForget(() => refreshUpstreamMapping(), { label: "upstream-mapping-prewarm" });
}, 5_000);
