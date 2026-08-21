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
describe("what counts as WITHHELD (the post-deploy correction)", () => {
  const base = { isActive: true, lifecycleState: "active" };

  it("a floor quarantine is withheld — both flags off", () => {
    // jobs/quality-floor.ts sets {visible:false, x402Enabled:false}.
    expect(
      isServableCapability({ ...base, visible: false, x402Enabled: false }),
    ).toBe(false);
  });

  it("merely hidden from the catalogue is NOT withheld", () => {
    // The regression this test exists to prevent. danish-company-data is
    // invisible but x402-enabled, marketplace-eligible, lifecycle active, with
    // zero health-monitor events — never withdrawn. Reading `visible` alone
    // made it unservable and broke four live DK solutions, which skipped their
    // Danish registry lookup and billed nothing.
    expect(
      isServableCapability({ ...base, visible: false, x402Enabled: true }),
    ).toBe(true);
  });

  it("a published capability is servable whether or not it is on the x402 rail", () => {
    // Most capabilities are wallet-only. Requiring x402Enabled would have
    // withheld the majority of the catalogue.
    expect(
      isServableCapability({ ...base, visible: true, x402Enabled: false }),
    ).toBe(true);
    expect(
      isServableCapability({ ...base, visible: true, x402Enabled: true }),
    ).toBe(true);
  });

  it("still refuses a deactivated or non-servable lifecycle regardless of flags", () => {
    expect(
      isServableCapability({ ...base, isActive: false, visible: true, x402Enabled: true }),
    ).toBe(false);
    expect(
      isServableCapability({ ...base, lifecycleState: "validating", visible: true, x402Enabled: true }),
    ).toBe(false);
  });
});
