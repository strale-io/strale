import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getProcessingLocation,
  getStraleJurisdiction,
  jurisdictionFromRegion,
  __resetProcessingLocationWarnForTests,
} from "./processing-location.js";

describe("processing-location", () => {
  const original = {
    railway: process.env.RAILWAY_REPLICA_REGION,
    legacy: process.env.STRALE_PROCESSING_REGION,
  };

  beforeEach(() => {
    delete process.env.RAILWAY_REPLICA_REGION;
    delete process.env.STRALE_PROCESSING_REGION;
    __resetProcessingLocationWarnForTests();
  });

  afterEach(() => {
    if (original.railway === undefined) delete process.env.RAILWAY_REPLICA_REGION;
    else process.env.RAILWAY_REPLICA_REGION = original.railway;
    if (original.legacy === undefined) delete process.env.STRALE_PROCESSING_REGION;
    else process.env.STRALE_PROCESSING_REGION = original.legacy;
  });

  describe("getProcessingLocation", () => {
    it("prefers RAILWAY_REPLICA_REGION over STRALE_PROCESSING_REGION", () => {
      process.env.RAILWAY_REPLICA_REGION = "us-east4-eqdc4a";
      process.env.STRALE_PROCESSING_REGION = "eu-west";
      expect(getProcessingLocation()).toBe("us-east4-eqdc4a");
    });

    it("falls back to STRALE_PROCESSING_REGION", () => {
      process.env.STRALE_PROCESSING_REGION = "us-east";
      expect(getProcessingLocation()).toBe("us-east");
    });

    it("returns 'unknown' when neither env var is set", () => {
      expect(getProcessingLocation()).toBe("unknown");
    });
  });

  describe("jurisdictionFromRegion", () => {
    it.each([
      ["us-east4-eqdc4a", "US"],
      ["us-east-4", "US"],
      ["us-west2", "US"],
      ["US", "US"],
      ["us", "US"],
      ["eu-west4", "EU"],
      ["eu-west-4", "EU"],
      ["EU", "EU"],
      ["uk-south", "GB"],
      ["gb-london", "GB"],
      // Honest-ignorance cases — must not fabricate
      ["asia-southeast1", "unknown"],
      ["", "unknown"],
      ["unknown", "unknown"],
      ["nonsense", "unknown"],
    ])("maps %s -> %s", (region, expected) => {
      expect(jurisdictionFromRegion(region)).toBe(expected);
    });
  });

  describe("getStraleJurisdiction", () => {
    it("returns US when Railway region is us-east", () => {
      process.env.RAILWAY_REPLICA_REGION = "us-east4-eqdc4a";
      expect(getStraleJurisdiction()).toBe("US");
    });

    it("returns EU when Railway region is eu-west", () => {
      process.env.RAILWAY_REPLICA_REGION = "eu-west4";
      expect(getStraleJurisdiction()).toBe("EU");
    });

    it("returns 'unknown' when no env var set (does not fabricate)", () => {
      expect(getStraleJurisdiction()).toBe("unknown");
    });

    it("the actual production deploy (Railway us-east-4) is NOT EU — regression guard for F-AUDIT-01", () => {
      // This test exists explicitly to prevent the original bug recurring:
      // hardcoded "EU" when the platform actually processes in US East.
      process.env.RAILWAY_REPLICA_REGION = "us-east4-eqdc4a";
      const j = getStraleJurisdiction();
      expect(j).not.toBe("EU");
      expect(j).toBe("US");
    });
  });
});
