import { getCuratedProviderCapabilities } from "./dependency-manifest.js";

/**
 * Credential health registry.
 *
 * Tracks which external API keys are configured and valid.
 * Used by the test runner to skip tests for capabilities whose
 * required credentials are missing — prevents accumulating hundreds
 * of "HTTP 401" failures that pollute the scoring window.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CredentialEntry {
  provider: string;
  envVar: string;
  capabilities: string[];
}

export interface CredentialStatus extends CredentialEntry {
  isConfigured: boolean;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const CREDENTIAL_REGISTRY: CredentialEntry[] = [
  {
    provider: "dilisense",
    envVar: "DILISENSE_API_KEY",
    capabilities: ["sanctions-check", "pep-check", "adverse-media-check"],
    // NOTE: all three have Claude Haiku or graceful fallbacks if key is missing.
    // aml-risk-score is pure algorithmic — doesn't call dilisense.
  },
  {
    provider: "browserless",
    envVar: "BROWSERLESS_URL",
    // Deliberately NOT a hand-maintained list (2026-08-18 fix: the old
    // 52-slug literal array had drifted — 19 stale slugs, some no longer
    // touching Browserless, some with no executor at all). Derived from
    // dependency-manifest.ts's curated `browserless.capabilities` — the same
    // "genuinely requires Browserless, no fallback" set upstream-health-
    // gate.ts's getBrowserlessDependentSlugs() already reads (via the shared
    // getCuratedProviderCapabilities() accessor) for its own skip-when-
    // unhealthy gate. Both gates reduce to the same question — "can this
    // capability actually produce a correct result right now?" — so both now
    // read the same source instead of each maintaining an independent list.
    // Full staleness history and the bidirectional drift enforcement live in
    // browserless-dependency-drift.test.ts.
    get capabilities(): string[] {
      return getCuratedProviderCapabilities("browserless");
    },
  },
  {
    provider: "serper",
    envVar: "SERPER_API_KEY",
    capabilities: [
      "adverse-media-check", "backlink-check", "brand-mention-search",
      "google-search", "serp-analyze",
    ],
  },
  {
    provider: "companies_house",
    envVar: "COMPANIES_HOUSE_API_KEY",
    capabilities: [
      "beneficial-ownership-lookup", "insolvency-check",
      "uk-companies-house-officers", "uk-company-data",
    ],
  },
  {
    provider: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    capabilities: [],
    // Too many capabilities (97+). Claude is critical infra — if it's missing,
    // failures will be caught by the normal test flow. No need to pre-filter.
  },
  {
    provider: "sdda",
    envVar: "SDDA_API_CLIENT_ID",
    capabilities: ["latvian-company-data"],
    // SDDA UR-API-LegalEntity via api.viss.gov.lv (WSO2 API Manager).
    // OAuth2 client_credentials — also needs SDDA_API_CLIENT_SECRET, but
    // CLIENT_ID is the sentinel (both are always paired at provisioning).
    // The stub provider is scaffolded but NOT primary: latvian-company-data's
    // live executor (apps/api/src/capabilities/latvian-company-data.ts) calls
    // the data.gov.lv CKAN datastore API directly (acquisition_method:
    // direct_api per DEC-20260428-A) — it migrated off the prior
    // Browserless+Claude scrape of info.ur.gov.lv (Tier 1 violation) and does
    // NOT touch Browserless at all today. SDDA remains an unwired stub for a
    // future path pending credentials and a follow-up session to wire
    // registerChain() for SDDA — it is not what's live now, and neither is
    // Browserless.
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/** Check if a specific provider's credential is configured. */
export function isCredentialConfigured(provider: string): boolean {
  const entry = CREDENTIAL_REGISTRY.find((r) => r.provider === provider);
  if (!entry) return true; // Unknown provider — assume configured
  const val = process.env[entry.envVar];
  return !!val && val.trim().length > 0;
}

/** Get the full credential status for all registered providers. */
export function getCredentialStatus(): CredentialStatus[] {
  return CREDENTIAL_REGISTRY.map((entry) => {
    const val = process.env[entry.envVar];
    return {
      ...entry,
      isConfigured: !!val && val.trim().length > 0,
    };
  });
}

/** Get slugs of capabilities that cannot run due to missing credentials. */
export function getUnconfiguredCapabilities(): Set<string> {
  const unconfigured = new Set<string>();
  for (const entry of CREDENTIAL_REGISTRY) {
    const val = process.env[entry.envVar];
    if (!val || val.trim().length === 0) {
      for (const slug of entry.capabilities) {
        unconfigured.add(slug);
      }
    }
  }
  return unconfigured;
}

/**
 * Get the missing credential info for a specific capability.
 * Returns null if all required credentials are configured.
 */
export function getMissingCredential(
  capabilitySlug: string,
): { provider: string; envVar: string } | null {
  for (const entry of CREDENTIAL_REGISTRY) {
    if (!entry.capabilities.includes(capabilitySlug)) continue;
    const val = process.env[entry.envVar];
    if (!val || val.trim().length === 0) {
      return { provider: entry.provider, envVar: entry.envVar };
    }
  }
  return null;
}
