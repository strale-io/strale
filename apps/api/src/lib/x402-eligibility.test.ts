/**
 * WP0 §3.1 — x402 rail eligibility.
 *
 * Discriminating property: the pre-fix `/v1/do` gate was
 * `isActive && !isFreeTier`. Every case below that expects `false` while
 * having `isActive: true, isFreeTier: false` would have returned true under
 * the old predicate, so these fail pre-fix and pass post-fix.
 */

import { describe, it, expect } from "vitest";
import {
  isX402PayableCapability,
  X402_PAYABLE_LIFECYCLE_STATES,
  type X402EligibilityFields,
  isServableCapability,
} from "./x402-eligibility.js";

const payable: X402EligibilityFields = {
  isActive: true,
  isFreeTier: false,
  x402Enabled: true,
  marketplaceEligible: true,
  lifecycleState: "active",
      visible: true,
};

describe("isX402PayableCapability", () => {
  it("accepts a fully eligible capability", () => {
    expect(isX402PayableCapability(payable)).toBe(true);
  });

  it("accepts probation (the /x402 rail serves it)", () => {
    expect(
      isX402PayableCapability({ ...payable, lifecycleState: "probation" }),
    ).toBe(true);
  });

  // The quality floor delists by clearing x402_enabled. This is the exact
  // production state the re-audit found on 30 capabilities: still is_active,
  // still non-free, but delisted from the paid rail.
  it("refuses a quality-floor-delisted capability (x402_enabled = false)", () => {
    expect(isX402PayableCapability({ ...payable, x402Enabled: false })).toBe(
      false,
    );
  });

  it("refuses degraded and suspended lifecycle states", () => {
    for (const state of ["degraded", "suspended", "draft", "quarantined"]) {
      expect(
        isX402PayableCapability({ ...payable, lifecycleState: state }),
      ).toBe(false);
    }
  });

  it("refuses a capability withheld from the marketplace", () => {
    expect(
      isX402PayableCapability({ ...payable, marketplaceEligible: false }),
    ).toBe(false);
  });

  it("refuses inactive capabilities", () => {
    expect(isX402PayableCapability({ ...payable, isActive: false })).toBe(false);
  });

  // Charging for a capability the caller could have had for nothing.
  it("refuses free-tier capabilities", () => {
    expect(isX402PayableCapability({ ...payable, isFreeTier: true })).toBe(
      false,
    );
  });

  it("treats a null isFreeTier as not-free", () => {
    expect(isX402PayableCapability({ ...payable, isFreeTier: null })).toBe(true);
  });

  it("only ever admits the two documented lifecycle states", () => {
    expect([...X402_PAYABLE_LIFECYCLE_STATES]).toEqual(["active", "probation"]);
  });
});

describe("isServableCapability — may this run at all", () => {
  const base = { isActive: true, lifecycleState: "active" };

  it("refuses a capability withdrawn from the catalogue", () => {
    // The quality floor's withdrawal signal. Found missing by
    // scripts/mutation-test.mjs: deleting this branch from the predicate left
    // the whole unit suite green, because the only coverage was an integration
    // test. A rule with no unit test is a rule one refactor from disappearing.
    expect(isServableCapability({ ...base, visible: false })).toBe(false);
  });

  it("allows a published capability", () => {
    expect(isServableCapability({ ...base, visible: true })).toBe(true);
  });

  it("refuses a deactivated capability whatever its visibility", () => {
    expect(isServableCapability({ ...base, isActive: false, visible: true })).toBe(false);
  });

  it("allows probation but refuses the pre-launch and failed states", () => {
    expect(isServableCapability({ ...base, lifecycleState: "probation", visible: true })).toBe(true);
    for (const state of ["validating", "degraded", "deactivated", "draft"]) {
      expect(
        isServableCapability({ ...base, lifecycleState: state, visible: true }),
        `${state} must not be servable`,
      ).toBe(false);
    }
  });
});
