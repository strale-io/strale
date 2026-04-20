/**
 * Unit tests for the Manifest → DB-row normalizer (Cluster 2 Phase 3 C2).
 *
 * Pins the field-by-field mapping so a regression (accidental drop,
 * renamed column, silent default change) fails loudly.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeManifestToRow,
  dataSourceTypeToCapType,
} from "./capability-manifest.js";
import type { Manifest } from "./capability-manifest-types.js";

function fullManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    slug: "test-cap",
    name: "Test Capability",
    description: "A full manifest for unit testing the normalizer. 50+ chars.",
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

describe("normalizeManifestToRow (Cluster 2 Phase 3 C2)", () => {
  // ── Non-partial mode (create path) ───────────────────────────────────────

  it("maps all Manifest snake_case fields to DB camelCase fields", () => {
    const row = normalizeManifestToRow(fullManifest());
    expect(row.slug).toBe("test-cap");
    expect(row.name).toBe("Test Capability");
    expect(row.description).toContain("full manifest");
    expect(row.category).toBe("validation");
    expect(row.priceCents).toBe(5);
    expect(row.isFreeTier).toBe(false);
    expect(row.inputSchema).toBeDefined();
    expect(row.outputSchema).toBeDefined();
    expect(row.dataSource).toBe("Test Source");
    expect(row.capabilityType).toBe("stable_api"); // api → stable_api
    expect(row.transparencyTag).toBe("algorithmic");
    expect(row.freshnessCategory).toBe("live-fetch");
    expect(row.geography).toBe("global");
    expect(row.outputFieldReliability).toEqual({ r: "guaranteed" });
    expect(row.maintenanceClass).toBe("pure-computation");
    expect(row.processesPersonalData).toBe(false);
    expect(row.personalDataCategories).toEqual([]);
  });

  it("stamps lifecycleState='validating', visible=false, isActive=true on create", () => {
    const row = normalizeManifestToRow(fullManifest());
    expect(row.lifecycleState).toBe("validating");
    expect(row.visible).toBe(false);
    expect(row.isActive).toBe(true);
  });

  it("applies default dataClassification='public' when not declared", () => {
    const row = normalizeManifestToRow(fullManifest());
    expect(row.dataClassification).toBe("public");
  });

  it("honors manifest's data_classification when declared", () => {
    const m = { ...fullManifest(), data_classification: "personal" } as Manifest;
    const row = normalizeManifestToRow(m);
    expect(row.dataClassification).toBe("personal");
  });

  it("applies default maintenance_class when missing", () => {
    const m = fullManifest();
    delete m.maintenance_class;
    const row = normalizeManifestToRow(m);
    expect(row.maintenanceClass).toBe("scraping-fragile-target");
  });

  // ── Partial mode (backfill path) ─────────────────────────────────────────

  it("partial mode: omits fields that are undefined (backfill doesn't clobber DB-canonical defaults)", () => {
    const m = fullManifest();
    delete m.maintenance_class;
    delete m.is_free_tier;
    delete m.transparency_tag;
    const row = normalizeManifestToRow(m, { partial: true });
    expect(Object.prototype.hasOwnProperty.call(row, "maintenanceClass")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "isFreeTier")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "transparencyTag")).toBe(false);
    // Still has what was declared
    expect(row.slug).toBe("test-cap");
    expect(row.priceCents).toBe(5);
  });

  it("partial mode: does NOT stamp lifecycleState/visible/isActive", () => {
    const row = normalizeManifestToRow(fullManifest(), { partial: true });
    expect(Object.prototype.hasOwnProperty.call(row, "lifecycleState")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "visible")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "isActive")).toBe(false);
  });

  it("partial mode: preserves processes_personal_data=false (not treated as missing)", () => {
    const m = fullManifest({ processes_personal_data: false });
    const row = normalizeManifestToRow(m, { partial: true });
    expect(row.processesPersonalData).toBe(false);
  });

  it("partial mode: omits processes_personal_data when undefined", () => {
    const m = fullManifest();
    delete m.processes_personal_data;
    const row = normalizeManifestToRow(m, { partial: true });
    expect(Object.prototype.hasOwnProperty.call(row, "processesPersonalData")).toBe(false);
  });

  // ── data_source_type → capability_type mapping ──────────────────────────

  it("maps data_source_type 'computed' → capabilityType 'deterministic'", () => {
    const row = normalizeManifestToRow(fullManifest({ data_source_type: "computed" }));
    expect(row.capabilityType).toBe("deterministic");
  });

  it("maps data_source_type 'scrape' → capabilityType 'scraping'", () => {
    const row = normalizeManifestToRow(fullManifest({ data_source_type: "scrape" }));
    expect(row.capabilityType).toBe("scraping");
  });

  it("maps data_source_type 'ai_assisted' → capabilityType 'ai_assisted'", () => {
    const row = normalizeManifestToRow(fullManifest({ data_source_type: "ai_assisted" }));
    expect(row.capabilityType).toBe("ai_assisted");
  });

  it("dataSourceTypeToCapType falls back to 'stable_api' for unknown values", () => {
    expect(dataSourceTypeToCapType("bogus")).toBe("stable_api");
    expect(dataSourceTypeToCapType("")).toBe("stable_api");
  });

  // ── PII handling (coordinated with F-B-008 fix in persistence layer) ────

  it("passes processes_personal_data=true through to row", () => {
    const row = normalizeManifestToRow(fullManifest({ processes_personal_data: true }));
    expect(row.processesPersonalData).toBe(true);
  });

  it("passes personal_data_categories through", () => {
    const row = normalizeManifestToRow(
      fullManifest({ processes_personal_data: true, personal_data_categories: ["name", "email"] }),
    );
    expect(row.personalDataCategories).toEqual(["name", "email"]);
  });
});
