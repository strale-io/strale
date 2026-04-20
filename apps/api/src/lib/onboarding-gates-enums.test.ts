import { describe, it, expect } from "vitest";
import {
  VALID_MAINTENANCE_CLASSES,
  VALID_TRANSPARENCY_TAGS,
  VALID_CATEGORIES,
  PII_CATEGORY_ENUM,
} from "./onboarding-gates.js";

/**
 * Cluster 2 Phase 1 (F-B-007): enum exports are the single canonical source.
 * These tests pin the contents so a regression (accidental value deletion,
 * mis-merged PR) fails loudly. They intentionally do NOT cross-file assert
 * identity — by design, there is now only one source per enum.
 */
describe("Cluster 2 Phase 1: enum exports", () => {
  it("VALID_MAINTENANCE_CLASSES is a non-empty array", () => {
    expect(Array.isArray(VALID_MAINTENANCE_CLASSES)).toBe(true);
    expect(VALID_MAINTENANCE_CLASSES.length).toBeGreaterThan(0);
  });

  it("VALID_TRANSPARENCY_TAGS is a non-empty array", () => {
    expect(Array.isArray(VALID_TRANSPARENCY_TAGS)).toBe(true);
    expect(VALID_TRANSPARENCY_TAGS.length).toBeGreaterThan(0);
  });

  it("VALID_CATEGORIES is a non-empty array", () => {
    expect(Array.isArray(VALID_CATEGORIES)).toBe(true);
    expect(VALID_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("PII_CATEGORY_ENUM is a non-empty array", () => {
    expect(Array.isArray(PII_CATEGORY_ENUM)).toBe(true);
    expect(PII_CATEGORY_ENUM.length).toBeGreaterThan(0);
  });

  it("VALID_MAINTENANCE_CLASSES pins the 6 canonical values", () => {
    expect(VALID_MAINTENANCE_CLASSES.length).toBe(6);
    expect(VALID_MAINTENANCE_CLASSES).toContain("free-stable-api");
    expect(VALID_MAINTENANCE_CLASSES).toContain("commercial-stable-api");
    expect(VALID_MAINTENANCE_CLASSES).toContain("pure-computation");
    expect(VALID_MAINTENANCE_CLASSES).toContain("scraping-stable-target");
    expect(VALID_MAINTENANCE_CLASSES).toContain("scraping-fragile-target");
    expect(VALID_MAINTENANCE_CLASSES).toContain("requires-domain-expertise");
  });

  it("VALID_TRANSPARENCY_TAGS includes the current 3 tags + null (pre-Phase-5)", () => {
    // Phase 5 (Cluster 2 design) removes null after the heuristic default is
    // deleted. Until then, null is an allowed value representing "not yet
    // declared". This test catches accidental early removal of null.
    expect(VALID_TRANSPARENCY_TAGS).toContain("algorithmic");
    expect(VALID_TRANSPARENCY_TAGS).toContain("ai_generated");
    expect(VALID_TRANSPARENCY_TAGS).toContain("mixed");
    expect(VALID_TRANSPARENCY_TAGS).toContain(null);
    expect(VALID_TRANSPARENCY_TAGS.length).toBe(4);
  });

  it("VALID_CATEGORIES contains expected canonical categories", () => {
    // Spot-check a handful; the full list is in onboarding-gates.ts.
    // Adding a new category is fine; removing one needs to fail this test.
    expect(VALID_CATEGORIES).toContain("company-data");
    expect(VALID_CATEGORIES).toContain("compliance");
    expect(VALID_CATEGORIES).toContain("developer-tools");
    expect(VALID_CATEGORIES).toContain("agent-tooling");
    expect(VALID_CATEGORIES).toContain("web-intelligence");
  });

  it("PII_CATEGORY_ENUM pins the 12 canonical categories per DEC-20260420-D", () => {
    const expected = [
      "name", "email", "phone", "address", "date_of_birth",
      "government_id", "financial", "professional", "behavioral",
      "biometric", "health", "sensitive_special",
    ];
    for (const cat of expected) {
      expect(PII_CATEGORY_ENUM).toContain(cat);
    }
    expect(PII_CATEGORY_ENUM.length).toBe(12);
  });
});
