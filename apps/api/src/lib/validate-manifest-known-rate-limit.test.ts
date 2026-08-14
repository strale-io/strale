/**
 * Unit tests for validateManifest()'s known_rate_limit shape gate
 * (gate1_manifest, onboarding-gates.ts) — the authoring-time half of the
 * Block 0082 follow-up (2026-08-14). This is a per-manifest,
 * shape-only check: it does NOT cross-check known_rate_limit against
 * cost_class/quota_cap (that's check-cost-class-coherence.mjs's job, a
 * repo-wide CI lint — see test/check-cost-class-coherence.test.ts).
 */

import { describe, it, expect } from "vitest";
import { validateManifest } from "./onboarding-gates.js";
import type { Manifest } from "./capability-manifest-types.js";

function fullManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    slug: "test-cap",
    name: "Test Capability",
    description: "A full manifest for unit testing the gate. 50+ chars long.",
    category: "validation",
    price_cents: 5,
    is_free_tier: false,
    input_schema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    },
    output_schema: {
      type: "object",
      properties: { r: { type: "string" } },
    },
    data_source: "Test Source",
    data_source_type: "api",
    transparency_tag: "algorithmic",
    freshness_category: "live-fetch",
    geography: "global",
    test_fixtures: {
      known_answer: {
        input: { q: "hello" },
        expected_fields: [{ field: "r", operator: "not_null" }],
      },
    },
    output_field_reliability: { r: "guaranteed" },
    limitations: [{ title: "x", text: "y", category: "coverage" }],
    maintenance_class: "pure-computation",
    processes_personal_data: false,
    personal_data_categories: [],
    ...overrides,
  };
}

describe("validateManifest — known_rate_limit shape gate", () => {
  it("passes when known_rate_limit is omitted (most capabilities have no vendor quota)", () => {
    const errors = validateManifest(fullManifest(), false);
    expect(errors).toEqual([]);
  });

  it("passes with a well-formed known_rate_limit", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" },
      }),
      false,
    );
    expect(errors).toEqual([]);
  });

  it("passes for each of the 3 valid units", () => {
    for (const unit of ["per_second", "per_minute", "per_day"] as const) {
      const errors = validateManifest(
        fullManifest({ known_rate_limit: { value: 1, unit, source_url: "https://example.com/docs" } }),
        false,
      );
      expect(errors, unit).toEqual([]);
    }
  });

  it("rejects a non-positive value", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: { value: 0, unit: "per_minute", source_url: "https://example.com" },
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.value"))).toBe(true);
  });

  it("rejects a negative value", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: { value: -5, unit: "per_minute", source_url: "https://example.com" },
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.value"))).toBe(true);
  });

  it("rejects an invalid unit", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: {
          value: 5,
          unit: "per_fortnight" as unknown as "per_minute",
          source_url: "https://example.com",
        },
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.unit"))).toBe(true);
  });

  it("rejects a missing source_url", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: { value: 5, unit: "per_minute", source_url: "" },
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.source_url"))).toBe(true);
  });

  it("rejects a source_url that isn't an http(s) URL", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: { value: 5, unit: "per_minute", source_url: "not-a-url" },
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.source_url"))).toBe(true);
  });

  // ── Array shape (multi-vendor capabilities, e.g. officer-search) ────────

  it("passes with a well-formed known_rate_limit array (multiple vendors)", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: [
          { value: 120, unit: "per_minute", source_url: "https://developer-specs.company-information.service.gov.uk/guides/rateLimiting" },
          { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" },
        ],
      }),
      false,
    );
    expect(errors).toEqual([]);
  });

  it("rejects a bad entry inside an array and labels which entry", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: [
          { value: 120, unit: "per_minute", source_url: "https://a.example.com" },
          { value: -1, unit: "per_minute", source_url: "https://b.example.com" },
        ],
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.value") && e.includes("entry 2"))).toBe(true);
    // First (valid) entry must not also be flagged.
    expect(errors.filter((e) => e.includes("known_rate_limit.value"))).toHaveLength(1);
  });

  it("rejects every malformed entry independently in a multi-entry array", () => {
    const errors = validateManifest(
      fullManifest({
        known_rate_limit: [
          { value: 0, unit: "per_minute", source_url: "https://a.example.com" },
          { value: 5, unit: "per_fortnight" as unknown as "per_minute", source_url: "https://b.example.com" },
        ],
      }),
      false,
    );
    expect(errors.some((e) => e.includes("known_rate_limit.value") && e.includes("entry 1"))).toBe(true);
    expect(errors.some((e) => e.includes("known_rate_limit.unit") && e.includes("entry 2"))).toBe(true);
  });
});
