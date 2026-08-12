import { describe, expect, it } from "vitest";
import { eurCentsToUsd, eurCentsToUsdcAtomic } from "./x402-gateway.js";

// Regression tests for the P1 machine-surface finding (2026-08-12): float
// arithmetic on EUR_USD_RATE emitted `price_usd: 0.21600000000000003` in the
// x402 catalog and settled ceil(216000.00000000003) = 216001 atomic units —
// a systematic +1 micro-USD overcharge vs the advertised price. Both fail
// against the pre-fix implementation ((eurCents/100) * 1.08, then
// ceil(usd * 1e6)).

describe("eurCentsToUsd", () => {
  it("emits clean machine-readable numbers (the sanctions-check case: 20c → 0.216)", () => {
    expect(JSON.stringify(eurCentsToUsd(20))).toBe("0.216");
  });

  it("produces no float artifacts across the whole realistic price range", () => {
    for (let cents = 1; cents <= 400; cents++) {
      const s = JSON.stringify(eurCentsToUsd(cents));
      // 6 decimals max — micro-USD precision, no 17-digit float tails.
      expect(s, `price_usd for ${cents}c`).toMatch(/^\d+(\.\d{1,6})?$/);
    }
  });
});

describe("eurCentsToUsdcAtomic", () => {
  it("does not overcharge the extra atomic unit (20c → exactly 216000, not 216001)", () => {
    expect(eurCentsToUsdcAtomic(20)).toBe("216000");
  });

  it("advertised price and settled amount agree exactly for every price", () => {
    for (let cents = 1; cents <= 400; cents++) {
      expect(Number(eurCentsToUsdcAtomic(cents)), `atomic for ${cents}c`)
        .toBe(Math.round(eurCentsToUsd(cents) * 1_000_000));
    }
  });

  it("still rounds up, never down (5c at 1.08 → 54000 exactly; 1c → 10800)", () => {
    expect(eurCentsToUsdcAtomic(5)).toBe("54000");
    expect(eurCentsToUsdcAtomic(1)).toBe("10800");
  });

  it("survives the route-layer float round-trip (usd → ×1e6 → round) exactly", () => {
    // The v2 route carries price as a float USD and reconverts to atomic
    // (usdToUsdcAtomic / priceUsdOverride). Review caught that ceil() there
    // re-created the +1 artifact for ~3% of cent values through float error;
    // both sites now use round(), whose exactness this pins for every price.
    for (let cents = 1; cents <= 400; cents++) {
      expect(String(Math.round(eurCentsToUsd(cents) * 1_000_000)), `round-trip for ${cents}c`)
        .toBe(eurCentsToUsdcAtomic(cents));
    }
  });
});
