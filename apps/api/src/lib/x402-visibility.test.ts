/**
 * A withdrawn capability may not be sold on the x402 rail.
 *
 * `visible = false` is the platform's primary withdrawal action, and until
 * 2026-09-03 neither x402 predicate knew about it — while `isServableCapability`
 * in the same file carried a comment explaining that omitting it makes a
 * predicate "blind to the platform's own primary delisting action". The rail
 * was safe only by coincidence: the quality floor happens to clear `visible`
 * and `x402_enabled` together.
 *
 * `POST /v1/internal/capabilities/:slug/unpublish` does not. It sets
 * `visible = false` alone, touching neither `x402_enabled` nor
 * `lifecycle_state`, so an unpublished capability that was already on the rail
 * stayed listed in the catalogue AND payable. No row satisfied that
 * combination in production on 2026-09-03, which made this latent rather than
 * live — and it is an execution and billing path, not a disclosure one.
 *
 * Each test below fails if its `visible` check is removed.
 */
import { describe, it, expect } from "vitest";
import {
  isX402PayableCapability,
  isX402RailEligible,
  isServableCapability,
} from "./x402-eligibility.js";

const withdrawn = {
  isActive: true,
  isFreeTier: false,
  x402Enabled: true,
  marketplaceEligible: true,
  visible: false,
  lifecycleState: "active",
};

describe("an unpublished capability is off every rail", () => {
  it("is not payable over x402", () => {
    expect(isX402PayableCapability(withdrawn)).toBe(false);
    expect(isX402PayableCapability({ ...withdrawn, visible: true })).toBe(true);
  });

  it("is not eligible for the x402 rail", () => {
    expect(isX402RailEligible(withdrawn)).toBe(false);
    expect(isX402RailEligible({ ...withdrawn, visible: true })).toBe(true);
  });

  it("is not servable at all — the predicate that always knew", () => {
    expect(isServableCapability(withdrawn)).toBe(false);
  });

  it("the three predicates agree about withdrawal", () => {
    // They may differ on everything else — payability excludes the free tier,
    // servability admits lifecycle states the rail refuses — but a withdrawn
    // capability must be refused by all three, or the strictest rail is
    // whichever one the caller happens to reach.
    for (const state of ["active", "probation", "degraded"]) {
      const cap = { ...withdrawn, lifecycleState: state };
      expect(isX402PayableCapability(cap), state).toBe(false);
      expect(isX402RailEligible(cap), state).toBe(false);
      expect(isServableCapability(cap), state).toBe(false);
    }
  });
});
