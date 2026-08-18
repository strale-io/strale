import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── 2026-08-18: browserless-capability-list staleness fix ─────────────────
//
// credential-health.ts's browserless entry used to be a hand-maintained
// 52-slug array that had drifted stale (migrated-off slugs still listed,
// some slugs with no executor at all). It now derives `capabilities` from
// dependency-manifest.ts's curated `browserless.capabilities` list via the
// shared getCuratedProviderCapabilities() accessor — the same source
// upstream-health-gate.ts's getBrowserlessDependentSlugs() already reads.
// Full staleness history and the bidirectional drift enforcement (does the
// curated list match what executors actually import?) live in
// browserless-dependency-drift.test.ts. These tests pin only credential-
// health.ts's own wiring: (a) the derivation is real, not coincidental —
// changing the curated list changes what gets skipped; (b) the false-skip
// failure mode this fix closes (migrated-off / nonexistent slugs treated as
// credential-gated) stays closed.

const mockGetCuratedProviderCapabilities = vi.fn();
vi.mock("./dependency-manifest.js", () => ({
  getCuratedProviderCapabilities: (...args: unknown[]) => mockGetCuratedProviderCapabilities(...args),
}));

import {
  getUnconfiguredCapabilities,
  getCredentialStatus,
  getMissingCredential,
  isCredentialConfigured,
} from "./credential-health.js";

/** Everything else on CREDENTIAL_REGISTRY besides the "browserless" entry itself. */
const OTHER_PROVIDER_ENV_KEYS = [
  "DILISENSE_API_KEY",
  "SERPER_API_KEY",
  "COMPANIES_HOUSE_API_KEY",
  "ANTHROPIC_API_KEY",
  "SDDA_API_CLIENT_ID",
];

