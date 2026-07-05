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
import { fetchSec } from "./us-company-data.js";

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
