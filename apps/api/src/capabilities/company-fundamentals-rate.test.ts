/**
 * The SEC rate ceiling must hold ACROSS invocations, not within one.
 *
 * Raised by independent review of PR #582: one call issues 9-13 requests, and
 * batching them five at a time bounds concurrency but not rate — two customer
 * calls overlapping doubles it, and the SEC blocks IPs that exceed ~10/s. An
 * SEC block is not a refusal; it surfaces as an upstream fault and opens the
 * circuit breaker on a capability that is working correctly.
 *
 * These tests assert the property that matters (request STARTS are spaced by
 * the gate, however many callers there are) rather than the implementation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./company-fundamentals.js";

const exec = getDirectExecutor("company-fundamentals")!;

/** Wall-clock ms at which each SEC request was issued. */
let starts: number[] = [];

function conceptResponse(): Response {
  return new Response(
    JSON.stringify({
      cik: 320193,
      entityName: "Apple Inc.",
      units: { USD: [{ end: "2025-09-27", start: "2024-09-29", val: 416161000000, form: "10-K", fp: "FY", fy: 2025, filed: "2025-10-31", accn: "x" }] },
    }),
    { status: 200 },
  );
}

describe("company-fundamentals SEC rate gate", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    starts = [];
    fetchMock = vi.fn(async (url: string) => {
      starts.push(Date.now());
      if (url.includes("RevenueFromContractWithCustomerExcludingAssessedTax")) return conceptResponse();
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("spaces successive SEC requests so the rate stays under 10/s", async () => {
    await exec({ cik: "320193" });

    expect(fetchMock.mock.calls.length, "expected the multi-concept fan-out").toBeGreaterThan(5);
    // The property: no 1-second window contains more than 10 request starts.
    // Asserted on the observed timestamps, so it holds whatever the gate's
    // internals are.
    for (let i = 0; i < starts.length; i++) {
      const within = starts.filter((t) => t >= starts[i] && t < starts[i] + 1000).length;
      expect(within, `${within} requests started within 1s of index ${i}`).toBeLessThanOrEqual(10);
    }
  });

  // The regression the review actually named: the old batching bounded a
  // single invocation and nothing coordinated two.
  it("holds the ceiling when two invocations overlap", async () => {
    await Promise.all([exec({ cik: "320193" }), exec({ cik: "320193" })]);

    expect(starts.length, "expected both invocations to issue requests").toBeGreaterThan(10);
    for (let i = 0; i < starts.length; i++) {
      const within = starts.filter((t) => t >= starts[i] && t < starts[i] + 1000).length;
      expect(within, `${within} concurrent-call requests started within 1s of index ${i}`).toBeLessThanOrEqual(10);
    }
  });

  // A rejected slot must not wedge the shared chain for every later caller.
  it("keeps serving after a request rejects", async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error("network reset"); });
    await exec({ cik: "320193" }).catch(() => undefined);

    starts = [];
    const { output } = await exec({ cik: "320193" });
    expect(output.entity_name).toBe("Apple Inc.");
    expect(starts.length).toBeGreaterThan(0);
  });
});
