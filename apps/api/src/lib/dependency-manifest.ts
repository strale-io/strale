/**
 * Dependency manifest — single source of truth for all external providers.
 *
 * Every external API or service Strale depends on has an entry here.
 * This manifest drives:
 *   - dependency-health.ts (health probes auto-generated from this)
 *   - startup env var validation
 *   - invariant checker migration completeness check
 *   - alert messages ("4 capabilities affected")
 *
 * MIGRATION PROTOCOL:
 * When replacing a provider:
 * 1. Add the new provider entry with `replacedFrom` pointing to the old name
 * 2. Set `retired: true` on the old provider entry (do NOT delete it)
 * 3. Update `capabilities` on the new provider
 * 4. Deploy — the invariant checker will flag any remaining code references
 *    to the retired provider's baseUrl
 */

export type AuthType =
  | "api-key-header"
  | "api-key-query"
  | "bearer"
  | "basic"
  | "none";

export type ProviderTier =
  | "free"
  | "paid"
  | "self-hosted";

export interface HealthProbe {
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  healthyStatuses: number[];
  timeoutMs: number;
  functional?: boolean;
  /** Skip auth headers on the probe request. Use when an unauthenticated
   *  request (e.g. 401 response) is sufficient to prove connectivity
   *  without consuming API quota. */
  skipAuth?: boolean;
}

export interface DependencyProvider {
  name: string;
  displayName: string;
  description: string;
  baseUrl: string;
  /** Alternate base URLs forming a pool. The probe treats the pool as healthy
   *  if ANY endpoint responds — use for free/public services where individual
   *  endpoints have opaque rate limits and the capability itself fails over. */
  fallbackBaseUrls?: string[];
  authType: AuthType;
  envVar?: string;
  authHeader?: string;
  /** Extra headers needed for the probe (e.g. anthropic-version) */
  extraProbeHeaders?: Record<string, string>;
  healthProbe: HealthProbe;
  capabilities: string[];
  tier: ProviderTier;
  replacedFrom?: string;
  migratedAt?: string;
  retired?: boolean;
}

