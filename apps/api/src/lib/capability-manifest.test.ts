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

  it("partial mode: omits fields that are undefined (backfill doesn't clobber with nulls)", () => {
    // Phase 4a update: price_cents is now db-canonical and gets stripped
    // regardless of whether the manifest declared it. Testing here that
    // undefined fields ARE stripped and manifest-canonical fields survive.
    const m = fullManifest();
    delete m.maintenance_class;
    delete m.is_free_tier;
    delete m.transparency_tag;
    const row = normalizeManifestToRow(m, { partial: true });
    expect(Object.prototype.hasOwnProperty.call(row, "maintenanceClass")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "isFreeTier")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "transparencyTag")).toBe(false);
    // slug is manifest-canonical → still present
    expect(row.slug).toBe("test-cap");
    // Phase 4a: price_cents is db-canonical → stripped in partial mode
    expect(Object.prototype.hasOwnProperty.call(row, "priceCents")).toBe(false);
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

// ─── Phase 4a: FIELD_CATEGORIES enforcement ─────────────────────────────────

describe("Phase 4a authority enforcement in partial mode", () => {
  it("partial mode: ignores FIELD_CATEGORIES when not partial (create mode passes everything)", () => {
    // Create mode writes everything including db-canonical fields as seeds
    const row = normalizeManifestToRow(fullManifest());
    expect(row.priceCents).toBe(5);
    expect(row.isFreeTier).toBe(false);
    expect(row.transparencyTag).toBe("algorithmic");
  });

  it("partial mode: db-canonical price_cents is STRIPPED (Gate 2 footgun regression)", () => {
    // This is the regression gate for Phase 3 Gate 2: manifest price_cents
    // must not overwrite an operator-tuned DB value.
    const m = fullManifest({ price_cents: 10 });
    const existingRow = { priceCents: 5, name: "Test Capability" };
    const row = normalizeManifestToRow(m, { partial: true, existingRow });
    expect(Object.prototype.hasOwnProperty.call(row, "priceCents")).toBe(false);
  });

  it("partial mode: manifest-canonical slug/name passes through when DB matches", () => {
    const m = fullManifest();
    const existingRow = { slug: "test-cap", name: "Test Capability" };
    const row = normalizeManifestToRow(m, { partial: true, existingRow });
    expect(row.slug).toBe("test-cap");
    expect(row.name).toBe("Test Capability");
  });

  it("partial mode: manifest-canonical name drift THROWS AuthorityViolationError", () => {
    const m = fullManifest({ name: "Manifest Name" });
    const existingRow = { slug: "test-cap", name: "DB Drifted Name" };
    expect(() => normalizeManifestToRow(m, { partial: true, existingRow }))
      .toThrow(/Authority violation/);
    expect(() => normalizeManifestToRow(m, { partial: true, existingRow }))
      .toThrow(/\[name\]/);
  });

  it("partial mode: hybrid freshness_category with DB null → kept (fills gap)", () => {
    const m = fullManifest({ freshness_category: "live-fetch" });
    const existingRow = { slug: "test-cap", freshnessCategory: null };
    const row = normalizeManifestToRow(m, { partial: true, existingRow });
    expect(row.freshnessCategory).toBe("live-fetch");
  });

  it("partial mode: hybrid freshness_category with DB set → stripped (preserve operator)", () => {
    const m = fullManifest({ freshness_category: "live-fetch" });
    const existingRow = { slug: "test-cap", freshnessCategory: "reference-data" };
    const row = normalizeManifestToRow(m, { partial: true, existingRow });
    expect(Object.prototype.hasOwnProperty.call(row, "freshnessCategory")).toBe(false);
  });

  it("partial mode: hybrid geography with DB null → kept", () => {
    const m = fullManifest({ geography: "nordic" });
    const existingRow = { slug: "test-cap", geography: null };
    const row = normalizeManifestToRow(m, { partial: true, existingRow });
    expect(row.geography).toBe("nordic");
  });

  it("partial mode: hybrid geography with DB set → stripped", () => {
    const m = fullManifest({ geography: "nordic" });
    const existingRow = { slug: "test-cap", geography: "global" };
    const row = normalizeManifestToRow(m, { partial: true, existingRow });
    expect(Object.prototype.hasOwnProperty.call(row, "geography")).toBe(false);
  });

  it("partial mode: --force-override-authority keeps db fields (operator reset-to-manifest)", () => {
    const m = fullManifest({ price_cents: 10 });
    const existingRow = { priceCents: 5, name: "Test Capability" };
    const row = normalizeManifestToRow(m, {
      partial: true,
      existingRow,
      bypassAuthority: true,
    });
    expect(row.priceCents).toBe(10);
  });

  it("partial mode: --force-override-authority does NOT bypass manifest-canonical drift", () => {
    const m = fullManifest({ name: "Manifest Name" });
    const existingRow = { slug: "test-cap", name: "DB Drifted Name" };
    expect(() => normalizeManifestToRow(m, {
      partial: true,
      existingRow,
      bypassAuthority: true,
    })).toThrow(/Authority violation/);
  });
});
