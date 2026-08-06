/**
 * Regression test for the missing-retry bug surfaced by 2026-07 x402 traffic.
 * A `us-company-data` call for "Stripe Inc" failed with "SEC EDGAR search
 * returned HTTP 500" while the identical query succeeds on retry — SEC
 * EFTS/EDGAR intermittently 5xx's and 429's under fair-access throttling. The
 * previous code surfaced the first 5xx straight to the caller.
 *
 * Post-fix: fetchSec delegates to the shared `withRetry` primitive and marks
 * bare `HTTP 5xx` retryable (the shared default only covers 502/503/504/429,
 * not the plain 500 seen in prod). Transient 5xx / 429 / network errors retry
 * once; 4xx (incl. 404) is returned unretried.
 */

import { describe, it, expect, vi } from "vitest";
import { fetchSec, normalizeCompanyName, classifyNameMatch } from "./us-company-data.js";

function resp(status: number): Response {
  return new Response(status === 200 ? "{}" : "", { status });
}

describe("fetchSec", () => {
  it("retries a transient 500 and returns the eventual 200 (the bug case)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resp(500))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);

    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 429 throttling", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resp(429))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws after the single retry on persistent 500", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(500));

    await expect(fetchSec("https://x", "SEC EDGAR", fetchImpl)).rejects.toThrow(/HTTP 500/);
    // maxRetries:1 → 2 total attempts.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 404 — passes it straight through for the caller to interpret", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(404));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);
    expect(r.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient network error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      // "fetch failed" matches withRetry's default retryable network patterns.
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

/**
 * Regression test for the wrong-company match risk flagged in the PR #148
 * six-lens review. Name lookups resolve via SEC full-text filing search, which
 * for a private company (e.g. "Stripe Inc") returns a *different* public filer
 * that merely mentions the name. classifyNameMatch surfaces that as a low /
 * non-exact match so callers don't trust a speculative identity.
 */
describe("normalizeCompanyName", () => {
  it("strips corporate suffixes and punctuation so equivalents compare equal", () => {
    expect(normalizeCompanyName("Apple Inc.")).toBe(normalizeCompanyName("APPLE INCORPORATED"));
    expect(normalizeCompanyName("Meta Platforms, Inc.")).toBe("meta platforms");
  });
});

describe("classifyNameMatch", () => {
  it("flags exact when normalized names are equal", () => {
    expect(classifyNameMatch("Apple Inc", "Apple Inc.")).toEqual({
      match_confidence: "exact",
      is_exact_match: true,
    });
  });

  it("flags LOW when the resolved company is a different filer (the Stripe bug case)", () => {
    // "Stripe Inc" (private, no filings) resolving to some unrelated public
    // company that merely mentioned it in a filing.
    const r = classifyNameMatch("Stripe Inc", "Block, Inc.");
    expect(r.is_exact_match).toBe(false);
    expect(r.match_confidence).toBe("low");
  });

  it("flags high when two multi-token names share most tokens", () => {
    const r = classifyNameMatch("Berkshire Hathaway", "Berkshire Hathaway Energy");
    expect(r.match_confidence).toBe("high");
    expect(r.is_exact_match).toBe(false);
  });

  it("does NOT let a single-token name reach high against a different longer name", () => {
    // "Stripe" shares its one token with "Stripe Financial Holdings" (Jaccard
    // 1/2) but they are different companies — must be low, not a false high.
    expect(classifyNameMatch("Stripe", "Stripe Financial Holdings").match_confidence).toBe("low");
    expect(classifyNameMatch("Uber", "Uber Freight LLC").match_confidence).toBe("low");
  });

  it("flags low when two multi-token names share too few tokens", () => {
    // Different companies that happen to share one word.
    expect(classifyNameMatch("Meta Platforms", "Meta Materials").match_confidence).toBe("low");
  });

  it("errs toward LOW for a correct-but-abbreviated name (safe direction)", () => {
    // False "low" is acceptable; a false "exact" asserting a wrong identity is not.
    expect(classifyNameMatch("IBM", "International Business Machines Corp").match_confidence).toBe(
      "low",
    );
  });

  it("returns low, non-exact for an empty resolved name", () => {
    expect(classifyNameMatch("Anything", "")).toEqual({
      match_confidence: "low",
      is_exact_match: false,
    });
  });
});
