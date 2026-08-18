/**
 * Upstream Health Gate — generalized dependency skip for the test runner.
 *
 * Maintains a shared health state per upstream dependency, updated by
 * dependency-health.ts probes. The test runner checks this before executing
 * any test for a capability that depends on that upstream.
 *
 * When an upstream is unhealthy, tests for dependent capabilities are skipped
 * (not failed) — preventing timeout failures from polluting the test window.
 *
 * Upstream → capability mapping is mostly derived from the database
 * (capability_type / transparency_tag columns) with a 5-minute cache, EXCEPT
 * for "browserless" — see getBrowserlessDependentSlugs() below for why that
 * one reads dependency-manifest.ts's curated list instead.
 */

import { eq, and, sql, inArray } from "drizzle-orm";
import { logError } from "./log.js";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { fireAndForget } from "./fire-and-forget.js";
import { getActiveProviders } from "./dependency-manifest.js";

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
 * Capabilities that genuinely require Browserless with no working fallback —
 * sourced from dependency-manifest.ts's curated `browserless.capabilities`
 * list, NOT derived from capability_type='scraping'.
 *
 * capability_type='scraping' was the original heuristic here (and is what
 * chromium-health.ts's now-removed isBrowserlessCapability() and
 * event-triggers.ts's dependency mapping also used). It was measured against
 * production on 2026-08-18 and rejected on both sides:
 *   - Under-inclusion: web-extract, annual-report-extract,
 *     estonian-company-data, and company-enrich all call Browserless
 *     directly with no fallback (they're in dependency-manifest.ts's
 *     browserless.capabilities list) but are classified
 *     capability_type='ai_assisted', not 'scraping' — the old heuristic
 *     never gated them on Browserless health at all.
 *   - Over-inclusion: of the 41 capabilities classified
 *     capability_type='scraping' in prod, most (e.g. accessibility-audit,
 *     amazon-price, seo-audit, url-to-markdown, ...) go through
 *     web-provider.ts / browserless-extract.ts's 3-tier fallback
 *     (plain HTTP → Jina Reader → Browserless) and keep working when
 *     Browserless is down — skipping their tests on a Browserless outage
 *     hides real signal about capabilities that are actually fine.
 *   - A third, separately-flagged case (irish/latvian/lithuanian-company-data,
 *     swiss-company-data) turned out to be stale rather than a gap: those
 *     four were migrated off Browserless entirely onto direct-API executors
 *     under DEC-20260428-A (commits incl. 7311319) and no longer import
 *     browserless-extract.js at all. They are correctly capability_type=
 *     'stable_api' today and must NOT be added to any Browserless list.
 *
 * dependency-manifest.ts's list is hand-curated specifically for "fails
 * completely without Browserless" (its own comment: "Only capabilities that
 * genuinely REQUIRE Browserless ... are listed here") and is already the
 * source of truth for three other subsystems (invariant-checker.ts,
 * test-scheduler.ts's own pre-runTests() provider-health filter, and
 * situation-assessment.ts's alert-affected-count), so reusing it here closes
 * the gap without introducing a fourth parallel definition.
 */
export async function getBrowserlessDependentSlugs(): Promise<string[]> {
  const browserlessProvider = getActiveProviders().find((p) => p.name === "browserless");
  const candidateSlugs = browserlessProvider?.capabilities ?? [];
  if (candidateSlugs.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(and(
      inArray(capabilities.slug, candidateSlugs),
      eq(capabilities.isActive, true),
    ));
  return rows.map((r) => r.slug);
}

/**
 * Refresh the capability → upstream mapping from the database.
 * Called periodically (on cache expiry) and at startup.
 */
export async function refreshUpstreamMapping(): Promise<void> {
  try {
    const db = getDb();

    // Browserless-dependent capabilities — see getBrowserlessDependentSlugs
    // doc comment for why this is NOT a capability_type='scraping' query.
    const browserlessSlugs = await getBrowserlessDependentSlugs();

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

    for (const slug of browserlessSlugs) {
      const existing = newMap.get(slug) ?? [];
      existing.push("browserless");
      newMap.set(slug, existing);
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
    logError("upstream-gate-refresh-failed", err);
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
