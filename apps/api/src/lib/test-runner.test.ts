import { describe, it, expect } from "vitest";
import { shouldRecordTestEvidence } from "./test-runner.js";

// Phase 3 Harden Fix A regression tests. The Phase 2 incident
// (memo: docs/research/2026-05-07-dk-phase2-understand.md on branch
// investigation/dk-phase-2-understand) traced a false breaker recovery
// to an edge_case test "passing" via a thrown CVR quota error. The gate
// now requires known_answer + executionError===null.

describe("shouldRecordTestEvidence — Phase 3 Fix A", () => {
  it("returns true for known_answer that genuinely passed with no execution error", () => {
    expect(shouldRecordTestEvidence(true, "known_answer", null)).toBe(true);
  });

  it("returns false for edge_case even when validateResult marked passed=true", () => {
    // The DK incident: edge_case "CVR with leading zeros" threw the CVR
    // quota error, validateResult returned passed=true (any error is
    // edge_case-acceptable), the old gate fired recordTestEvidence, and the
    // breaker walked open → half_open → closed via test-runner false signal.
    expect(shouldRecordTestEvidence(true, "edge_case", null)).toBe(false);
    expect(
      shouldRecordTestEvidence(
        true,
        "edge_case",
        "The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.",
      ),
    ).toBe(false);
  });

  it("returns false for known_answer when execution threw — defensive guard against future validateResult quirks", () => {
    expect(
      shouldRecordTestEvidence(true, "known_answer", "any thrown error string"),
    ).toBe(false);
  });

  it("returns false for known_answer that did not pass", () => {
    expect(shouldRecordTestEvidence(false, "known_answer", null)).toBe(false);
    expect(shouldRecordTestEvidence(false, "known_answer", "some error")).toBe(false);
  });

  it("returns false for non-known_answer test types regardless of pass state", () => {
    for (const testType of [
      "schema_check",
      "negative",
      "dependency_health",
      "regression",
      "known_bad",
      "piggyback",
    ]) {
      expect(shouldRecordTestEvidence(true, testType, null)).toBe(false);
      expect(shouldRecordTestEvidence(false, testType, null)).toBe(false);
    }
  });
});
