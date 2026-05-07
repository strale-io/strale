import { describe, it, expect } from "vitest";
import {
  shouldRecordTestEvidence,
  shouldRecordFailureFromTest,
} from "./test-runner.js";

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

// Phase 3 Harden Fix B regression tests. The Phase 2 incident also revealed
// a missing wire: test-runner failure path wrote to health_monitor_events
// only, never to capability_health. The new gate fires recordFailure for
// upstream-side or uncategorized failures on probe-style tests.

describe("shouldRecordFailureFromTest — Phase 3 Fix B", () => {
  it("fires for known_answer + upstream_transient failure", () => {
    expect(shouldRecordFailureFromTest(false, "known_answer", "upstream_transient")).toBe(true);
  });

  it("fires for known_answer + unknown failure (the DK CVR quota shape)", () => {
    // This is exactly the DK incident shape: classifier returned 'unknown'
    // because /quota.?exceeded/i didn't match 'quota has been temporarily
    // exceeded'. The gate must still fire so the breaker tracks the failure.
    expect(shouldRecordFailureFromTest(false, "known_answer", "unknown")).toBe(true);
  });

  it("fires for dependency_health + upstream_transient failure", () => {
    expect(shouldRecordFailureFromTest(false, "dependency_health", "upstream_transient")).toBe(true);
  });

  it("fires for dependency_health + unknown failure", () => {
    expect(shouldRecordFailureFromTest(false, "dependency_health", "unknown")).toBe(true);
  });

  it("suppresses capability_bug — Strale-side issue, not upstream", () => {
    expect(shouldRecordFailureFromTest(false, "known_answer", "capability_bug")).toBe(false);
    expect(shouldRecordFailureFromTest(false, "dependency_health", "capability_bug")).toBe(false);
  });

  it("suppresses test_design — test never passed, not upstream", () => {
    expect(shouldRecordFailureFromTest(false, "known_answer", "test_design")).toBe(false);
    expect(shouldRecordFailureFromTest(false, "dependency_health", "test_design")).toBe(false);
  });

  it("suppresses test_infrastructure — operator-level (env vars, billing, geo)", () => {
    expect(shouldRecordFailureFromTest(false, "known_answer", "test_infrastructure")).toBe(false);
  });

  it("suppresses stale_input — test data is expired, not upstream-broken", () => {
    expect(shouldRecordFailureFromTest(false, "known_answer", "stale_input")).toBe(false);
  });

  it("suppresses upstream_changed and upstream_degraded — long-term drift, not breaker territory", () => {
    expect(shouldRecordFailureFromTest(false, "known_answer", "upstream_changed")).toBe(false);
    expect(shouldRecordFailureFromTest(false, "known_answer", "upstream_degraded")).toBe(false);
  });

  it("does not fire on non-probe test types even with upstream_transient verdict", () => {
    for (const testType of ["negative", "edge_case", "schema_check", "regression", "known_bad", "piggyback"]) {
      expect(shouldRecordFailureFromTest(false, testType, "upstream_transient")).toBe(false);
      expect(shouldRecordFailureFromTest(false, testType, "unknown")).toBe(false);
    }
  });

  it("does not fire when test passed", () => {
    expect(shouldRecordFailureFromTest(true, "known_answer", "upstream_transient")).toBe(false);
    expect(shouldRecordFailureFromTest(true, "known_answer", "unknown")).toBe(false);
    expect(shouldRecordFailureFromTest(true, "dependency_health", "upstream_transient")).toBe(false);
  });
});

// Strategy (b) self-throttle structural test — exercises the Set-membership
// check that bounds recordFailure to one invocation per slug per runTests.
// The Set lives in runTests; runSingleTest checks it before firing. This
// captures the structural shape of the throttle without requiring a full
// integration harness for the test-runner cron path (Audit-Follow-up Test
// Coverage Protocol carve-out: harness-not-yet-built — the production
// scheduler exercises the full path on every cron tick).

describe("Phase 3 Fix B — recordFailure throttle structural shape", () => {
  it("Set-membership pattern: first failure adds to Set, subsequent failures skip", () => {
    const fired = new Set<string>();
    const slug = "danish-company-data";

    // First call shape: helper says fire AND slug not in Set → would invoke
    const firstCallWouldFire =
      shouldRecordFailureFromTest(false, "known_answer", "unknown") && !fired.has(slug);
    expect(firstCallWouldFire).toBe(true);
    fired.add(slug);

    // Second call shape (same slug, same runTests invocation) → suppressed
    const secondCallWouldFire =
      shouldRecordFailureFromTest(false, "known_answer", "unknown") && !fired.has(slug);
    expect(secondCallWouldFire).toBe(false);

    // Third, fourth, fifth — all suppressed regardless of test type / verdict
    for (let i = 0; i < 5; i++) {
      const wouldFire =
        shouldRecordFailureFromTest(false, "known_answer", "upstream_transient") && !fired.has(slug);
      expect(wouldFire).toBe(false);
    }

    // Different slug in same Set → fires independently
    const otherSlug = "polish-company-data";
    const otherWouldFire =
      shouldRecordFailureFromTest(false, "known_answer", "unknown") && !fired.has(otherSlug);
    expect(otherWouldFire).toBe(true);
  });
});
