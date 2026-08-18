/**
 * Regression tests for the Browserless harness-burn migration planner
 * (2026-08-18, branch `ops/cut-browserless-harness-burn`). See
 * browserless-suite-migration.ts's header for the full design rationale,
 * including the Codex closing-pass review fixes (HIGH-2a, EDGE).
 */

import { describe, it, expect } from "vitest";
import {
  planCapabilityMigration,
  planMigration,
  hasFreshBaseline,
  TARGET_SLUGS,
  type SuiteRow,
} from "./browserless-suite-migration.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const OLD = new Date("2026-03-01T00:00:00.000Z");

function suite(
  id: string,
  capabilitySlug: string,
  testType: string,
  testMode: string | null,
  overrides: Partial<SuiteRow> = {},
): SuiteRow {
  return {
    id,
    capabilitySlug,
    testType,
    testMode,
    active: true,
    hasBaseline: false,
    baselineCapturedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

// A realistic capability shape: the 7 non-piggyback types the 12 target
// capabilities actually have (per the 2026-08-18 prod query), plus piggyback.
// Baselines default to "fresh" (captured now, suite not edited since) so
// tests that don't care about baseline freshness aren't tripped by it.
function fullSuiteSet(slug: string, mode: string | null = "live"): SuiteRow[] {
  const fresh = { hasBaseline: true, baselineCapturedAt: NOW, updatedAt: NOW };
  return [
    suite(`${slug}-dependency_health`, slug, "dependency_health", mode, fresh),
    suite(`${slug}-edge_case`, slug, "edge_case", mode, fresh),
    suite(`${slug}-known_answer`, slug, "known_answer", mode, fresh),
    suite(`${slug}-known_bad`, slug, "known_bad", mode, fresh),
    suite(`${slug}-negative`, slug, "negative", mode, fresh),
    suite(`${slug}-piggyback`, slug, "piggyback", "live"),
    suite(`${slug}-schema_check`, slug, "schema_check", "live"),
  ];
}

describe("hasFreshBaseline", () => {
  it("is false when there is no baseline at all", () => {
    expect(hasFreshBaseline({ hasBaseline: false, baselineCapturedAt: null, updatedAt: null })).toBe(false);
  });

  it("is false when the baseline is undateable", () => {
    expect(hasFreshBaseline({ hasBaseline: true, baselineCapturedAt: null, updatedAt: NOW })).toBe(false);
  });

  it("is false when the suite was edited after the baseline was captured", () => {
    expect(
      hasFreshBaseline({ hasBaseline: true, baselineCapturedAt: OLD, updatedAt: NOW }),
    ).toBe(false);
  });

  it("is true when the baseline is present, dateable, and not edited since", () => {
    expect(
      hasFreshBaseline({ hasBaseline: true, baselineCapturedAt: NOW, updatedAt: NOW }),
    ).toBe(true);
    expect(
      hasFreshBaseline({ hasBaseline: true, baselineCapturedAt: NOW, updatedAt: null }),
    ).toBe(true);
  });
});

describe("planCapabilityMigration", () => {
  it("picks known_answer as the canary and converts the other 4 executor-touching suites to fixture", () => {
    const plans = planCapabilityMigration(fullSuiteSet("screenshot-url"));

    const canary = plans.find((p) => p.testType === "known_answer")!;
    expect(canary.action).toBe("convert_to_canary");
    expect(canary.targetMode).toBe("canary");

    for (const t of ["dependency_health", "edge_case", "known_bad", "negative"]) {
      const p = plans.find((p) => p.testType === t)!;
      expect(p.action).toBe("convert_to_fixture");
      expect(p.targetMode).toBe("fixture");
    }
  });

  it("never touches schema_check", () => {
    const plans = planCapabilityMigration(fullSuiteSet("screenshot-url"));
    const p = plans.find((p) => p.testType === "schema_check")!;
    expect(p.action).toBe("not_targeted");
    expect(p.targetMode).toBeNull();
  });

  it("never touches piggyback", () => {
    const plans = planCapabilityMigration(fullSuiteSet("screenshot-url"));
    const p = plans.find((p) => p.testType === "piggyback")!;
    expect(p.action).toBe("not_targeted");
    expect(p.targetMode).toBeNull();
    expect(p.reason).toMatch(/piggyback/i);
  });

  it("never touches an inactive suite", () => {
    const suites = fullSuiteSet("screenshot-url");
    const idx = suites.findIndex((s) => s.testType === "edge_case");
    suites[idx] = { ...suites[idx], active: false };
    const plans = planCapabilityMigration(suites);
    const p = plans.find((p) => p.testType === "edge_case")!;
    expect(p.action).toBe("not_targeted");
    expect(p.reason).toMatch(/inactive/);
  });

  it("falls back to dependency_health as the canary when known_answer is absent", () => {
    const suites = fullSuiteSet("swiss-company-data").filter((s) => s.testType !== "known_answer");
    const plans = planCapabilityMigration(suites);
    const canary = plans.find((p) => p.testType === "dependency_health")!;
    expect(canary.action).toBe("convert_to_canary");
    // The other executor-touching types still convert to fixture.
    for (const t of ["edge_case", "known_bad", "negative"]) {
      const p = plans.find((p) => p.testType === t)!;
      expect(p.action).toBe("convert_to_fixture");
    }
  });

  it("is idempotent — a second pass over already-migrated suites reports unchanged, not repeat conversions", () => {
    const suites = fullSuiteSet("screenshot-url");
    // Simulate: known_answer already 'canary', the rest already 'fixture'.
    const migrated = suites.map((s) =>
      s.testType === "known_answer"
        ? { ...s, testMode: "canary" }
        : s.testType === "piggyback" || s.testType === "schema_check"
          ? s
          : { ...s, testMode: "fixture" },
    );
    const plans = planCapabilityMigration(migrated);
    for (const t of ["dependency_health", "edge_case", "known_bad", "negative"]) {
      const p = plans.find((p) => p.testType === t)!;
      expect(p.action).toBe("unchanged");
      expect(p.targetMode).toBe("fixture");
    }
    const canary = plans.find((p) => p.testType === "known_answer")!;
    expect(canary.action).toBe("unchanged");
    expect(canary.targetMode).toBe("canary");
  });

  it("treats a null test_mode as 'live' (schema default) and still converts it", () => {
    const suites = fullSuiteSet("screenshot-url", null);
    const plans = planCapabilityMigration(suites);
    const p = plans.find((p) => p.testType === "edge_case")!;
    expect(p.action).toBe("convert_to_fixture");
  });

  it("picks exactly one canary even with duplicate known_answer suites (defensive — no observed duplicates in the 12, but scheduler code elsewhere handles per-suite duplicates)", () => {
    const suites = [
      ...fullSuiteSet("danish-like-dup"),
      suite("danish-like-dup-known_answer-2", "danish-like-dup", "known_answer", "live"),
    ];
    const plans = planCapabilityMigration(suites);
    const canaries = plans.filter((p) => p.action === "convert_to_canary");
    expect(canaries.length).toBe(1);
  });

  describe("HIGH-2a — bumpUpdatedAt only when the baseline actually needs one", () => {
    it("does NOT bump updated_at when converting a suite whose baseline is already fresh", () => {
      const suites = fullSuiteSet("screenshot-url"); // fullSuiteSet's default baselines are fresh
      const plans = planCapabilityMigration(suites);
      for (const t of ["dependency_health", "edge_case", "known_bad", "negative"]) {
        const p = plans.find((p) => p.testType === t)!;
        expect(p.action).toBe("convert_to_fixture");
        expect(p.bumpUpdatedAt).toBe(false);
      }
    });

    it("DOES bump updated_at when the baseline is missing", () => {
      const suites = fullSuiteSet("screenshot-url").map((s) =>
        s.testType === "edge_case" ? { ...s, hasBaseline: false, baselineCapturedAt: null } : s,
      );
      const plans = planCapabilityMigration(suites);
      const p = plans.find((p) => p.testType === "edge_case")!;
      expect(p.action).toBe("convert_to_fixture");
      expect(p.bumpUpdatedAt).toBe(true);
    });

    it("DOES bump updated_at when the baseline is already edit-stale", () => {
      const suites = fullSuiteSet("screenshot-url").map((s) =>
        s.testType === "known_bad" ? { ...s, baselineCapturedAt: OLD, updatedAt: NOW } : s,
      );
      const plans = planCapabilityMigration(suites);
      const p = plans.find((p) => p.testType === "known_bad")!;
      expect(p.action).toBe("convert_to_fixture");
      expect(p.bumpUpdatedAt).toBe(true);
    });
  });

  describe("EDGE — no live candidate leaves the capability with zero live suites", () => {
    it("refuses the whole capability when neither known_answer nor dependency_health is active", () => {
      const suites = fullSuiteSet("no-canary-cap").filter(
        (s) => s.testType !== "known_answer" && s.testType !== "dependency_health",
      );
      const plans = planCapabilityMigration(suites);
      for (const t of ["edge_case", "known_bad", "negative"]) {
        const p = plans.find((p) => p.testType === t)!;
        expect(p.action).toBe("refused_no_live_candidate");
        expect(p.targetMode).toBeNull();
        expect(p.reason).toMatch(/zero live suites/i);
      }
      // Nothing for this capability gets a canary or a fixture conversion.
      expect(plans.some((p) => p.action === "convert_to_canary")).toBe(false);
      expect(plans.some((p) => p.action === "convert_to_fixture")).toBe(false);
    });

    it("refuses even when known_answer/dependency_health rows exist but are inactive", () => {
      const suites = fullSuiteSet("inactive-canary-cap").map((s) =>
        s.testType === "known_answer" || s.testType === "dependency_health"
          ? { ...s, active: false }
          : s,
      );
      const plans = planCapabilityMigration(suites);
      const edgeCase = plans.find((p) => p.testType === "edge_case")!;
      expect(edgeCase.action).toBe("refused_no_live_candidate");
    });

    it("does NOT refuse a capability whose only suites are schema_check/piggyback (nothing to convert anyway)", () => {
      const suites = [
        suite("schema-only-cap-schema_check", "schema-only-cap", "schema_check", "live"),
        suite("schema-only-cap-piggyback", "schema-only-cap", "piggyback", "live"),
      ];
      const plans = planCapabilityMigration(suites);
      expect(plans.every((p) => p.action === "not_targeted")).toBe(true);
      expect(plans.some((p) => p.action === "refused_no_live_candidate")).toBe(false);
    });

    it("none of the 12 target capabilities hit this in practice (documents the guard is currently inert, not currently firing)", () => {
      // Every one of the 12 has an active known_answer suite per the
      // 2026-08-18 prod query — this test exists so a future suite
      // deactivation that WOULD trip the guard is caught by the other EDGE
      // tests above, not silently passed over here.
      const plans = planCapabilityMigration(fullSuiteSet("screenshot-url"));
      expect(plans.some((p) => p.action === "refused_no_live_candidate")).toBe(false);
    });
  });
});

describe("planMigration (multi-capability)", () => {
  it("groups suites by capabilitySlug and plans each independently", () => {
    const all = [
      ...fullSuiteSet("screenshot-url"),
      ...fullSuiteSet("html-to-pdf"),
    ];
    const plans = planMigration(all);
    const bySlug = new Set(plans.map((p) => p.capabilitySlug));
    expect(bySlug).toEqual(new Set(["screenshot-url", "html-to-pdf"]));

    const screenshotCanaries = plans.filter(
      (p) => p.capabilitySlug === "screenshot-url" && p.action === "convert_to_canary",
    );
    expect(screenshotCanaries.length).toBe(1);
    const pdfCanaries = plans.filter(
      (p) => p.capabilitySlug === "html-to-pdf" && p.action === "convert_to_canary",
    );
    expect(pdfCanaries.length).toBe(1);
  });

  it("never lets one capability's plan leak a canary pick into another capability's suites", () => {
    const all = [...fullSuiteSet("a-cap"), ...fullSuiteSet("b-cap")];
    const plans = planMigration(all);
    for (const p of plans) {
      if (p.action === "convert_to_canary") {
        // Canary suite's own testType must be known_answer (both fixtures have one).
        expect(p.testType).toBe("known_answer");
      }
    }
  });

  it("a refused capability doesn't affect a sibling capability's normal conversion", () => {
    const refused = fullSuiteSet("refused-cap").filter(
      (s) => s.testType !== "known_answer" && s.testType !== "dependency_health",
    );
    const normal = fullSuiteSet("normal-cap");
    const plans = planMigration([...refused, ...normal]);

    const refusedPlans = plans.filter((p) => p.capabilitySlug === "refused-cap");
    expect(refusedPlans.every((p) => p.action === "refused_no_live_candidate" || p.action === "not_targeted")).toBe(true);

    const normalPlans = plans.filter((p) => p.capabilitySlug === "normal-cap");
    expect(normalPlans.some((p) => p.action === "convert_to_canary")).toBe(true);
    expect(normalPlans.some((p) => p.action === "convert_to_fixture")).toBe(true);
  });
});

describe("TARGET_SLUGS", () => {
  it("is exactly the 12 capabilities named in the 2026-08-18 finding", () => {
    expect(TARGET_SLUGS.length).toBe(12);
    expect(new Set(TARGET_SLUGS).size).toBe(12); // no accidental duplicates
    expect(TARGET_SLUGS).toContain("screenshot-url");
    expect(TARGET_SLUGS).toContain("irish-company-data");
  });
});
