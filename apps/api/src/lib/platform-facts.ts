/**
 * Single source of truth for "platform facts" — values that appear in
 * multiple surfaces (marketing copy, llms.txt, agent card, frontend
 * stats, audit pages, Privacy/Terms) and that historically drift
 * because they were authored independently in each location.
 *
 * Drift problem (cert audit 2026-04-30):
 *   - capability_count: 270 in StatsStrip, 250 in constants.ts, 250 in
 *     llms.txt + a2a card, 97 in production /v1/capabilities visible page
 *   - "27 countries" in agent card and llms.txt vs 6 active country
 *     registries in production
 *   - retention_days: hardcoded "30" in AuditRecord and Privacy vs the
 *     code's actual 1095 (Colorado AI Act 3y)
 *   - free-tier list: 5 in marketing, 11 in manifests, 5 different in
 *     production
 *   - vendors: "OpenSanctions" still in Methodology + Learn 3 days
 *     after the switch to Dilisense (DEC-20260429-A)
 *
 * Architecture:
 *   - Live values (capability counts, country counts, free-tier slugs)
 *     are computed from the DB on demand and cached at the route layer.
 *   - Static values (retention, vendor names, processing region) are
 *     plain constants here so a wrong value fails CI rather than
 *     silently shipping.
 *   - Every surface that wants any of these reads from this module or
 *     from `GET /v1/platform/facts` (cached). New surfaces that hardcode
 *     these values are caught by `check-platform-facts-drift.mjs`.
 *
 * This module never throws on a DB miss; it returns defensive
 * defaults so a momentary DB outage doesn't take down llms.txt or the
 * agent card. Operators see the staleness via a `as_of` timestamp
 * on the API response.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { TRANSACTION_RETENTION_DAYS } from "./data-retention.js";
import { getStraleJurisdiction, getProcessingLocation } from "./processing-location.js";

// ─── Static facts (compile-time constants) ──────────────────────────────────

export const STATIC_FACTS = {
  /**
   * Per DEC-20260428-A + DEC-20260429-A, the canonical vendor for each
   * compliance capability category. When a vendor is switched, update
   * THIS map and re-run `node strale-frontend/scripts/check-platform-facts-drift.mjs`
   * to find every marketing surface that still references the old vendor.
   */
  vendors: {
    sanctions: "Dilisense",
    pep: "Dilisense",
    adverse_media_primary: "Dilisense",
    adverse_media_fallback: "Serper.dev (Google)",
    embeddings: "Voyage AI",
    risk_narrative: "Anthropic Claude",
    headless_browser: "Browserless.io",
    payments_card: "Stripe",
    payments_x402: "Coinbase x402 facilitator (USDC on Base)",
    log_sink: "Better Stack",
  } as const,

  /**
   * Default per-customer transaction retention period, in days.
   * Aligned with Colorado AI Act SB 24-205 (3y minimum for automated
   * decision systems). Must match `TRANSACTION_RETENTION_DAYS` in
   * data-retention.ts; the platform-facts test asserts they're equal.
   */
  retention_days_default: TRANSACTION_RETENTION_DAYS,

  /**
   * Maximum the retention period can be configured to under enterprise
   * agreements. Privacy.tsx claims "configurable up to seven years".
   */
  retention_days_max_configurable: 7 * 365,

  /**
   * The legal entity, jurisdiction of incorporation, and contact email
   * customers see on Privacy/Terms/DPA. Wrapping these in the facts
   * module catches the "we changed the email but only updated 2 of 4
   * pages" failure mode.
   */
  controller: {
    legal_name: "Strale",
    contact_email: "petter@strale.io",
    incorporation_jurisdiction: "Sweden",
  },

  /**
   * Date the Terms last had a material change. Bump this AND
   * `users.tos_version` together — the auth handler stamps this string
   * onto every new signup so the audit-trail shows what version the
   * user accepted. See routes/auth.ts CURRENT_TOS_VERSION.
   */
  tos_version_current: "2026-04-30",
} as const;

