/**
 * Regression tests for the Browserless harness-burn migration planner
 * (2026-08-18, branch `ops/cut-browserless-harness-burn`). See
 * browserless-suite-migration.ts's header for the full design rationale.
 */

import { describe, it, expect } from "vitest";
import {
  planCapabilityMigration,
  planMigration,
  TARGET_SLUGS,
  type SuiteRow,
} from "./browserless-suite-migration.js";

function suite(
  id: string,
  capabilitySlug: string,
  testType: string,
  testMode: string | null,
  active = true,
): SuiteRow {
  return { id, capabilitySlug, testType, testMode, active };
}

// A realistic capability shape: the 7 non-piggyback types the 12 target
// capabilities actually have (per the 2026-08-18 prod query), plus piggyback.
function fullSuiteSet(slug: string, mode: string | null = "live"): SuiteRow[] {
  return [
    suite(`${slug}-dependency_health`, slug, "dependency_health", mode),
    suite(`${slug}-edge_case`, slug, "edge_case", mode),
    suite(`${slug}-known_answer`, slug, "known_answer", mode),
    suite(`${slug}-known_bad`, slug, "known_bad", mode),
    suite(`${slug}-negative`, slug, "negative", mode),
    suite(`${slug}-piggyback`, slug, "piggyback", "live"),
    suite(`${slug}-schema_check`, slug, "schema_check", "live"),
  ];
}

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
});

describe("TARGET_SLUGS", () => {
  it("is exactly the 12 capabilities named in the 2026-08-18 finding", () => {
    expect(TARGET_SLUGS.length).toBe(12);
    expect(new Set(TARGET_SLUGS).size).toBe(12); // no accidental duplicates
    expect(TARGET_SLUGS).toContain("screenshot-url");
    expect(TARGET_SLUGS).toContain("irish-company-data");
  });
});
