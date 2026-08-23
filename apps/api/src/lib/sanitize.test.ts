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

/**
 * The canned branches used to return a prefix nothing had stripped.
 *
 * `sanitizeFailureReason` short-circuits on a network error code or on
 * "fetch failed", keeping "everything before the first ` — `" so the caller
 * still knows which capability failed. That prefix is an authored capability
 * name by convention and arbitrary upstream text in fact, and it was carried
 * out of the function BEFORE any URL or hostname stripping ran.
 *
 * Note why the existing `ECONNREFUSED chromium.railway.internal:8080` case
 * above did not catch this: it has no ` — `, so the prefix is empty and the
 * hostname vanishes into the canned message rather than being stripped. The
 * leak needs a message that has both a prefix AND a network token — which is
 * also why it has never occurred in production.
 */
describe("sanitizeFailureReason — the canned branches redact their prefix", () => {
  it("does not leak a URL through the network-error branch", () => {
    const out = sanitizeFailureReason(
      "GET https://internal.example.com/x — getaddrinfo ENOTFOUND upstream",
    );
    expect(out).not.toContain("internal.example.com");
    expect(out).toContain("Service temporarily unreachable");
  });

  it("does not leak a bare hostname through the network-error branch", () => {
    const out = sanitizeFailureReason(
      "probe of chromium.railway.internal — ECONNRESET while reading",
    );
    expect(out).not.toContain("chromium.railway.internal");
    expect(out).toContain("Service temporarily unreachable");
  });

  it("does not leak through the `fetch failed` branch either", () => {
    const out = sanitizeFailureReason("GET https://10-2-3-4.internal/v1 — fetch failed");
    expect(out).not.toContain("10-2-3-4.internal");
    expect(out).toContain("External service temporarily unavailable");
  });

  it("does not leak a provider name through a canned branch", () => {
    const out = sanitizeFailureReason("Browserless session — ETIMEDOUT");
    expect(out).not.toContain("Browserless");
    expect(out).toContain("External web service");
  });

  it("still keeps an allowlisted vendor name in the prefix", () => {
    // Redacting the prefix must not undo the allowlist the file above exists
    // for: an authored product name is still authored copy in a prefix.
    const out = sanitizeFailureReason("Reviews.io lookup — ECONNREFUSED");
    expect(out).toContain("Reviews.io");
  });

  it("still keeps the capability name, which is the point of the prefix", () => {
    const out = sanitizeFailureReason("Header Security Check — getaddrinfo ENOTFOUND");
    expect(out).toBe("Header Security Check — Service temporarily unreachable");
  });

  it("does not change which branch fires", () => {
    // Detection runs on the pre-redaction text, so redacting first must not
    // move a message from one branch to another.
    expect(sanitizeFailureReason("x — ETIMEDOUT")).toContain("Service temporarily unreachable");
    expect(sanitizeFailureReason("x — fetch failed")).toContain(
      "External service temporarily unavailable",
    );
    expect(sanitizeFailureReason("x — something else entirely")).toBe(
      "x — something else entirely",
    );
  });
});

/**
 * Idempotence, which is now load-bearing rather than merely tidy.
 *
 * `lib/receipt/settle.ts` sanitises when it builds an execution receipt, and
 * the receipt's digest commits to the result. A message that sanitised
 * differently on a second application would make that digest depend on how
 * many times the function had run, which is not a commitment to anything.
 *
 * Two independent sources of non-idempotence existed, and the corpus below
 * covers both: a prefix escaping redaction (stripped on the second pass), and
 * the canned branches skipping the truncate tail (so an over-long prefix came
 * back whole once and truncated the next time).
 */
describe("sanitizeFailureReason — idempotent", () => {
  const CORPUS = [
    // The two historical non-idempotence sources.
    "GET https://internal.example.com/x — getaddrinfo ENOTFOUND upstream",
    "x".repeat(600) + " — ETIMEDOUT",
    // Every branch and every stripping rule.
    "fetch failed",
    "connect ECONNREFUSED chromium.railway.internal:8080",
    "Browserless returned 429",
    "upstream issue while reading api.some-vendor.example",
    "GET https://internal.example.com/secret?token=abc failed",
    "Reviews.io is a supported source",
    "cannot read error.message",
    "Header Security Check — getaddrinfo ENOTFOUND",
    "plain message with nothing to strip",
    "  collapses   whitespace  ",
    "y".repeat(499),
    "z".repeat(501),
    "",
  ];

  it.each(CORPUS)("sanitize(sanitize(x)) === sanitize(x) for %j", (input) => {
    const once = sanitizeFailureReason(input);
    expect(sanitizeFailureReason(once)).toBe(once);
  });

  it("bounds every output at 500 characters, on every path", () => {
    // The canned branches used to return without truncating.
    for (const input of CORPUS) {
      expect(sanitizeFailureReason(input).length).toBeLessThanOrEqual(500);
    }
  });
});
