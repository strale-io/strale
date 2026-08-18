/**
 * Regression tests for /recalibrate's exhausted-recapture exclusion
 * (Codex closing-pass review, round 3, 2026-08-18).
 */
import { describe, it, expect } from "vitest";
import { isExhaustedRecapture, selectRecalibrationBestSuite, type RecalSuiteLike } from "./recalibration-eligibility.js";

function suite(overrides: Partial<RecalSuiteLike> & { id: string; testType: string }): RecalSuiteLike {
  return {
    testMode: "live",
    testStatus: "normal",
    quarantineReason: null,
    ...overrides,
  };
}

const EXHAUSTED_REASON = "fixture_recapture_exhausted: 3 consecutive failed live recapture attempts — needs human.";

describe("isExhaustedRecapture", () => {
  it("is true only for a fixture-mode suite quarantined with the exhausted-recapture marker", () => {
    expect(
      isExhaustedRecapture(
        suite({ id: "1", testType: "known_bad", testMode: "fixture", testStatus: "quarantined", quarantineReason: EXHAUSTED_REASON }),
      ),
    ).toBe(true);
  });

  it("is false for a suite quarantined for an UNRELATED reason — recalibration should still touch it", () => {
    expect(
      isExhaustedRecapture(
        suite({
          id: "1",
          testType: "known_answer",
          testMode: "fixture",
          testStatus: "quarantined",
          quarantineReason: "upstream API deprecated, needs manual review",
        }),
      ),
    ).toBe(false);
  });

  it("is false for a quarantined suite that isn't fixture-mode", () => {
    expect(
      isExhaustedRecapture(
        suite({ id: "1", testType: "known_answer", testMode: "canary", testStatus: "quarantined", quarantineReason: EXHAUSTED_REASON }),
      ),
    ).toBe(false);
  });

  it("is false for a fixture-mode suite that isn't quarantined", () => {
    expect(
      isExhaustedRecapture(suite({ id: "1", testType: "known_answer", testMode: "fixture", testStatus: "normal" })),
    ).toBe(false);
  });

  it("is false when quarantine_reason is null even if testStatus says quarantined (defensive — shouldn't happen in practice)", () => {
    expect(
      isExhaustedRecapture(
        suite({ id: "1", testType: "known_answer", testMode: "fixture", testStatus: "quarantined", quarantineReason: null }),
      ),
    ).toBe(false);
  });
});

describe("selectRecalibrationBestSuite", () => {
  it("prefers known_answer/schema_check/dependency_health over other types, all else equal", () => {
    const suites = [
      suite({ id: "1", testType: "negative" }),
      suite({ id: "2", testType: "known_answer" }),
      suite({ id: "3", testType: "edge_case" }),
    ];
    expect(selectRecalibrationBestSuite(suites)?.id).toBe("2");
  });

  it("excludes an exhausted-recapture suite from the preferred candidate pool", () => {
    const suites = [
      suite({ id: "1", testType: "known_answer", testMode: "fixture", testStatus: "quarantined", quarantineReason: EXHAUSTED_REASON }),
      suite({ id: "2", testType: "dependency_health" }),
    ];
    expect(selectRecalibrationBestSuite(suites)?.id).toBe("2");
  });

  it("excludes an exhausted-recapture suite from the fallback too — falls through to a non-preferred but eligible suite", () => {
    const suites = [
      suite({ id: "1", testType: "known_answer", testMode: "fixture", testStatus: "quarantined", quarantineReason: EXHAUSTED_REASON }),
      suite({ id: "2", testType: "negative" }), // not in the preferred list, but eligible
    ];
    expect(selectRecalibrationBestSuite(suites)?.id).toBe("2");
  });

  it("returns undefined when EVERY suite for the slug is exhausted-recapture — never falls back to a quarantined suite", () => {
    const suites = [
      suite({ id: "1", testType: "known_answer", testMode: "fixture", testStatus: "quarantined", quarantineReason: EXHAUSTED_REASON }),
      suite({ id: "2", testType: "negative", testMode: "fixture", testStatus: "quarantined", quarantineReason: EXHAUSTED_REASON }),
    ];
    expect(selectRecalibrationBestSuite(suites)).toBeUndefined();
  });

  it("a suite quarantined for an unrelated reason remains eligible and selectable", () => {
    const suites = [
      suite({
        id: "1",
        testType: "known_answer",
        testMode: "fixture",
        testStatus: "quarantined",
        quarantineReason: "upstream API deprecated",
      }),
    ];
    expect(selectRecalibrationBestSuite(suites)?.id).toBe("1");
  });

  it("empty suite list returns undefined", () => {
    expect(selectRecalibrationBestSuite([])).toBeUndefined();
  });
});
