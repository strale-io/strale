/**
 * A solution switched off for a stated reason must survive the seeding sweep.
 *
 * `seed()` ends with a qualification pass: if every step's capability currently
 * passes its tests, an inactive solution is switched back ON. That branch used
 * to check nothing else, so it revived a solution regardless of WHY it had been
 * turned off — and a passing test says nothing about whether we are licensed to
 * sell the result.
 *
 * Observed 2026-09-06: `web3-pre-trade` was deactivated three times, because its
 * `crypto-price` step rests on CoinGecko's free Demo plan which excludes
 * commercial use, and three times it came back within minutes with
 * `x402_enabled` and the deactivation reason still intact — the fingerprint of a
 * writer setting `is_active` alone.
 *
 * `vendor-control-tower.ts` already had the convention this branch was missing:
 * only touch a solution whose `deactivation_reason` is NULL or starts with
 * `vendor:`; anything else is deliberate and is left alone.
 *
 * This imports the real predicate rather than restating it. An earlier draft
 * kept a local copy, which meant deleting the guard from the call site left the
 * suite green — a hollow test of exactly the kind LESSONS.md tracks as F5.
 */
import { describe, expect, it } from "vitest";
import { wasDeactivatedDeliberately } from "./seed-solutions.js";

describe("seed-solutions reactivation guard", () => {
  it("holds off a solution deactivated for a licensing reason", () => {
    expect(wasDeactivatedDeliberately(
      "requires crypto-price, deactivated 2026-09-06: CoinGecko's free Demo plan excludes commercial use.",
    )).toBe(true);
  });

  it("holds off any other stated reason", () => {
    expect(wasDeactivatedDeliberately("withdrawn pending a rewrite")).toBe(true);
    expect(wasDeactivatedDeliberately("founder decision 2026-09-06")).toBe(true);
  });

  // vendor: markers belong to the control tower, which runs its own restore
  // cycle. The sweep must not start second-guessing those.
  it("does not hold off a vendor suspension, which has its own restore path", () => {
    expect(wasDeactivatedDeliberately("vendor:openregister")).toBe(false);
    expect(wasDeactivatedDeliberately("vendor:browserless degraded")).toBe(false);
  });

  // The ordinary case: nothing was ever recorded, so the sweep may activate.
  it("does not hold off a solution with no reason recorded", () => {
    expect(wasDeactivatedDeliberately(null)).toBe(false);
    expect(wasDeactivatedDeliberately(undefined)).toBe(false);
    expect(wasDeactivatedDeliberately("")).toBe(false);
    expect(wasDeactivatedDeliberately("   ")).toBe(false);
  });

  it("treats a non-string reason as no reason", () => {
    expect(wasDeactivatedDeliberately(0)).toBe(false);
    expect(wasDeactivatedDeliberately({})).toBe(false);
  });
});
