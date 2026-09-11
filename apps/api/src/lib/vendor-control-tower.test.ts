import { describe, expect, it } from "vitest";
import {
  assessVendorBalance,
  browserlessServesFromCloud,
  parseBrowserlessUsage,
  parseOpenRegisterCredits,
} from "./vendor-control-tower.js";

describe("Vendor Control Tower balance classification", () => {
  it("classifies the observed OpenRegister 0/500 response as exhausted and keeps the exact reset", () => {
    const balance = parseOpenRegisterCredits({
      included_credits: 500,
      used_credits: 500,
      remaining_credits: 0,
      overage_credits: 0,
      paid: false,
      period: { reset_at: "2026-09-06T23:40:04.613764949Z" },
    });
    const assessed = assessVendorBalance(balance);

    expect(assessed.status).toBe("exhausted");
    expect(assessed.lowBalanceThresholdUnits).toBe(100);
    expect(assessed.resetAt).toBe("2026-09-06T23:40:04.613Z");
  });

  it("does not suspend a paid account that can continue into overage", () => {
    const assessed = assessVendorBalance({
      providerName: "openregister",
      planName: "Paid",
      includedUnits: 5_000,
      usedUnits: 5_000,
      remainingUnits: 0,
      overageUnits: 12,
      usageUnit: "credit",
      resetAt: "2026-09-07T00:00:00Z",
      canUseOverage: true,
    });

    expect(assessed.status).toBe("low");
    expect(assessed.status).not.toBe("exhausted");
  });

  it("parses Browserless' zero-cost usage endpoint and warns at 20%", () => {
    const balance = parseBrowserlessUsage({
      plan: { name: "free" },
      units: { included: 1_000, used: 810, remaining: 190 },
      billingPeriod: { end: "2026-08-25T22:47:56.000Z" },
    });

    expect(assessVendorBalance(balance)).toMatchObject({
      providerName: "browserless",
      status: "low",
      lowBalanceThresholdUnits: 200,
      remainingUnits: 190,
    });
  });

  it("fails closed on malformed balance data instead of inventing a healthy value", () => {
    expect(() => parseOpenRegisterCredits({
      included_credits: 500,
      used_credits: 500,
      remaining_credits: "unknown",
      paid: false,
    })).toThrow(/remaining_credits/);
  });
});

describe("which Browserless endpoint the account API describes", () => {
  it("treats only browserless.io hosts as the hosted product", () => {
    expect(browserlessServesFromCloud("https://production-sfo.browserless.io")).toBe(true);
    expect(browserlessServesFromCloud("https://chrome.browserless.io/")).toBe(true);
    expect(browserlessServesFromCloud("https://browserless.io")).toBe(true);
  });

  it("does not let the cloud account vouch for the self-hosted container", () => {
    // Production's value (railway-config.md): the pinned v1 container.
    expect(browserlessServesFromCloud("http://chromium.railway.internal:8080")).toBe(false);
    expect(browserlessServesFromCloud("http://localhost:3000")).toBe(false);
  });

  it("refuses lookalike, malformed and missing values", () => {
    expect(browserlessServesFromCloud("https://notbrowserless.io")).toBe(false);
    expect(browserlessServesFromCloud("https://browserless.io.example.com")).toBe(false);
    expect(browserlessServesFromCloud("not a url")).toBe(false);
    expect(browserlessServesFromCloud("")).toBe(false);
  });
});