export const PROVIDERS: DependencyProvider[] = [
  // ─── Self-hosted ──────────────────────────────────────────────────────────
  {
    name: "browserless",
    displayName: "Browserless (Chromium)",
    description: "Chromium browser automation for web scraping and rendering.",
    baseUrl: "", // read from BROWSERLESS_URL at runtime
    authType: "bearer",
    envVar: "BROWSERLESS_API_KEY",
    healthProbe: {
      path: "/content",
      method: "POST",
      body: {
        url: "data:text/html,<html><body>ok</body></html>",
        gotoOptions: { waitUntil: "load", timeout: 8000 },
      },
      healthyStatuses: [200],
      timeoutMs: 12000,
      functional: true,
    },
    capabilities: [
      "accessibility-audit", "amazon-price", "annual-report-extract",
      "australian-company-data", "austrian-company-data", "belgian-company-data",
      "business-license-check-se", "canadian-company-data", "company-enrich",
      "company-tech-stack", "competitor-compare", "container-track",
      "cookie-scan", "credit-report-summary", "customs-duty-lookup",
      "dutch-company-data", "employer-review-summary", "eu-court-case-search",
      "eu-regulation-search", "eu-trademark-search", "gdpr-fine-lookup",
      "german-company-data", "hong-kong-company-data", "indian-company-data",
      "irish-company-data", "italian-company-data", "japanese-company-data",
      "landing-page-roast", "latvian-company-data", "lithuanian-company-data",
      "patent-search", "portuguese-company-data", "price-compare",
      "pricing-page-extract", "privacy-policy-analyze", "product-reviews-extract",
      "product-search", "return-policy-extract", "salary-benchmark",
      "seo-audit", "singapore-company-data", "spanish-company-data",
      "structured-scrape", "swedish-company-data", "swiss-company-data",
      "tech-stack-detect", "terms-of-service-extract", "trustpilot-score",
      "url-to-markdown", "web-extract", "youtube-summarize",
    ],
    tier: "self-hosted",
  },

  // ─── AI providers ─────────────────────────────────────────────────────────
  {
    name: "anthropic",
    displayName: "Anthropic Claude API",
    description: "LLM inference for AI-assisted capabilities.",
    baseUrl: "https://api.anthropic.com",
    authType: "api-key-header",
    envVar: "ANTHROPIC_API_KEY",
    authHeader: "x-api-key",
    extraProbeHeaders: { "anthropic-version": "2023-06-01" },
    healthProbe: {
      path: "/v1/models",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: [
      "address-parse", "agent-trace-analyze", "amazon-price",
      "annual-report-extract", "api-docs-generate", "api-mock-response",
      "beneficial-ownership-lookup", "blog-post-outline", "brand-mention-search",
      "brazilian-company-data", "business-license-check-se", "changelog-generate",
      "classify-text", "code-convert", "code-review", "commit-message-generate",
      "company-enrich", "company-industry-classify", "company-tech-stack",
      "competitor-compare", "container-track", "context-window-optimize",
      "contract-extract", "cookie-scan", "credit-report-summary",
      "crontab-generate", "curl-to-code", "customs-duty-lookup",
      "danish-company-data", "docstring-generate", "dockerfile-generate",
      "email-draft", "employer-review-summary", "env-template-generate",
      "error-explain", "estonian-company-data", "eu-court-case-search",
      "eu-regulation-search", "eu-trademark-search", "fake-data-generate",
      "finnish-company-data", "french-company-data", "gdpr-fine-lookup",
      "github-actions-generate", "github-repo-analyze", "hs-code-lookup",
      "image-to-text", "invoice-extract", "jsdoc-generate",
      "job-posting-analyze", "landing-page-roast", "meeting-notes-extract",
      "nginx-config-generate", "norwegian-company-data", "openapi-generate",
      "patent-search", "pdf-extract", "pep-check", "pii-redact",
      "polish-company-data", "pr-description-generate", "price-compare",
      "pricing-page-extract", "privacy-policy-analyze", "product-reviews-extract",
      "product-search", "prompt-compress", "prompt-optimize",
      "readme-generate", "receipt-categorize", "regex-explain", "regex-generate",
      "release-notes-generate", "resume-parse", "return-policy-extract",
      "risk-narrative-generate", "salary-benchmark", "sanctions-check",
      "schema-migration-generate", "sentiment-analyze", "social-post-generate",
      "sql-explain", "sql-generate", "sql-optimize", "structured-scrape",
      "summarize", "swedish-company-data", "tech-stack-detect",
      "terms-of-service-extract", "test-case-generate", "translate",
      "trustpilot-score", "uk-company-data", "us-company-data",
      "web-extract", "webhook-test-payload", "youtube-summarize",
    ],
    tier: "paid",
  },

  // ─── Search ───────────────────────────────────────────────────────────────
  {
    name: "serper",
    displayName: "Serper (Google Search API)",
    description: "Google search results API via Serper.dev.",
    baseUrl: "https://google.serper.dev",
    authType: "api-key-header",
    envVar: "SERPER_API_KEY",
    authHeader: "X-API-KEY",
    healthProbe: {
      // Unauthenticated POST — 401/403 proves service is reachable
      // without consuming a billable Google search query.
      path: "/search",
      method: "POST",
      body: { q: "connectivity_probe", num: 1 },
      healthyStatuses: [200, 401, 403],
      timeoutMs: 8000,
      skipAuth: true,
    },
    capabilities: ["google-search", "serp-analyze", "brand-mention-search", "backlink-check"],
    tier: "paid",
  },

  // ─── AML / Compliance ─────────────────────────────────────────────────────
  {
    name: "dilisense",
    displayName: "Dilisense (AML Screening)",
    description: "Sanctions, PEP, and adverse media screening via consolidated global databases.",
    baseUrl: "https://api.dilisense.com",
    authType: "api-key-header",
    envVar: "DILISENSE_API_KEY",
    authHeader: "x-api-key",
    healthProbe: {
      // Unauthenticated probe: 401 proves the service is reachable without
      // consuming API quota. skipAuth omits the x-api-key header.
      path: "/v1/checkIndividual?names=connectivity_probe",
      method: "GET",
      healthyStatuses: [200, 400, 401, 404],
      timeoutMs: 5000,
      skipAuth: true,
    },
    capabilities: ["sanctions-check", "pep-check", "adverse-media-check"],
    tier: "paid",
    replacedFrom: "opensanctions",
    migratedAt: "2026-03-25",
  },

  // ─── Company registries ───────────────────────────────────────────────────
  {
    name: "companies-house",
    displayName: "Companies House (UK)",
    description: "UK company registration and PSC data via Companies House API.",
    baseUrl: "https://api.company-information.service.gov.uk",
    authType: "basic",
    envVar: "COMPANIES_HOUSE_API_KEY",
    healthProbe: {
      path: "/search/companies?q=test&items_per_page=1",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 8000,
    },
    capabilities: ["uk-company-data", "uk-companies-house-officers", "beneficial-ownership-lookup", "insolvency-check"],
    tier: "free",
  },

  // ─── Public / unauthenticated APIs ────────────────────────────────────────
  {
    name: "vies",
    displayName: "VIES (EU VAT Validation)",
    description: "EU VAT number validation via the European Commission VIES service.",
    baseUrl: "https://ec.europa.eu",
    authType: "none",
    healthProbe: {
      path: "/taxation_customs/vies/rest-api/check-status",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: ["vat-validate"],
    tier: "free",
  },
  {
    name: "gleif",
    displayName: "GLEIF (LEI Registry)",
    description: "Global Legal Entity Identifier lookup via the GLEIF API.",
    baseUrl: "https://api.gleif.org",
    authType: "none",
    healthProbe: {
      path: "/api/v1/lei-records?page[size]=1",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: ["lei-lookup"],
    tier: "free",
  },
  {
    name: "brreg",
    displayName: "Brønnøysund Register (Norway)",
    description: "Norwegian business registry via Brreg API.",
    baseUrl: "https://data.brreg.no",
    authType: "none",
    healthProbe: {
      path: "/enhetsregisteret/api/enheter?size=1",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: ["norwegian-company-data"],
    tier: "free",
  },
  {
    name: "sudreg",
    displayName: "Sudski registar (Croatia)",
    description: "Croatian Court Register public API — OAuth2 client credentials.",
    baseUrl: "https://sudreg-data.gov.hr/api/javni",
    authType: "bearer",
    envVar: "SUDREG_CLIENT_ID",
    healthProbe: {
      // Unauthenticated GET returns 401 without consuming OAuth quota.
      path: "/sudovi",
      method: "GET",
      healthyStatuses: [200, 401],
      timeoutMs: 5000,
      skipAuth: true,
    },
    capabilities: ["croatian-company-data"],
    tier: "free",
  },

  // ─── Web3 providers (free, no key) ────────────────────────────────────────
  {
    name: "goplus",
    displayName: "GoPlus Security",
    description: "Web3 security API — wallet risk, token security, approval risk, phishing detection.",
    baseUrl: "https://api.gopluslabs.io",
    authType: "none",
    healthProbe: {
      path: "/api/v1/token_security/1?contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: [
      "wallet-risk-score", "token-security-check",
      "approval-security-check", "phishing-site-check",
    ],
    tier: "free",
  },
  {
    name: "defillama",
    displayName: "DeFi Llama",
    description: "DeFi analytics — protocol TVL, fees, revenue, stablecoin flows.",
    baseUrl: "https://api.llama.fi",
    authType: "none",
    healthProbe: {
      path: "/protocols",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 10000,
    },
    capabilities: [
      "protocol-tvl-lookup", "protocol-fees-lookup", "stablecoin-flow-check",
    ],
    tier: "free",
  },
  {
    name: "etherscan",
    displayName: "Etherscan V2",
    description: "EVM chain explorer API — wallet age, contract verification, gas prices, balances.",
    baseUrl: "https://api.etherscan.io",
    authType: "api-key-query",
    envVar: "ETHERSCAN_API_KEY",
    healthProbe: {
      // Unauthenticated probe — 401/403 proves reachability without quota consumption
      path: "/v2/api?chainid=1&module=gastracker&action=gasoracle",
      method: "GET",
      healthyStatuses: [200, 401, 403],
      timeoutMs: 5000,
      skipAuth: true,
    },
    capabilities: [
      "wallet-age-check", "contract-verify-check", "gas-price-check",
      "wallet-balance-lookup", "wallet-transactions-lookup",
    ],
    tier: "free",
  },
  {
    name: "alternative-me",
    displayName: "Alternative.me",
    description: "Crypto Fear & Greed Index — market sentiment indicator.",
    baseUrl: "https://api.alternative.me",
    authType: "none",
    healthProbe: {
      path: "/fng/?limit=1&format=json",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 3000,
    },
    capabilities: ["fear-greed-index"],
    tier: "free",
  },
  {
    // Retired: replaced by alchemy-eth (authenticated RPC with known quota).
    // Kept for event-history continuity. The invariant checker's migration
    // check greps capabilities/ for this baseUrl; the URL now lives only in
    // src/lib/eth-rpc-endpoints.ts as a fallback, not in capabilities/.
    name: "publicnode",
    displayName: "PublicNode Ethereum RPC (retired)",
    description: "Retired — replaced by Alchemy. See provider 'alchemy-eth'.",
    baseUrl: "https://ethereum-rpc.publicnode.com",
    authType: "none",
    healthProbe: {
      path: "/",
      method: "POST",
      body: { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 },
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: [],
    tier: "free",
    retired: true,
    migratedAt: "2026-04-17",
  },
  {
    // Alchemy Ethereum mainnet — authenticated RPC with known CU quota.
    //
    // The probe hits /v2/probe (an invalid key segment) with skipAuth:true
    // and accepts 401 as healthy — 401 proves the service is reachable
    // without consuming compute units. If Alchemy itself is unreachable,
    // fallbackBaseUrls (free public pool) are tried and 200 is accepted.
    //
    // The real Alchemy URL with the API key is built at request time inside
    // the ENS executors (see src/lib/eth-rpc-endpoints.ts).
    name: "alchemy-eth",
    displayName: "Alchemy Ethereum RPC",
    description: "Authenticated Ethereum JSON-RPC for ENS resolution. 100k compute units/day free tier.",
    baseUrl: "https://eth-mainnet.g.alchemy.com",
    fallbackBaseUrls: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com",
      "https://cloudflare-eth.com",
      "https://rpc.ankr.com/eth",
    ],
    authType: "none",
    envVar: "ALCHEMY_API_KEY",
    replacedFrom: "publicnode",
    migratedAt: "2026-04-17",
    healthProbe: {
      // Invalid key path — Alchemy returns 401 without consuming quota.
      // Free-pool fallbacks ignore the path and return 200 on a valid
      // eth_blockNumber call, so we accept both statuses as healthy.
      path: "/v2/probe",
      method: "POST",
      body: { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 },
      healthyStatuses: [200, 401],
      timeoutMs: 5000,
      skipAuth: true,
    },
    capabilities: ["ens-resolve", "ens-reverse-lookup"],
    tier: "free",
  },

  // ─── Jina Reader (free markdown extraction for url-to-markdown) ────────────
  {
    name: "jina-reader",
    displayName: "Jina Reader",
    description: "Free URL-to-markdown extraction via r.jina.ai. Handles JS rendering. 20 RPM free, 200 RPM with key.",
    baseUrl: "https://r.jina.ai",
    authType: "none",
    healthProbe: {
      path: "/https://example.com",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 10000,
      skipAuth: true,
    },
    capabilities: ["url-to-markdown"],
    tier: "free",
  },

  // ─── Retired providers (keep for migration completeness checks) ───────────
  // NOTE: OPENSANCTIONS_API_KEY in Railway can be removed — this provider
  // is retired (replaced by Dilisense on 2026-03-25). The key is dead.
  // Remove via: Railway dashboard → strale service → Variables → Delete OPENSANCTIONS_API_KEY
  {
    name: "opensanctions",
    displayName: "OpenSanctions (RETIRED)",
    description: "Former sanctions/PEP screening provider. Replaced by Dilisense on 2026-03-25.",
    baseUrl: "https://api.opensanctions.org",
    authType: "none",
    healthProbe: {
      path: "/health/ready",
      method: "GET",
      healthyStatuses: [200],
      timeoutMs: 5000,
    },
    capabilities: [],
    tier: "free",
    retired: true,
  },
];

// ─── Capability-level overrides (documentation, no runtime behavior) ────────

export const CAPABILITY_OVERRIDES: Record<string, { required_region?: string; note?: string }> = {
  "ecb-interest-rates": {
    required_region: "eu",
    note: "ECB SDW API only accessible from EU IPs — suspended until EU infrastructure available",
  },
};

/** Returns only active (non-retired) providers */
export function getActiveProviders(): DependencyProvider[] {
  return PROVIDERS.filter((p) => !p.retired);
}

/** Returns only retired providers */
export function getRetiredProviders(): DependencyProvider[] {
  return PROVIDERS.filter((p) => p.retired);
}

/** Look up a provider by name */
export function getProvider(name: string): DependencyProvider | undefined {
  return PROVIDERS.find((p) => p.name === name);
}