beforeEach(() => {
  mockGetCuratedProviderCapabilities.mockReset().mockReturnValue([]);
  vi.stubEnv("BROWSERLESS_URL", "");
  for (const key of OTHER_PROVIDER_ENV_KEYS) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Configure every non-browserless provider's credential so
 * getUnconfiguredCapabilities() only reflects the (mocked) browserless
 * entry — isolates these tests from the unrelated dilisense/serper/
 * companies_house/anthropic/sdda entries in CREDENTIAL_REGISTRY, which are
 * out of scope for this fix. Notably: latvian-company-data is ALSO gated by
 * the "sdda" entry (independent of browserless) — leaving SDDA_API_CLIENT_ID
 * unset would flag it unconfigured for a reason unrelated to what this file
 * is testing.
 */
function configureAllNonBrowserlessCredentials(): void {
  for (const key of OTHER_PROVIDER_ENV_KEYS) vi.stubEnv(key, "test");
}

describe("credential-health's browserless entry — unified with dependency-manifest.ts", () => {
  it("getUnconfiguredCapabilities() reflects exactly the (mocked) curated browserless list when BROWSERLESS_URL is missing", () => {
    mockGetCuratedProviderCapabilities.mockReturnValue(["web-extract", "screenshot-url", "company-enrich"]);

    const unconfigured = getUnconfiguredCapabilities();

    expect(unconfigured.has("web-extract")).toBe(true);
    expect(unconfigured.has("screenshot-url")).toBe(true);
    expect(unconfigured.has("company-enrich")).toBe(true);
  });

  it("regression: the historically-stale slugs are NOT skipped even though they used to be hardcoded here", () => {
    configureAllNonBrowserlessCredentials();
    // Simulates the CURRENT curated list (7 hard-require slugs) — a stand-in
    // for dependency-manifest.ts's real value, isolated from that module's
    // own drift so this test only proves credential-health.ts's wiring.
    mockGetCuratedProviderCapabilities.mockReturnValue([
      "annual-report-extract",
      "company-enrich",
      "estonian-company-data",
      "html-to-pdf",
      "landing-page-roast",
      "screenshot-url",
      "web-extract",
    ]);

    const unconfigured = getUnconfiguredCapabilities();

    // Migrated off Browserless entirely — must not be skipped on a missing
    // BROWSERLESS_URL. This assertion FAILS against the pre-fix hardcoded
    // 52-slug array (all of these were in it) and PASSES once the list is
    // derived from the (mocked, narrow) curated source.
    const migratedOff = [
      "austrian-company-data",
      "belgian-company-data",
      "danish-company-data",
      "dutch-company-data",
      "eu-regulation-search",
      "german-company-data",
      "irish-company-data",
      "italian-company-data",
      "latvian-company-data",
      "lithuanian-company-data",
      "portuguese-company-data",
      "spanish-company-data",
      "swedish-company-data",
      "swiss-company-data",
      "tech-stack-detect",
    ];
    for (const slug of migratedOff) {
      expect(unconfigured.has(slug), `${slug} should not be credential-gated on Browserless`).toBe(false);
    }

    // Never had an executor at all — must never appear in a skip set derived
    // from real capability slugs.
    const neverExisted = [
      "credit-report-summary",
      "custom-scrape",
      "hong-kong-company-data",
      "indian-company-data",
    ];
    for (const slug of neverExisted) {
      expect(unconfigured.has(slug), `${slug} has no executor and must not appear here`).toBe(false);
    }

    // Fallback-tier capabilities (web-provider.ts 3-tier fallback) — a
    // missing BROWSERLESS_URL doesn't block them either (tiers 1/2 run
    // first), so they must not be skipped.
    const fallbackTier = [
      "accessibility-audit",
      "url-to-markdown",
      "seo-audit",
      "trustpilot-score",
      "youtube-summarize",
    ];
    for (const slug of fallbackTier) {
      expect(unconfigured.has(slug), `${slug} is fallback-tier and must not be credential-gated`).toBe(false);
    }

    // The 7 genuine hard-require slugs ARE correctly skipped.
    for (const slug of [
      "annual-report-extract",
      "company-enrich",
      "estonian-company-data",
      "html-to-pdf",
      "landing-page-roast",
      "screenshot-url",
      "web-extract",
    ]) {
      expect(unconfigured.has(slug), `${slug} genuinely hard-requires Browserless`).toBe(true);
    }
  });

  it("getUnconfiguredCapabilities() skips nothing browserless-related when BROWSERLESS_URL is configured", () => {
    mockGetCuratedProviderCapabilities.mockReturnValue(["web-extract", "screenshot-url"]);
    vi.stubEnv("BROWSERLESS_URL", "https://browserless.example.com");

    const unconfigured = getUnconfiguredCapabilities();

    expect(unconfigured.has("web-extract")).toBe(false);
    expect(unconfigured.has("screenshot-url")).toBe(false);
  });

  it("an empty curated list (e.g. Browserless retired) skips nothing", () => {
    configureAllNonBrowserlessCredentials();
    mockGetCuratedProviderCapabilities.mockReturnValue([]);

    const unconfigured = getUnconfiguredCapabilities();

    expect(unconfigured.size).toBe(0);
  });

  it("getCredentialStatus() surfaces the derived list under the browserless provider entry", () => {
    mockGetCuratedProviderCapabilities.mockReturnValue(["web-extract"]);

    const statuses = getCredentialStatus();
    const browserless = statuses.find((s) => s.provider === "browserless");

    expect(browserless).toBeDefined();
    expect(browserless?.capabilities).toEqual(["web-extract"]);
    expect(browserless?.isConfigured).toBe(false); // BROWSERLESS_URL stubbed empty in beforeEach
  });

  it("getMissingCredential() reports 'browserless' only for curated slugs, not migrated-off ones", () => {
    mockGetCuratedProviderCapabilities.mockReturnValue(["web-extract"]);

    expect(getMissingCredential("web-extract")).toEqual({
      provider: "browserless",
      envVar: "BROWSERLESS_URL",
    });
    expect(getMissingCredential("irish-company-data")).toBeNull();
  });

  it("isCredentialConfigured('browserless') is unaffected by the capabilities-list derivation (still keys off BROWSERLESS_URL alone)", () => {
    mockGetCuratedProviderCapabilities.mockReturnValue(["web-extract"]);
    expect(isCredentialConfigured("browserless")).toBe(false);

    vi.stubEnv("BROWSERLESS_URL", "https://browserless.example.com");
    expect(isCredentialConfigured("browserless")).toBe(true);
  });
});

describe("credential-health — other providers untouched by the browserless unification", () => {
  it("dilisense-gated capabilities are still skipped by their own static list when DILISENSE_API_KEY is missing", () => {
    mockGetCuratedProviderCapabilities.mockReturnValue([]); // no curated browserless slugs in this test
    const unconfigured = getUnconfiguredCapabilities();
    expect(unconfigured.has("sanctions-check")).toBe(true);
    expect(unconfigured.has("pep-check")).toBe(true);
  });
});
