import { describe, it, expect } from "vitest";
import { isLyingBreakerRow, LYING_BREAKER_REMEDIATION } from "./invariant-checker.js";

// Phase 3 Harden — Invariant Check #13 regression test. The Phase 2
// incident (memo: docs/research/2026-05-07-dk-phase2-understand.md on
// branch investigation/dk-phase-2-understand) traced the DK breaker false
// recovery to recordTestEvidence firing without a real success. The
// row's distinguishing fingerprint: state=closed + last_success_at set +
// total_successes=0. recordSuccess always increments totalSuccesses;
// recordTestEvidence sets lastSuccessAt without touching totalSuccesses.
// So a row matching the predicate below is necessarily one
// recordTestEvidence touched and recordSuccess never did.

describe("isLyingBreakerRow — Phase 3 Invariant #13", () => {
  it("flags the DK production row shape from Phase 2 session start", () => {
    expect(
      isLyingBreakerRow({
        state: "closed",
        lastSuccessAt: new Date("2026-05-06T13:58:57.803Z"),
        totalSuccesses: 0,
      }),
    ).toBe(true);
  });

  it("does not flag a normal healthy row (closed + total_successes > 0)", () => {
    expect(
      isLyingBreakerRow({
        state: "closed",
        lastSuccessAt: new Date("2026-05-07T09:30:00Z"),
        totalSuccesses: 47,
      }),
    ).toBe(false);
  });

  it("does not flag a never-tested row (closed + last_success_at null + total_successes 0)", () => {
    // A fresh capability with no test runs yet: state defaults to closed,
    // last_success_at is null, total_successes is 0. Not a lying breaker —
    // there's no false-success claim to flag.
    expect(
      isLyingBreakerRow({
        state: "closed",
        lastSuccessAt: null,
        totalSuccesses: 0,
      }),
    ).toBe(false);
  });

  it("does not flag an open or half_open row even if other fields look suspicious", () => {
    expect(
      isLyingBreakerRow({
        state: "open",
        lastSuccessAt: new Date("2026-05-06T13:58:57.803Z"),
        totalSuccesses: 0,
      }),
    ).toBe(false);
    expect(
      isLyingBreakerRow({
        state: "half_open",
        lastSuccessAt: new Date("2026-05-06T13:58:57.803Z"),
        totalSuccesses: 0,
      }),
    ).toBe(false);
  });

  it("does not flag a closed row with at least one real success even if last_success_at is recent", () => {
    expect(
      isLyingBreakerRow({
        state: "closed",
        lastSuccessAt: new Date("2026-05-07T09:30:00Z"),
        totalSuccesses: 1,
      }),
    ).toBe(false);
  });
});

describe("lying_breaker remediation text", () => {
  // The alert's advice used to add a failure (`total_failures + 1`,
  // `last_failure_at = NOW()`) to erase a false success. Block 0118 showed the
  // correct repair nulls only last_success_at; the advice must not regress.
  it("nulls last_success_at and never invents a failure", () => {
    expect(LYING_BREAKER_REMEDIATION).toMatch(/last_success_at = NULL/);
    expect(LYING_BREAKER_REMEDIATION).not.toMatch(/total_failures\s*=/);
    expect(LYING_BREAKER_REMEDIATION).not.toMatch(/last_failure_at\s*=/);
    expect(LYING_BREAKER_REMEDIATION).not.toMatch(/consecutive_failures\s*=/);
  });

  it("scopes the write to the lying shape, not the whole slug", () => {
    expect(LYING_BREAKER_REMEDIATION).toMatch(/total_successes = 0/);
    expect(LYING_BREAKER_REMEDIATION).toMatch(/state = 'closed'/);
  });
});
