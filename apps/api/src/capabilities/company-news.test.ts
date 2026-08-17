/**
 * Regression tests for company-news's GDELT 429 handling (Phase-4 tail fix,
 * 2026-08-17; revised same day per review MEDIUM-3).
 *
 * History: GDELT rate-limits under normal traffic. The original fix added
 * an executor-level `withRetry` (single retry, ~1s backoff) around the
 * fetch. Review caught that this stacked with the TWO outer retry layers
 * that already wrap the whole executor call — do.ts's executeWithRetry
 * (customer /v1/do path) and test-runner.ts's runSingleTest (scheduler
 * path), both maxRetries: 1 — so one logical call could fire up to
 * 2 (outer) x 2 (this layer) = 4 requests against an API already asking
 * for backoff.
 *
 * Fixed shape: fetchGdelt has NO internal retry. A 429 cancels the
 * unconsumed response body (so the stream doesn't pin the connection open
 * until GC — same fix shape as safe-fetch.ts's redirect-cap cancellation)
 * and throws; the outer layers' own retry re-invokes the WHOLE executor,
 * which re-runs this fetch from scratch, giving exactly one retry per
 * logical call end-to-end instead of up to four.
 */

import { describe, it, expect, vi } from "vitest";
import { fetchGdelt } from "./company-news.js";

function resp(status: number): Response {
  return new Response(status === 200 ? "{}" : "some body", { status });
}

describe("fetchGdelt", () => {
  it("throws immediately on 429 — no internal retry (outer layers own retry now)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(429));

    await expect(fetchGdelt("https://x", fetchImpl)).rejects.toThrow(/HTTP 429/);
    // Exactly ONE call — the amplification bug (this layer retrying on top
    // of do.ts / test-runner.ts's own retry) is exactly what this pins.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cancels the response body before throwing on 429 (no pinned stream)", async () => {
    const response = resp(429);
    const cancelSpy = vi.spyOn(response.body!, "cancel");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(fetchGdelt("https://x", fetchImpl)).rejects.toThrow(/HTTP 429/);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw if the body has no readable stream (cancel is optional-chained)", async () => {
    // A Response constructed with a null body has no ReadableStream at all —
    // `response.body` is null. The cancel call must be optional-chained, not
    // assumed present.
    const response = new Response(null, { status: 429 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(fetchGdelt("https://x", fetchImpl)).rejects.toThrow(/HTTP 429/);
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
