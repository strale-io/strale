/**
 * Cluster 2 Phase 2 tests: validateCapability orchestrator.
 *
 * Covers:
 *  - Gate aggregation across gate1_manifest + gate3_schema
 *  - skipGates behavior (per-call escape hatch; replaces SKIP_ONBOARDING_GATES)
 *  - Authority-drift warnings (Phase 2: log-only; Phase 4 hardens)
 *  - Happy path: valid manifest → no violations
 */

import { describe, it, expect } from "vitest";
import {
  validateCapability,
  GateViolationError,
  type ValidationContext,
  type CapabilityRow,
} from "./onboarding-gates.js";
import type { Manifest } from "./capability-manifest-types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function validManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    slug: "test-cap",
    name: "Test Capability",
    description: "A capability used by orchestrator unit tests. Meets minimum description length.",
    category: "validation",
    price_cents: 5,
    is_free_tier: false,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "input query" } },
      required: ["query"],
    },
    output_schema: {
      type: "object",
      properties: { result: { type: "string" } },
    },
    data_source: "Test Source",
    data_source_type: "api",
    transparency_tag: "algorithmic",
    maintenance_class: "pure-computation",
    test_fixtures: {
      known_answer: {
        input: { query: "hello" },
        expected_fields: [{ field: "result", operator: "not_null" }],
      },
    },
    output_field_reliability: { result: "guaranteed" },
    limitations: [{ title: "Limit", text: "Short", category: "coverage", severity: "info" }],
    processes_personal_data: false,
    personal_data_categories: [],
    ...overrides,
  };
}

function baseCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return { mode: "insert", source: "manifest", ...overrides };
}

// ── Happy path ──────────────────────────────────────────────────────────────

describe("validateCapability orchestrator (Cluster 2 Phase 2)", () => {
  it("returns no violations for a valid manifest in insert mode", async () => {
    const result = await validateCapability(validManifest(), null, baseCtx());
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("aggregates violations from gate1_manifest", async () => {
    // missing processes_personal_data -> gate1_manifest violation
    const m = validManifest();
    delete (m as { processes_personal_data?: boolean }).processes_personal_data;
    const result = await validateCapability(m, null, baseCtx());
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.gate === "gate1_manifest")).toBe(true);
  });

  it("aggregates violations from gate3_schema (required ⊆ properties)", async () => {
    // required field not in properties -> gate3_schema violation
    const m = validManifest({
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query", "missing_field"],
      },
    });
    const result = await validateCapability(m, null, baseCtx());
    expect(result.violations.some((v) => v.gate === "gate3_schema_coherence")).toBe(true);
  });

  // ── skipGates semantics (replaces SKIP_ONBOARDING_GATES) ─────────────────

  it("skips gate1_manifest when listed in ctx.skipGates", async () => {
    const m = validManifest();
    delete (m as { processes_personal_data?: boolean }).processes_personal_data;
    const result = await validateCapability(m, null, baseCtx({
      skipGates: [{ gate: "gate1_manifest", reason: "unit test: bypass manifest check" }],
    }));
    // gate1_manifest violation is suppressed; other gates may still fire
    expect(result.violations.some((v) => v.gate === "gate1_manifest")).toBe(false);
  });

  it("skips gate3_schema when listed in ctx.skipGates", async () => {
    const m = validManifest({
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query", "missing_field"],
      },
    });
    const result = await validateCapability(m, null, baseCtx({
      skipGates: [{ gate: "gate3_schema", reason: "unit test" }],
    }));
    expect(result.violations.some((v) => v.gate === "gate3_schema_coherence")).toBe(false);
  });

  // ── Authority drift warnings (mode=backfill only) ────────────────────────

  it("emits authority-drift warning for DB-canonical field mismatch in backfill mode", async () => {
    const existing: CapabilityRow = {
      slug: "test-cap",
      priceCents: 100,
      isFreeTier: false,
      transparencyTag: "algorithmic",
    };
    const manifest = validManifest({ price_cents: 200 }); // drift from existing
    const result = await validateCapability(manifest, existing, baseCtx({ mode: "backfill" }));
    const driftWarnings = result.warnings.filter((w) => w.gate === "authority");
    expect(driftWarnings.length).toBeGreaterThan(0);
    expect(driftWarnings.some((w) => w.detail.includes("price_cents"))).toBe(true);
  });

  it("does NOT emit authority-drift warning in insert mode (no existing row)", async () => {
    const manifest = validManifest({ price_cents: 999 });
    const result = await validateCapability(manifest, null, baseCtx({ mode: "insert" }));
    expect(result.warnings.filter((w) => w.gate === "authority").length).toBe(0);
  });

  it("does NOT emit authority-drift warning when manifest and DB match", async () => {
    const existing: CapabilityRow = {
      slug: "test-cap",
      priceCents: 5, // matches manifest
      isFreeTier: false,
      transparencyTag: "algorithmic",
    };
    const manifest = validManifest({ price_cents: 5 });
    const result = await validateCapability(manifest, existing, baseCtx({ mode: "backfill" }));
    expect(result.warnings.filter((w) => w.gate === "authority").length).toBe(0);
  });

  it("emits authority-drift warning for transparency_tag mismatch", async () => {
    const existing: CapabilityRow = {
      slug: "test-cap",
      priceCents: 5,
      isFreeTier: false,
      transparencyTag: "algorithmic",
    };
    const manifest = validManifest({ transparency_tag: "ai_generated" });
    const result = await validateCapability(manifest, existing, baseCtx({ mode: "backfill" }));
    expect(result.warnings.some((w) => w.gate === "authority" && w.detail.includes("transparency_tag"))).toBe(true);
  });
});

// ── GateViolationError ──────────────────────────────────────────────────────

describe("GateViolationError", () => {
  it("has a descriptive message listing each violation", () => {
    const err = new GateViolationError([
      { gate: "gate1_manifest", severity: "error", detail: "missing field foo" },
      { gate: "gate3_schema_coherence", severity: "error", detail: "bar not in properties" },
    ]);
    expect(err.name).toBe("GateViolationError");
    expect(err.message).toContain("gate1_manifest");
    expect(err.message).toContain("gate3_schema_coherence");
    expect(err.message).toContain("2 violations");
  });

  it("uses singular 'violation' for single-entry errors", () => {
    const err = new GateViolationError([{ gate: "g1", severity: "error", detail: "d" }]);
    expect(err.message).toContain("1 violation");
    expect(err.message).not.toContain("1 violations");
  });
});
