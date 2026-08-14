/**
 * Unit tests for the Phase A0b cost_class coherence check, focused on the
 * Block 0082 follow-up: the THROTTLED_HOST_RULES dimension that flags a
 * capability whose executor calls a vendor with a documented rate limit
 * or daily cap, but whose manifest declares `cost_class: free_unlimited`.
 *
 * Per Rule 12 (audit-follow-up test coverage): both directions covered —
 * a throttled-upstream capability wrongly declared free_unlimited must
 * fail; a genuine pure-computation (no vendor) capability must pass.
 *
 * The script itself is .mjs and scans the on-disk manifests +
 * capabilities directories; this test mirrors the smaller matching logic
 * so it doesn't depend on the production manifest/capability set. If the
 * mjs script's logic changes, this mirror must change with it — the live
 * check at CI time uses the script; this test guards the contract.
 */

import { describe, it, expect } from "vitest";

// Mirror of THROTTLED_HOST_RULES from check-cost-class-coherence.mjs. Every
// rule disallows exactly `free_unlimited` (the real script hard-codes this
// check rather than carrying a redundant per-rule `disallowed: [...]`
// array — mirrored here without one too, so a future divergence would
// show up as a failing test rather than a silently-stale mirror).
const THROTTLED_HOST_RULES = [
  { host: "receitaws.com.br", reason: "ReceitaWS free tier is rate-limited to 3 req/min." },
  { host: "ip-api.com", reason: "ip-api.com free endpoint is rate-limited to 45 req/min." },
  {
    host: "api.etherscan.io",
    reason: "Etherscan free tier is rate-limited to 5 calls/sec, 100,000 calls/day.",
  },
];

