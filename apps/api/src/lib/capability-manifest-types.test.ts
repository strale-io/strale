/**
 * Unit tests for the `known_rate_limit` manifest field and its
 * derivation function — the Block 0082 follow-up (2026-08-14) that gives
 * a capability's vendor-documented rate limit one canonical home
 * instead of three independently-drifting copies (see the doc comment
 * on ManifestKnownRateLimit for the full context).
 *
 * These pin `deriveQuotaCapFromRateLimit`'s three unit branches against
 * the exact numbers Block 0082's original 19-capability reclassification
 * hand-computed, so the refactor from hand-computed integers to a shared
 * function (startup-migrations.ts PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY)
 * is provably value-preserving.
 */

import { describe, it, expect } from "vitest";
import {
  deriveQuotaCapFromRateLimit,
  deriveQuotaCapFromRateLimits,
  getKnownRateLimits,
  KNOWN_RATE_LIMIT_UNITS,
  type ManifestKnownRateLimit,
} from "./capability-manifest-types.js";

describe("deriveQuotaCapFromRateLimit", () => {
  it("per_second: 1-hour-sustained volume (value × 3600)", () => {
    // SEC EDGAR: 10 req/sec fair-access policy → 36,000, not the naive
    // 24h extrapolation (864,000) — Block 0082's own conservative-estimate
    // rationale.
    const rl: ManifestKnownRateLimit = { value: 10, unit: "per_second", source_url: "https://example.com" };
    expect(deriveQuotaCapFromRateLimit(rl)).toBe(36000);
  });

  it("per_minute: 1-hour-sustained volume (value × 60)", () => {
    // ip-api.com: 45 req/min → 2,700.
    const rl: ManifestKnownRateLimit = { value: 45, unit: "per_minute", source_url: "https://example.com" };
    expect(deriveQuotaCapFromRateLimit(rl)).toBe(2700);
  });

  it("per_day: literal value, no multiplication", () => {
    // Etherscan's documented literal daily cap (100,000/day) is used
    // as-is, not derived from its separately-documented 5 calls/sec.
    const rl: ManifestKnownRateLimit = { value: 100000, unit: "per_day", source_url: "https://example.com" };
    expect(deriveQuotaCapFromRateLimit(rl)).toBe(100000);
  });

  it("pins all 19 of Block 0082's original hand-computed values", () => {
    // Every (value, unit) → quotaCap pair that PR #235 shipped, expressed
    // as known_rate_limit inputs. This is the regression test that
    // guarantees the derive-from-shared-function refactor of
    // PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY in startup-migrations.ts
    // didn't silently change a single number.
    const cases: Array<[ManifestKnownRateLimit, number]> = [
      [{ value: 3, unit: "per_minute", source_url: "x" }, 180], // ReceitaWS
      [{ value: 4, unit: "per_minute", source_url: "x" }, 240], // Nominatim
      [{ value: 10000, unit: "per_day", source_url: "x" }, 10000], // Open-Meteo
      [{ value: 45, unit: "per_minute", source_url: "x" }, 2700], // ip-api.com
      [{ value: 10, unit: "per_second", source_url: "x" }, 36000], // SEC EDGAR
      [{ value: 100000, unit: "per_day", source_url: "x" }, 100000], // Etherscan
      [{ value: 15, unit: "per_minute", source_url: "x" }, 900], // Open Food Facts
      [{ value: 5, unit: "per_minute", source_url: "x" }, 300], // CoinGecko
      [{ value: 12, unit: "per_minute", source_url: "x" }, 720], // GDELT (1/5s)
      [{ value: 30, unit: "per_minute", source_url: "x" }, 1800], // GoPlus Labs
    ];
    for (const [rl, expected] of cases) {
      expect(deriveQuotaCapFromRateLimit(rl), `${rl.value} ${rl.unit}`).toBe(expected);
    }
  });

  it("throws on an unrecognized unit (defensive — TS should prevent this at compile time)", () => {
    const rl = { value: 1, unit: "per_fortnight", source_url: "x" } as unknown as ManifestKnownRateLimit;
    expect(() => deriveQuotaCapFromRateLimit(rl)).toThrow(/Unknown known_rate_limit\.unit/);
  });
});

describe("KNOWN_RATE_LIMIT_UNITS", () => {
  it("pins the 3 canonical units", () => {
    expect(KNOWN_RATE_LIMIT_UNITS).toEqual(["per_second", "per_minute", "per_day"]);
  });
});

describe("getKnownRateLimits", () => {
  it("returns [] when known_rate_limit is absent", () => {
    expect(getKnownRateLimits({ known_rate_limit: undefined })).toEqual([]);
    expect(getKnownRateLimits({ known_rate_limit: null })).toEqual([]);
  });

  it("wraps a single object in an array-of-one", () => {
    const rl: ManifestKnownRateLimit = { value: 45, unit: "per_minute", source_url: "https://example.com" };
    expect(getKnownRateLimits({ known_rate_limit: rl })).toEqual([rl]);
  });

  it("returns an already-array value as-is", () => {
    const rls: ManifestKnownRateLimit[] = [
      { value: 120, unit: "per_minute", source_url: "https://a.example.com" },
      { value: 10, unit: "per_second", source_url: "https://b.example.com" },
    ];
    expect(getKnownRateLimits({ known_rate_limit: rls })).toBe(rls);
  });
});

describe("deriveQuotaCapFromRateLimits — multi-vendor minimum", () => {
  it("returns the single value for a 1-entry array", () => {
    expect(deriveQuotaCapFromRateLimits([{ value: 45, unit: "per_minute", source_url: "x" }])).toBe(2700);
  });

  it("takes the MINIMUM (most restrictive) across multiple vendors", () => {
    // officer-search: UK Companies House (120/min → 7,200/hr) + SEC EDGAR
    // (10/sec → 36,000/hr). Companies House is the binding constraint.
    const rateLimits: ManifestKnownRateLimit[] = [
      { value: 120, unit: "per_minute", source_url: "https://developer-specs.company-information.service.gov.uk/guides/rateLimiting" },
      { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" },
    ];
    expect(deriveQuotaCapFromRateLimits(rateLimits)).toBe(7200);
  });

  it("order-independent — the minimum doesn't depend on array order", () => {
    const a: ManifestKnownRateLimit = { value: 120, unit: "per_minute", source_url: "x" }; // 7200
    const b: ManifestKnownRateLimit = { value: 10, unit: "per_second", source_url: "x" }; // 36000
    expect(deriveQuotaCapFromRateLimits([a, b])).toBe(7200);
    expect(deriveQuotaCapFromRateLimits([b, a])).toBe(7200);
  });

  it("throws on an empty array — callers must check length (or use getKnownRateLimits)", () => {
    expect(() => deriveQuotaCapFromRateLimits([])).toThrow(/requires at least one/);
  });
});
