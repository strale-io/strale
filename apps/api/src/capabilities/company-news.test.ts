/**
 * Regression tests for company-news's GDELT 429 backoff (Phase-4 tail fix,
 * 2026-08-17). GDELT rate-limits under normal traffic; before this fix any
 * HTTP 429 response surfaced straight through as a capability failure with
 * no retry. Same idiom as us-company-data.ts's `fetchSec`: delegate to the
 * shared `withRetry` primitive (its default retryable set already covers
 * `/HTTP 429/i`), single retry with backoff+jitter.
 */

import { describe, it, expect, vi } from "vitest";
import { fetchGdelt } from "./company-news.js";

function resp(status: number): Response {
  return new Response(status === 200 ? "{}" : "", { status });
}

describe("fetchGdelt", () => {
  it("retries a 429 and returns the eventual 200 (the bug case)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resp(429))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchGdelt("https://x", fetchImpl);

    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws after the single retry on persistent 429", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(429));

    await expect(fetchGdelt("https://x", fetchImpl)).rejects.toThrow(/HTTP 429/);
    // maxRetries:1 → 2 total attempts.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-429 error status — passes it straight through unchanged", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(500));

    const r = await fetchGdelt("https://x", fetchImpl);
    expect(r.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes a 200 straight through with a single call", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(200));

    const r = await fetchGdelt("https://x", fetchImpl);
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
