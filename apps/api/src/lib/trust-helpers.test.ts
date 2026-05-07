import { describe, it, expect } from "vitest";
import { categorizeFailureReason, isRetryableFailure } from "./trust-helpers.js";

// Phase 3 Harden Fix C regression tests. Phase 2
// (memo: docs/research/2026-05-07-dk-phase2-understand.md on branch
// investigation/dk-phase-2-understand) noted the categorizer's quota match
// was bound to the literal string "quota_exceeded" (underscore), so the
// cvrapi.dk error "quota has been temporarily exceeded" (spaces) fell
// through to "unknown". Both classify as retryable today, so behavior is
// unchanged — but the regex was structurally brittle. Fix C broadens to
// quota + exceeded|exhausted in any wording.

describe("categorizeFailureReason — Fix C quota broadening", () => {
  it("classifies the DK CVR quota error string as transient", () => {
    // The exact string thrown by danish-company-data.ts:85-87 when
    // cvrapi.dk's free-tier monthly quota is exhausted. Production
    // observability recorded ~120 of these in 48h before the fix.
    const dkQuotaError =
      "The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.";
    expect(categorizeFailureReason(dkQuotaError)).toBe("transient");
  });

  it("still classifies the legacy 'quota_exceeded' (underscore) wording as transient — no regression", () => {
    expect(categorizeFailureReason("Upstream returned QUOTA_EXCEEDED")).toBe("transient");
    expect(categorizeFailureReason("error: quota_exceeded for this plan")).toBe("transient");
  });

  it("classifies 'quota exhausted' as transient (the second broadening)", () => {
    expect(categorizeFailureReason("Daily quota has been exhausted, retry tomorrow")).toBe(
      "transient",
    );
  });

  it("does not over-match strings that mention quota without an exhaustion verb", () => {
    // 'quota' alone is not enough — the categorizer should not fire 'transient'
    // for descriptive prose without the exhaustion signal.
    expect(categorizeFailureReason("This API has a quota of 1000 calls/month")).toBe("unknown");
  });

  it("transient verdict is retryable", () => {
    expect(isRetryableFailure("transient")).toBe(true);
  });

  it("preserves classification of unrelated transient signals", () => {
    expect(categorizeFailureReason("Connection ETIMEDOUT")).toBe("transient");
    expect(categorizeFailureReason("HTTP 503 Service Unavailable")).toBe("transient");
    expect(categorizeFailureReason("Too many requests — rate limit hit")).toBe("transient");
  });

  it("preserves classification of non-transient categories (no over-broadening)", () => {
    expect(categorizeFailureReason("HTTP 401 Unauthorized")).toBe("auth_expired");
    expect(categorizeFailureReason("HTTP 404 Not Found")).toBe("endpoint_gone");
    expect(categorizeFailureReason("TypeError: cannot read properties of undefined")).toBe("internal");
  });
});
