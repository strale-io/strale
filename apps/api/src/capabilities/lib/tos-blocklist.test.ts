/**
 * Regression tests for the ToS blocklist (2026-08-05).
 *
 * Origin: `product-reviews-extract` took 31 x402 calls over 2026-07-20 →
 * 2026-08-05 and failed 28 of them, every one a `trustpilot.com/review/*` URL
 * returning HTTP 403. The capability was advertising Trustpilot in its own
 * description and error text while the sibling `trustpilot-score` capability
 * sat deactivated for that exact ToS reason, so callers were being steered
 * into a wall and retrying the same URL 3-4 times.
 *
 * The deeper defect: deactivating a *named* capability does not stop a
 * capability that accepts an arbitrary URL from reaching the same host.
 */

import { describe, it, expect } from "vitest";
import {
  findProhibitedTarget,
  assertTargetAllowed,
  PROHIBITED_TARGETS,
  TOS_REFUSAL_MARKER,
} from "./tos-blocklist.js";
import { isUserInputError } from "../../lib/circuit-breaker.js";

describe("findProhibitedTarget", () => {
  it("blocks the exact URL shape customers were retrying (the bug case)", () => {
    const hit = findProhibitedTarget("https://www.trustpilot.com/review/majority.co.uk");
    expect(hit?.site).toBe("Trustpilot");
  });

  it("blocks country subdomains, which callers also used", () => {
    // uk.trustpilot.com appeared in the same production window.
    expect(findProhibitedTarget("https://uk.trustpilot.com/review/imaanactive.co.uk")?.site).toBe(
      "Trustpilot",
    );
  });

  it("blocks a scheme-less host, since the executors prepend https://", () => {
    expect(findProhibitedTarget("trustpilot.com/review/stripe.com")?.site).toBe("Trustpilot");
  });

  it("blocks linkedin.com, which tech-stack-detect was fetching successfully", () => {
    expect(findProhibitedTarget("https://www.linkedin.com")?.site).toBe("LinkedIn");
    expect(findProhibitedTarget("https://www.linkedin.com/company/hygenco/")?.site).toBe("LinkedIn");
  });

  it("is case-insensitive on the host", () => {
    expect(findProhibitedTarget("https://WWW.TrustPilot.COM/review/x")?.site).toBe("Trustpilot");
  });

  it("does not block the sources that legitimately succeeded in production", () => {
    // These three completed in the same window and must keep working.
    expect(findProhibitedTarget("https://www.consumerlab.com/primaforce/")).toBeNull();
    expect(findProhibitedTarget("https://www.reviews.io/company-reviews/store/unilever")).toBeNull();
    expect(findProhibitedTarget("https://nutrigardens.tenereteam.com/")).toBeNull();
  });

  it("does not block a lookalike host that merely contains a blocked name", () => {
    expect(findProhibitedTarget("https://trustpilot.com.example.org/review/x")).toBeNull();
    expect(findProhibitedTarget("https://nottrustpilot.com/review/x")).toBeNull();
    expect(findProhibitedTarget("https://mylinkedin.com")).toBeNull();
  });

  it("scopes a path-limited rule to that path only", () => {
    // The ruling covers Google Search, not all of google.com.
    expect(findProhibitedTarget("https://www.google.com/search?q=shoes")?.site).toBe(
      "Google Search",
    );
    expect(findProhibitedTarget("https://www.google.com/")).toBeNull();
    expect(findProhibitedTarget("https://patents.google.com/patent/US123")?.site).toBe(
      "Google Patents",
    );
  });

  it("returns null for unparseable input rather than claiming a policy hit", () => {
    expect(findProhibitedTarget("")).toBeNull();
    expect(findProhibitedTarget("   ")).toBeNull();
    expect(findProhibitedTarget("http://")).toBeNull();
  });

  it("ignores a trailing dot on the hostname (FQDN form)", () => {
    expect(findProhibitedTarget("https://trustpilot.com./review/x")?.site).toBe("Trustpilot");
  });
});

describe("assertTargetAllowed", () => {
  it("passes an allowed target through silently", () => {
    expect(() => assertTargetAllowed("https://www.consumerlab.com/primaforce/")).not.toThrow();
  });

  it("throws an actionable message: what, why, retry won't help, what to use", () => {
    let message = "";
    try {
      assertTargetAllowed("https://www.trustpilot.com/review/stripe.com");
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain("Trustpilot");
    expect(message).toContain(TOS_REFUSAL_MARKER);
    expect(message).toMatch(/retrying .* will not succeed/i);
    expect(message).toContain("Reviews.io");
  });

  it("does not leak the internal decision id to callers", () => {
    let message = "";
    try {
      assertTargetAllowed("https://www.trustpilot.com/review/x");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toMatch(/DEC-\d/);
  });
});

describe("blocklist integrity", () => {
  it("every rule carries a governing decision and an alternative", () => {
    for (const rule of PROHIBITED_TARGETS) {
      expect(rule.decision, `${rule.host} missing decision`).toMatch(/^DEC-/);
      expect(rule.alternatives.length, `${rule.host} missing alternatives`).toBeGreaterThan(0);
      expect(rule.host).not.toMatch(/^https?:|\//);
    }
  });

  it("every thrown message carries the marker the circuit breaker matches on", () => {
    // If this drifts, a policy refusal starts counting as a capability
    // failure and a burst of blocked URLs trips the breaker for everyone.
    for (const rule of PROHIBITED_TARGETS) {
      const url = `https://${rule.host}${rule.pathPrefix ?? "/"}`;
      expect(() => assertTargetAllowed(url)).toThrow(TOS_REFUSAL_MARKER);
    }
  });

  it("the circuit breaker actually classifies a refusal as user-input, not a fault", () => {
    // Cross-module guard: circuit-breaker.ts keeps its own copy of the marker
    // in USER_INPUT_ERROR_PATTERNS. Delete it there and this fails here —
    // which is the point, because the symptom in production would otherwise
    // be the capability tripping open for every caller.
    let message = "";
    try {
      assertTargetAllowed("https://www.trustpilot.com/review/stripe.com");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(isUserInputError(message)).toBe(true);
  });
});
