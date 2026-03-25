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
    capabilities: [
      "accessibility-audit", "annual-report-extract", "austrian-company-data",
      "belgian-company-data", "business-license-check-se", "company-enrich",
      "company-tech-stack", "competitor-compare", "container-track",
      "cookie-scan", "credit-report-summary", "custom-scrape",
      "customs-duty-lookup", "danish-company-data", "dutch-company-data",
      "employer-review-summary", "estonian-company-data", "eu-court-case-search",
      "eu-regulation-search", "eu-trademark-search", "gdpr-fine-lookup",
      "german-company-data", "hong-kong-company-data", "html-to-pdf",
      "indian-company-data", "irish-company-data", "italian-company-data",
      "japanese-company-data", "landing-page-roast", "latvian-company-data",
      "lithuanian-company-data", "patent-search", "portuguese-company-data",
      "price-compare", "pricing-page-extract", "privacy-policy-analyze",
      "product-reviews-extract", "product-search", "return-policy-extract",
      "salary-benchmark", "screenshot-url", "seo-audit",
      "spanish-company-data", "structured-scrape", "swedish-company-data",
      "swiss-company-data", "tech-stack-detect", "terms-of-service-extract",
      "trustpilot-score", "url-to-markdown", "web-extract", "youtube-summarize",
    ],
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
