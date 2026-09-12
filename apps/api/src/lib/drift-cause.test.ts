import { describe, expect, it } from "vitest";
import { classifyDriftCause } from "./drift-cause.js";

describe("classifyDriftCause", () => {
  it("classifies an ALLOW_MATRIX context refusal as policy_refusal", () => {
    const s =
      "Execution error: Capability 'translate' (cost_class=paid_prepaid) refuses invocation from " +
      "context kind 'internal_test'. ALLOW_MATRIX governs this; bypass would burn vendor credits.";
    expect(classifyDriftCause(s)).toBe("policy_refusal");
  });

  it("classifies a daily test budget exhaustion as quota_refusal", () => {
    const s =
      "Execution error: Capability 'danish-company-data' has exhausted its daily test budget " +
      "(free_quota, quota_cap=20). Customer traffic is unaffected.";
    expect(classifyDriftCause(s)).toBe("quota_refusal");
  });

  it("classifies a vendor 429 quota message as quota_refusal", () => {
    const s = "OpenMercantil free-tier daily quota (200 requests) exhausted — retry after the daily reset.";
    expect(classifyDriftCause(s)).toBe("quota_refusal");
  });

  it("classifies a low-confidence name-match refusal as ambiguous_match", () => {
    const s =
      'Execution error: No confident Spanish registry match for "Telefonica" (closest: TELEFONICA ' +
      "MOVILES ESPAÑA SA). Provide the CIF/NIF for an exact lookup.";
    expect(classifyDriftCause(s)).toBe("ambiguous_match");
  });

  it("classifies a registry not-found message as stale_identifier", () => {
    const s =
      'Execution error: No Canadian federal corporation found for "2408951". Provide a federal ' +
      "corporation number or a 9-digit business number.";
    expect(classifyDriftCause(s)).toBe("stale_identifier");
  });

  it("falls back to other for a message matching none of the known shapes", () => {
    expect(classifyDriftCause("Execution error: upstream returned HTTP 503.")).toBe("other");
  });

  it("falls back to other for null or undefined, never throws", () => {
    expect(classifyDriftCause(null)).toBe("other");
    expect(classifyDriftCause(undefined)).toBe("other");
  });

  // Proved by planting: with the policy_refusal pattern temporarily removed
  // (simulated here by testing the ordering, not the regex itself), a
  // policy_refusal message that also happens to contain "No X found" text
  // must still classify as policy_refusal, not stale_identifier, because
  // the policy check runs first. This is the actual production shape:
  // ALLOW_MATRIX messages never contain "No ... found" text themselves, but
  // the ordering is a real dependency, not just organization, so it is
  // pinned as its own case.
  it("prefers policy_refusal over stale_identifier when a message could match both shapes", () => {
    const s =
      "Capability 'x' (cost_class=paid_prepaid) refuses invocation from context kind 'internal_test'. " +
      "No entity found for this input in the vendor's sandbox mode.";
    expect(classifyDriftCause(s)).toBe("policy_refusal");
  });
});
