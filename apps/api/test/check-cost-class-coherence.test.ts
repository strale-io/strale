/**
 * Unit tests for the Phase A0b cost_class coherence check, focused on the
 * Block 0082 follow-up (2026-08-14, same day): the `known_rate_limit`
 * manifest field that gives a vendor's documented rate limit one
 * canonical home instead of three independently-drifting copies (the
 * migration's citations, the CI lint's THROTTLED_HOST_RULES `reason`
 * prose, and the manifest's already-derived `quota_cap`).
 *
 * Two independent checks now run per manifest — see the file header of
 * check-cost-class-coherence.mjs for the full split rationale ("the
 * trap"):
 *   (a) executor touches a THROTTLED_HOST_RULES host, manifest has no
 *       known_rate_limit at all → violation ("undeclared throttling").
 *       Cost_class-agnostic — this is the detector for "nobody ever
 *       looked," and it must not regress to only catching free_unlimited
 *       (that was the pre-follow-up gap this whole change closes).
 *   (b) manifest HAS known_rate_limit → its cost_class/quota_cap must be
 *       internally consistent with it → violation ("inconsistent
 *       declaration"). Independent of the host list.
 *
 * known_rate_limit accepts a single object OR an array (same
 * single-or-array convention as test_fixtures.known_answer) — a
 * capability can touch more than one throttled vendor (officer-search:
 * UK Companies House + SEC EDGAR). When it's an array, the ceiling is
 * the MINIMUM of each entry's derived value.
 *
 * quota_cap consistency is a CEILING check (quota_cap <= derived), not
 * equality — see deriveQuotaCapFromRateLimit's doc comment in
 * capability-manifest-types.ts for why (officer-search's quota_cap: 600
 * is legitimately below its 7,200/hr Companies House ceiling; it uses
 * the vendor's own literal 5-minute-window figure directly rather than
 * the 1-hour-sustained extrapolation).
 *
 * Per the Audit-Follow-up Test Coverage Protocol shape (both directions
 * covered): every "must fail" test below is paired with the minimal edit
 * that flips it to "must pass," and vice versa.
 *
 * The script itself is .mjs and scans the on-disk manifests +
 * capabilities directories; this test mirrors the smaller matching logic
 * so it doesn't depend on the production manifest/capability set. If the
 * mjs script's logic changes, this mirror must change with it — the live
 * check at CI time uses the script; this test guards the contract.
 */

import { describe, it, expect } from "vitest";

// Mirror of THROTTLED_HOST_RULES from check-cost-class-coherence.mjs —
// detector only, no numbers/URLs (that's what the manifest's
// known_rate_limit carries now).
const THROTTLED_HOST_RULES = [
  { host: "receitaws.com.br", reason: "ReceitaWS documents a rate limit on its free tier." },
  { host: "ip-api.com", reason: "ip-api.com's free endpoint is rate-limited." },
  { host: "api.etherscan.io", reason: "Etherscan's free tier has a documented per-second and daily call cap." },
  { host: "api.company-information.service.gov.uk", reason: "UK Companies House's public API is rate-limited." },
];

// Mirror of deriveQuotaCapFromRateLimit (src/lib/capability-manifest-types.ts).
const KNOWN_RATE_LIMIT_UNITS = ["per_second", "per_minute", "per_day"];
function deriveQuotaCapFromRateLimit(rl: { value: number; unit: string }): number {
  switch (rl.unit) {
    case "per_second":
      return rl.value * 3600;
    case "per_minute":
      return rl.value * 60;
    case "per_day":
      return rl.value;
    default:
      throw new Error(`Unknown known_rate_limit.unit: ${rl.unit}`);
  }
}