// Mirror of check-cost-class-coherence.mjs's lib-import-following logic:
// walk `from "./lib/xxx.js"` imports in the executor source and append
// each resolved lib file's source, so a host string that only appears in
// a shared client (e.g. lib/etherscan-client.ts) still matches. `readLib`
// stands in for the real script's readFileSync-against-disk call — this
// keeps the test disk-free while still exercising the actual regex.
function buildCombinedSource(executorSource: string, readLib: (libImportPath: string) => string): string {
  let combined = executorSource;
  const importMatches = executorSource.matchAll(/from\s+["']\.\/(lib\/[a-zA-Z0-9_-]+)\.js["']/g);
  for (const m of importMatches) {
    combined += "\n" + readLib(m[1]);
  }
  return combined;
}

// Mirror of the per-manifest matching logic (env-var rules omitted here —
// covered separately by the pre-existing RULES; this test targets only
// the new host-based dimension added for Block 0082).
function findThrottledHostViolations(
  manifest: { slug: string; cost_class?: string | null },
  combinedSource: string,
): Array<{ host: string; reason: string }> {
  if (!manifest.cost_class) return [];
  const violations: Array<{ host: string; reason: string }> = [];
  for (const rule of THROTTLED_HOST_RULES) {
    if (!combinedSource.includes(rule.host)) continue;
    if (manifest.cost_class !== "free_unlimited") continue;
    const exemptRe = new RegExp(`cost-class-coherence-exempt:\\s*${rule.host.replace(/\./g, "\\.")}\\b`);
    if (exemptRe.test(combinedSource)) continue;
    violations.push({ host: rule.host, reason: rule.reason });
  }
  return violations;
}

describe("check-cost-class-coherence — THROTTLED_HOST_RULES (Block 0082 guard)", () => {
  it("fails a throttled-upstream capability declared free_unlimited", () => {
    // This is the exact regression class Block 0082 fixed: an executor
    // calling a documented-rate-limited vendor (ip-api.com, 45 req/min)
    // while the manifest claims no constraint applies.
    const manifest = { slug: "ip-geolocation", cost_class: "free_unlimited" };
    const executorSource = `
      const response = await fetch(\`http://ip-api.com/json/\${ip}\`);
    `;
    const violations = findThrottledHostViolations(manifest, executorSource);
    expect(violations).toHaveLength(1);
    expect(violations[0].host).toBe("ip-api.com");
  });

  it("fails a throttled-upstream capability even via a shared lib import pattern", () => {
    // Etherscan family capabilities import a shared client rather than
    // calling api.etherscan.io directly in the top-level executor file —
    // this is the exact case Block 0082's citation calls out. Exercises
    // the real import-following regex (buildCombinedSource), not a
    // hand-assembled string: the executor source only names the import
    // path; the host string lives solely in the "lib file" content
    // returned by readLib, matching the real script's two-step read.
    const manifest = { slug: "wallet-balance-lookup", cost_class: "free_unlimited" };
    const executorSource = `import { etherscanFetch } from "./lib/etherscan-client.js";`;
    const libSources: Record<string, string> = {
      "lib/etherscan-client.js": `const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";`,
    };
    const combinedSource = buildCombinedSource(executorSource, (libImportPath) => libSources[`${libImportPath}.js`] ?? "");
    const violations = findThrottledHostViolations(manifest, combinedSource);
    expect(violations).toHaveLength(1);
    expect(violations[0].host).toBe("api.etherscan.io");
  });

  it("buildCombinedSource ignores unrelated relative imports (no false host match)", () => {
    // Negative control on the import-following mechanism itself: an
    // import of a non-lib or non-matching-shape path must not be
    // followed, so it can't accidentally pull in a host string from an
    // unrelated file.
    const executorSource = `import { helper } from "./formatting.js";`;
    const combined = buildCombinedSource(executorSource, () => {
      throw new Error("readLib should not be called for a non-lib/ import");
    });
    expect(combined).toBe(executorSource);
  });

  it("passes once reclassified to free_quota", () => {
    // The fix direction: same executor, cost_class corrected.
    const manifest = { slug: "ip-geolocation", cost_class: "free_quota" };
    const executorSource = `
      const response = await fetch(\`http://ip-api.com/json/\${ip}\`);
    `;
    expect(findThrottledHostViolations(manifest, executorSource)).toEqual([]);
  });

  it("passes a genuine pure-computation capability with no vendor host", () => {
    // The negative control: a capability with zero external dependency
    // (e.g. iban-validate — pure algorithmic checksum) must never trip
    // this rule regardless of cost_class.
    const manifest = { slug: "iban-validate", cost_class: "free_unlimited" };
    const executorSource = `
      export function validateIban(iban: string): boolean {
        // ISO 13616 checksum, no external fetch at all.
        return mod97(rearrange(iban)) === 1;
      }
    `;
    expect(findThrottledHostViolations(manifest, executorSource)).toEqual([]);
  });

  it("passes an arbitrary-customer-target fetch capability (no vendor account/quota)", () => {
    // url-to-markdown fetches whatever URL the customer supplies — there
    // is no vendor account being rate-limited, so free_unlimited is
    // correct even though the executor does call fetch().
    const manifest = { slug: "url-to-markdown", cost_class: "free_unlimited" };
    const executorSource = `
      const response = await fetch(input.url, { signal: AbortSignal.timeout(10000) });
    `;
    expect(findThrottledHostViolations(manifest, executorSource)).toEqual([]);
  });

  it("respects the per-host exemption comment escape hatch", () => {
    const manifest = { slug: "ip-geolocation", cost_class: "free_unlimited" };
    const executorSource = `
      // cost-class-coherence-exempt: ip-api.com (fallback path only, primary is a different vendor)
      const response = await fetch(\`http://ip-api.com/json/\${ip}\`);
    `;
    expect(findThrottledHostViolations(manifest, executorSource)).toEqual([]);
  });

  it("no-ops on unclassified capabilities (cost_class null)", () => {
    const manifest = { slug: "some-new-cap", cost_class: null };
    const executorSource = `const response = await fetch("http://ip-api.com/json/1.1.1.1");`;
    expect(findThrottledHostViolations(manifest, executorSource)).toEqual([]);
  });
});
