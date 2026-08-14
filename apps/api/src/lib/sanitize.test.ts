/**
 * Regression tests for failure-reason sanitization (2026-08-05).
 *
 * Origin: the ToS refusal shipped in PR #151 points callers at compliant
 * review platforms. Verified against production, the message came back as
 * "Supported review sources include [service], Feefo and Yotpo pages" — the
 * hostname stripper had eaten "Reviews.io", turning actionable guidance into
 * advice that names nothing.
 *
 * The stripper is doing its job (internal hostnames must not leak); it simply
 * cannot distinguish infrastructure from a vendor name we deliberately wrote.
 * Hence an explicit allowlist, and these tests pin both directions: authored
 * vendor names survive, real hostnames still get stripped.
 */

import { describe, it, expect } from "vitest";
import { sanitizeFailureReason } from "./sanitize.js";

describe("sanitizeFailureReason — allowlisted vendor names", () => {
  it("keeps Reviews.io in the ToS refusal message (the bug case)", () => {
    const refusal =
      "Trustpilot is not a supported source: its Terms of Service prohibit automated access, " +
      "so Strale does not fetch it. Supported review sources include Reviews.io, Feefo and " +
      "Yotpo pages, and first-party product pages.";

    const out = sanitizeFailureReason(refusal);

    expect(out).toContain("Reviews.io");
    expect(out).not.toContain("[service]");
  });

  it("keeps the blocked site's own name so the caller knows what was refused", () => {
    expect(sanitizeFailureReason("trustpilot.com is not supported")).toContain("trustpilot.com");
    expect(sanitizeFailureReason("linkedin.com is not supported")).toContain("linkedin.com");
  });

  it("is case-insensitive about allowlisted names", () => {
    expect(sanitizeFailureReason("See REVIEWS.IO for details")).toContain("REVIEWS.IO");
  });
});

describe("sanitizeFailureReason — still strips what it should", () => {
  it("strips an internal infrastructure hostname", () => {
    const out = sanitizeFailureReason("connect ECONNREFUSED chromium.railway.internal:8080");
    expect(out).not.toContain("chromium.railway.internal");
  });

  it("strips an arbitrary third-party hostname that is not allowlisted", () => {
    const out = sanitizeFailureReason("failed to reach api.some-vendor.example");
    expect(out).toContain("[service]");
    expect(out).not.toContain("api.some-vendor.example");
  });

  it("strips full URLs", () => {
    const out = sanitizeFailureReason("GET https://internal.example.com/secret?token=abc failed");
    expect(out).not.toContain("internal.example.com");
    expect(out).not.toContain("token=abc");
  });

  it("still keeps the pre-existing code-ish exemptions", () => {
    expect(sanitizeFailureReason("cannot read error.message")).toContain("error.message");
  });

  it("handles null and empty input", () => {
    expect(sanitizeFailureReason(null)).toBe("Unknown error");
    expect(sanitizeFailureReason("")).toBe("Unknown error");
  });
});
