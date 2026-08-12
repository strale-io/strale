import { describe, expect, it } from "vitest";
import { isSuccessfulStepOutput } from "./solution-executor.js";

// Money-integrity regression (2026-08-12, DEC-20260504-A both directions):
// the wallet path billed `step_count - errors.length`, counting SKIPPED and
// UNAVAILABLE steps as successes — a solution whose step 1 failed (starving
// every downstream step's inputs) charged full price for ZERO executed
// checks. This predicate is now the billing boundary on BOTH rails; these
// tests fail against the pre-fix accounting (skipped/unavailable counted as
// success there) and pass against the fix.

describe("isSuccessfulStepOutput (the billing boundary)", () => {
  it("real output counts", () => {
    expect(isSuccessfulStepOutput({ company_name: "LEGO A/S", status: "active" })).toBe(true);
    expect(isSuccessfulStepOutput({})).toBe(true); // empty-but-real output object
  });

  it("errors do NOT count", () => {
    expect(isSuccessfulStepOutput({ error: "HTTP 503 from registry" })).toBe(false);
  });

  it("input-starved skips do NOT count — the charge-for-nothing case", () => {
    expect(isSuccessfulStepOutput({ skipped: true, reason: "All required inputs were not provided" })).toBe(false);
  });

  it("unavailable (deactivated) steps do NOT count and are no longer invisible", () => {
    expect(isSuccessfulStepOutput({ unavailable: true, reason: "capability unavailable" })).toBe(false);
  });

  it("non-objects do not count", () => {
    expect(isSuccessfulStepOutput(null)).toBe(false);
    expect(isSuccessfulStepOutput(undefined)).toBe(false);
    expect(isSuccessfulStepOutput("string")).toBe(false);
  });

  it("the all-steps-starved scenario bills nothing: no value in the set is a success", () => {
    // Exactly the contained-solutions shape: step 1 errors, steps 2..n skip.
    const steps = {
      "danish-company-data": { error: "cvrapi.dk quota exhausted" },
      "vat-validate": { skipped: true, reason: "All required inputs were not provided" },
      "sanctions-check": { skipped: true, reason: "All required inputs were not provided" },
    };
    expect(Object.values(steps).some(isSuccessfulStepOutput)).toBe(false);
  });
});