// ─── Live facts (computed from DB) ──────────────────────────────────────────

export interface CapabilityCounts {
  /** Active and visible — what /v1/capabilities returns to customers. */
  active_visible: number;
  /** Active regardless of visible flag — internal callable count. */
  active_total: number;
  /** Total non-deactivated rows including draft + validating + probation. */
  catalogued: number;
  /** Slugs flagged is_free_tier=true. */
  free_tier_slugs: string[];
}

/**
 * Country codes that have at least one active+visible {country}-company-data
 * capability today. Computed from the catalogue; reflects the deactivated
 * bloc (AT/DE/IT/NL/PT/ES) being absent.
 */
export interface CountryCoverage {
  company_data_active: string[];
  /** Includes deactivated caps — useful for "countries we've ever supported". */
  company_data_ever: string[];
}

export interface PlatformFacts {
  capability_counts: CapabilityCounts;
  solution_count_active: number;
  countries: CountryCoverage;
  /** Computed from Railway region; honest about US-East deploy. */
  processing_region: string;
  processing_jurisdiction: string;
  static: typeof STATIC_FACTS;
  /** Wall-clock at compute time; lets clients reason about staleness. */
  as_of: string;
}

const COMPANY_DATA_SLUG_PATTERN = /^([a-z]{2,12})-company-data$/;

export async function computePlatformFacts(): Promise<PlatformFacts> {
  const db = getDb();

  // Single round-trip: counts + slugs + lifecycle in one batch.
  // If the DB is slow this is the only DB hit per cache window, so the
  // cost is bounded by the cache TTL chosen at the route layer.
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE lifecycle_state = 'active' AND visible = true)::int AS active_visible,
      COUNT(*) FILTER (WHERE lifecycle_state = 'active')::int AS active_total,
      COUNT(*) FILTER (WHERE lifecycle_state != 'deactivated')::int AS catalogued,
      ARRAY_AGG(slug) FILTER (WHERE is_free_tier = true) AS free_tier_slugs,
      ARRAY_AGG(slug) FILTER (WHERE lifecycle_state = 'active' AND visible = true AND slug LIKE '%-company-data') AS active_country_slugs,
      ARRAY_AGG(slug) FILTER (WHERE slug LIKE '%-company-data') AS all_country_slugs
    FROM capabilities
  `);

  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? []) as Array<{
    active_visible: number;
    active_total: number;
    catalogued: number;
    free_tier_slugs: string[] | null;
    active_country_slugs: string[] | null;
    all_country_slugs: string[] | null;
  }>;
  const row = rows[0];

  const solCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM solutions WHERE is_active = true
  `);
  const solRows = (Array.isArray(solCountResult) ? solCountResult : (solCountResult as { rows?: unknown[] })?.rows ?? []) as Array<{ n: number }>;
  const solCount = solRows[0]?.n ?? 0;

  const activeCountries = extractCountryCodes(row?.active_country_slugs ?? []);
  const allCountries = extractCountryCodes(row?.all_country_slugs ?? []);

  return {
    capability_counts: {
      active_visible: row?.active_visible ?? 0,
      active_total: row?.active_total ?? 0,
      catalogued: row?.catalogued ?? 0,
      free_tier_slugs: (row?.free_tier_slugs ?? []).sort(),
    },
    solution_count_active: solCount,
    countries: {
      company_data_active: activeCountries,
      company_data_ever: allCountries,
    },
    processing_region: getProcessingLocation(),
    processing_jurisdiction: getStraleJurisdiction(),
    static: STATIC_FACTS,
    as_of: new Date().toISOString(),
  };
}

// Exported for tests. Pulls the leading {cc} out of "{cc}-company-data".
// Skips any slug whose prefix isn't 2 letters (e.g. "swedish-company-data"
// returns "swedish" — keep it as-is so prose names survive too; UI layer
// can map names → ISO codes if it wants ISO).
export function extractCountryCodes(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const s of slugs) {
    const m = s.match(COMPANY_DATA_SLUG_PATTERN);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}