// Mirror of check-cost-class-coherence.mjs's lib-import-following logic.
function buildCombinedSource(executorSource: string, readLib: (libImportPath: string) => string): string {
  let combined = executorSource;
  const importMatches = executorSource.matchAll(/from\s+["']\.\/(lib\/[a-zA-Z0-9_-]+)\.js["']/g);
  for (const m of importMatches) {
    combined += "\n" + readLib(m[1]);
  }
  return combined;
}

type RateLimit = { value: number; unit: string; source_url: string };

interface Manifest {
  slug: string;
  cost_class?: string | null;
  quota_cap?: number | null;
  known_rate_limit?: RateLimit | RateLimit[] | null;
}

// Mirror of getKnownRateLimits (src/lib/capability-manifest-types.ts).
function getKnownRateLimits(manifest: Manifest): RateLimit[] {
  const rl = manifest.known_rate_limit;
  if (!rl) return [];
  return Array.isArray(rl) ? rl : [rl];
}

// Mirror of check (a): undeclared throttling.
function findUndeclaredThrottleViolations(
  manifest: Manifest,
  combinedSource: string,
): Array<{ host: string; reason: string }> {
  if (!manifest.cost_class) return [];
  const violations: Array<{ host: string; reason: string }> = [];
  for (const rule of THROTTLED_HOST_RULES) {
    if (!combinedSource.includes(rule.host)) continue;
    const exemptRe = new RegExp(`cost-class-coherence-exempt:\\s*${rule.host.replace(/\./g, "\\.")}\\b`);
    if (exemptRe.test(combinedSource)) continue;
    if (getKnownRateLimits(manifest).length > 0) continue;
    violations.push({ host: rule.host, reason: rule.reason });
  }
  return violations;
}

// Mirror of check (b): internal consistency, ceiling semantics.
function findKnownRateLimitConsistencyViolation(manifest: Manifest): string | null {
  const rateLimits = getKnownRateLimits(manifest);
  if (rateLimits.length === 0) return null;

  for (const rl of rateLimits) {
    if (
      typeof rl.value !== "number" ||
      !Number.isFinite(rl.value) ||
      rl.value <= 0 ||
      !KNOWN_RATE_LIMIT_UNITS.includes(rl.unit) ||
      !rl.source_url
    ) {
      return "malformed";
    }
  }

  if (manifest.cost_class === "free_unlimited") {
    return "free_unlimited-with-known_rate_limit";
  }

  const derived = Math.min(...rateLimits.map(deriveQuotaCapFromRateLimit));
  if (manifest.quota_cap != null && manifest.quota_cap > derived) {
    return `quota_cap-exceeds-ceiling (declared ${manifest.quota_cap}, ceiling ${derived})`;
  }
  return null;
}

describe("check-cost-class-coherence — check (a): undeclared throttling", () => {
  it("fails a throttled-upstream capability with no known_rate_limit at all — regardless of cost_class", () => {
    // This is the regression this whole change guards: the pre-follow-up
    // version of this rule only fired when cost_class === 'free_unlimited'.
    // A capability correctly classified free_quota but with NO
    // known_rate_limit citation must still fail — "somebody classified
    // it right" is not the same as "the vendor fact is recorded anywhere
    // machine-readable."
    const manifest: Manifest = { slug: "ip-geolocation", cost_class: "free_quota", quota_cap: 2700 };
    const executorSource = `const response = await fetch(\`http://ip-api.com/json/\${ip}\`);`;
    const violations = findUndeclaredThrottleViolations(manifest, executorSource);
    expect(violations).toHaveLength(1);
    expect(violations[0].host).toBe("ip-api.com");
  });

  it("fails the original free_unlimited case too (detector is not weaker than before)", () => {
    const manifest: Manifest = { slug: "ip-geolocation", cost_class: "free_unlimited" };
    const executorSource = `const response = await fetch(\`http://ip-api.com/json/\${ip}\`);`;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toHaveLength(1);
  });

  it("fails via a shared lib import pattern (Etherscan family)", () => {
    const manifest: Manifest = { slug: "wallet-balance-lookup", cost_class: "free_quota", quota_cap: 100000 };
    const executorSource = `import { etherscanFetch } from "./lib/etherscan-client.js";`;
    const libSources: Record<string, string> = {
      "lib/etherscan-client.js": `const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";`,
    };
    const combinedSource = buildCombinedSource(executorSource, (p) => libSources[`${p}.js`] ?? "");
    expect(findUndeclaredThrottleViolations(manifest, combinedSource)).toHaveLength(1);
  });

  it("passes once known_rate_limit is declared (the fix direction)", () => {
    const manifest: Manifest = {
      slug: "ip-geolocation",
      cost_class: "free_quota",
      quota_cap: 2700,
      known_rate_limit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" },
    };
    const executorSource = `const response = await fetch(\`http://ip-api.com/json/\${ip}\`);`;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toEqual([]);
  });

  it("passes a multi-vendor capability once its throttled host is declared via the array form", () => {
    // The officer-search case: a manifest known_rate_limit array covering
    // multiple vendors (only one of which — Companies House — is in this
    // mirror's trimmed THROTTLED_HOST_RULES sample) still satisfies the
    // host check, because getKnownRateLimits() returns a non-empty array
    // regardless of how many entries it holds.
    const manifest: Manifest = {
      slug: "officer-search",
      cost_class: "free_quota",
      quota_cap: 600,
      known_rate_limit: [
        { value: 120, unit: "per_minute", source_url: "https://developer-specs.company-information.service.gov.uk/guides/rateLimiting" },
        { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" },
      ],
    };
    const executorSource = `const chResp = await fetch("https://api.company-information.service.gov.uk/company/123");`;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toEqual([]);
  });

  it("passes a genuine pure-computation capability with no vendor host", () => {
    const manifest: Manifest = { slug: "iban-validate", cost_class: "free_unlimited" };
    const executorSource = `export function validateIban(iban) { return mod97(rearrange(iban)) === 1; }`;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toEqual([]);
  });

  it("passes an arbitrary-customer-target fetch capability (no vendor account/quota)", () => {
    const manifest: Manifest = { slug: "url-to-markdown", cost_class: "free_unlimited" };
    const executorSource = `const response = await fetch(input.url, { signal: AbortSignal.timeout(10000) });`;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toEqual([]);
  });

  it("respects the per-host exemption comment escape hatch", () => {
    const manifest: Manifest = { slug: "some-cap", cost_class: "free_quota", quota_cap: 100 };
    const executorSource = `
      // cost-class-coherence-exempt: ip-api.com (fallback path only, primary is a different vendor)
      const response = await fetch(\`http://ip-api.com/json/\${ip}\`);
    `;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toEqual([]);
  });

  it("no-ops on unclassified capabilities (cost_class null)", () => {
    const manifest: Manifest = { slug: "some-new-cap", cost_class: null };
    const executorSource = `const response = await fetch("http://ip-api.com/json/1.1.1.1");`;
    expect(findUndeclaredThrottleViolations(manifest, executorSource)).toEqual([]);
  });
});

describe("check-cost-class-coherence — check (b): known_rate_limit internal consistency", () => {
  it("fails when cost_class is free_unlimited despite a declared known_rate_limit", () => {
    const manifest: Manifest = {
      slug: "ip-geolocation",
      cost_class: "free_unlimited",
      known_rate_limit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" },
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toMatch(/free_unlimited/);
  });

  it("passes once cost_class is corrected off free_unlimited (the fix direction)", () => {
    const manifest: Manifest = {
      slug: "ip-geolocation",
      cost_class: "free_quota",
      quota_cap: 2700,
      known_rate_limit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" },
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBeNull();
  });

  it("fails when quota_cap EXCEEDS the known_rate_limit-derived ceiling", () => {
    const manifest: Manifest = {
      slug: "ip-geolocation",
      cost_class: "free_quota",
      quota_cap: 9999, // ceiling is 2700 (45/min × 60)
      known_rate_limit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" },
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toMatch(/quota_cap-exceeds-ceiling/);
  });

  it("passes once quota_cap is brought back under the ceiling (the fix direction)", () => {
    const manifest: Manifest = {
      slug: "ip-geolocation",
      cost_class: "free_quota",
      quota_cap: 2700,
      known_rate_limit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" },
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBeNull();
  });

  it("passes when quota_cap is BELOW the ceiling — a conservative declaration is legitimate, not drift", () => {
    // This is the design decision this whole test file pins: equality is
    // NOT required. officer-search's quota_cap: 600 (Companies House's
    // own literal 5-minute-window figure) is well under its derived
    // 7,200/hr ceiling, and that must pass, not fail.
    const manifest: Manifest = {
      slug: "officer-search",
      cost_class: "free_quota",
      quota_cap: 600,
      known_rate_limit: [
        { value: 120, unit: "per_minute", source_url: "https://developer-specs.company-information.service.gov.uk/guides/rateLimiting" },
        { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" },
      ],
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBeNull();
  });

  it("multi-vendor: the MINIMUM derived ceiling governs, not the maximum", () => {
    // If quota_cap were checked against the max (36,000, SEC EDGAR) this
    // would wrongly pass; checked against the min (7,200, Companies
    // House) a quota_cap of 20,000 correctly fails.
    const manifest: Manifest = {
      slug: "officer-search",
      cost_class: "free_quota",
      quota_cap: 20000,
      known_rate_limit: [
        { value: 120, unit: "per_minute", source_url: "https://developer-specs.company-information.service.gov.uk/guides/rateLimiting" }, // 7200
        { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" }, // 36000
      ],
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toMatch(/quota_cap-exceeds-ceiling/);
  });

  it("fails on a malformed known_rate_limit (bad unit)", () => {
    const manifest: Manifest = {
      slug: "some-cap",
      cost_class: "free_quota",
      known_rate_limit: { value: 5, unit: "per_fortnight", source_url: "https://example.com" },
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBe("malformed");
  });

  it("fails when ANY entry in a multi-vendor array is malformed", () => {
    const manifest: Manifest = {
      slug: "officer-search",
      cost_class: "free_quota",
      known_rate_limit: [
        { value: 120, unit: "per_minute", source_url: "https://a.example.com" },
        { value: -5, unit: "per_second", source_url: "https://b.example.com" },
      ],
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBe("malformed");
  });

  it("passes a paid_prepaid capability with known_rate_limit and no quota_cap set", () => {
    // us-company-data: paid_prepaid, quota_window 'none', no quota_cap —
    // known_rate_limit is still worth declaring (it's a real vendor fact)
    // without requiring a quota_cap that paid_prepaid doesn't use.
    const manifest: Manifest = {
      slug: "us-company-data",
      cost_class: "paid_prepaid",
      known_rate_limit: { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" },
    };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBeNull();
  });

  it("no-ops when known_rate_limit is absent", () => {
    const manifest: Manifest = { slug: "iban-validate", cost_class: "free_unlimited" };
    expect(findKnownRateLimitConsistencyViolation(manifest)).toBeNull();
  });
});

describe("deriveQuotaCapFromRateLimit mirror — sanity check against the shipped values", () => {
  it("matches Block 0082's original hand-computed quota_cap for a representative sample", () => {
    expect(deriveQuotaCapFromRateLimit({ value: 3, unit: "per_minute" })).toBe(180); // brazilian-company-data
    expect(deriveQuotaCapFromRateLimit({ value: 10, unit: "per_second" })).toBe(36000); // sec-filing-events
    expect(deriveQuotaCapFromRateLimit({ value: 100000, unit: "per_day" })).toBe(100000); // Etherscan family
    expect(deriveQuotaCapFromRateLimit({ value: 120, unit: "per_minute" })).toBe(7200); // UK Companies House
  });
});
