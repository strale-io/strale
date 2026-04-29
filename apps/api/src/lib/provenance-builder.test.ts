import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getProcessingJurisdictions } from "./provenance-builder.js";

describe("getProcessingJurisdictions", () => {
  const original = {
    railway: process.env.RAILWAY_REPLICA_REGION,
    legacy: process.env.STRALE_PROCESSING_REGION,
  };

  beforeEach(() => {
    delete process.env.RAILWAY_REPLICA_REGION;
    delete process.env.STRALE_PROCESSING_REGION;
  });

  afterEach(() => {
    if (original.railway === undefined) delete process.env.RAILWAY_REPLICA_REGION;
    else process.env.RAILWAY_REPLICA_REGION = original.railway;
    if (original.legacy === undefined) delete process.env.STRALE_PROCESSING_REGION;
    else process.env.STRALE_PROCESSING_REGION = original.legacy;
  });

  describe("when running on Railway US East (the actual production state)", () => {
    beforeEach(() => {
      process.env.RAILWAY_REPLICA_REGION = "us-east4-eqdc4a";
    });

    it("pure-algorithmic capability returns ['US']", () => {
      expect(getProcessingJurisdictions("deterministic", "algorithmic")).toEqual(["US"]);
    });

    it("stable-API capability returns ['US']", () => {
      expect(getProcessingJurisdictions("stable_api", "algorithmic")).toEqual(["US"]);
    });

    it("ai_assisted capability returns ['US'] (no duplicate even though Anthropic is also US)", () => {
      expect(getProcessingJurisdictions("ai_assisted", "ai_generated")).toEqual(["US"]);
    });

    it("mixed transparency returns ['US']", () => {
      expect(getProcessingJurisdictions("stable_api", "mixed")).toEqual(["US"]);
    });

    it("is NOT 'EU' for any combination — F-AUDIT-01 regression guard", () => {
      const cases: Array<[string, string | null]> = [
        ["deterministic", "algorithmic"],
        ["stable_api", "algorithmic"],
        ["stable_api", "ai_generated"],
        ["stable_api", "mixed"],
        ["ai_assisted", "ai_generated"],
        ["scraping", "algorithmic"],
      ];
      for (const [type, tag] of cases) {
        const out = getProcessingJurisdictions(type, tag);
        expect(out, `${type}/${tag}`).not.toContain("EU");
        expect(out.join(","), `${type}/${tag}`).not.toBe("EU");
      }
    });
  });

  describe("when running on Railway EU West (hypothetical future)", () => {
    beforeEach(() => {
      process.env.RAILWAY_REPLICA_REGION = "eu-west4";
    });

    it("pure-algorithmic capability returns ['EU']", () => {
      expect(getProcessingJurisdictions("deterministic", "algorithmic")).toEqual(["EU"]);
    });

    it("ai_assisted capability returns ['EU', 'US'] (Anthropic crosses to US)", () => {
      expect(getProcessingJurisdictions("ai_assisted", "ai_generated")).toEqual(["EU", "US"]);
    });
  });

  describe("when no region env is set (local dev / unconfigured)", () => {
    it("pure-algorithmic returns [] — does not fabricate jurisdiction", () => {
      expect(getProcessingJurisdictions("deterministic", "algorithmic")).toEqual([]);
    });

    it("ai_assisted returns ['US'] — at least Anthropic is known", () => {
      expect(getProcessingJurisdictions("ai_assisted", "ai_generated")).toEqual(["US"]);
    });
  });
});
