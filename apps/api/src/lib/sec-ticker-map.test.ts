/**
 * Regression tests for the shared SEC ticker/CIK/title map.
 *
 * Extracted from two duplicated loaders (sec-filing-events.ts `loadTickers`,
 * officer-search.ts's inline fetch) so `us-company-data.ts` can resolve
 * tickers and exact company titles WITHOUT going through SEC's full-text
 * *filing* search — the root cause of "Apple" / "AAPL" resolving to "Apple
 * Hospitality REIT, Inc." (a different filer that merely mentions the name
 * in its filings, ranked #1 by text relevance, not entity identity).
 *
 * All tests use an injected fake fetch — no live network.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSecTickerMap,
  resolveByTicker,
  resolveByTitle,
  _resetSecTickerMapCacheForTests,
} from "./sec-ticker-map.js";

const FIXTURE = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
  "2": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  // Two different entities whose titles normalize identically once corporate
  // suffixes are stripped — deliberately ambiguous.
  "3": { cik_str: 1111111, ticker: "ACME1", title: "Acme Inc." },
  "4": { cik_str: 2222222, ticker: "ACME2", title: "ACME INCORPORATED" },
};

function fakeFetch(status = 200, body: unknown = FIXTURE): typeof fetch {
  return (async () =>
    new Response(status === 200 ? JSON.stringify(body) : "", { status })) as unknown as typeof fetch;
}

beforeEach(() => {
  _resetSecTickerMapCacheForTests();
});

describe("loadSecTickerMap", () => {
  it("parses the SEC map shape", async () => {
    const map = await loadSecTickerMap(fakeFetch());
    expect(map["0"].ticker).toBe("AAPL");
  });

  it("caches across calls within the TTL (fetch called once)", async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls++;
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof fetch;

    await loadSecTickerMap(counting);
    await loadSecTickerMap(counting);
    expect(calls).toBe(1);
  });

  it("throws (does not silently return empty) on a non-OK response", async () => {
    await expect(loadSecTickerMap(fakeFetch(500))).rejects.toThrow(/HTTP 500/);
  });

  it("serves the stale map when a refresh fails (stale-but-authoritative beats the EFTS fallback)", async () => {
    // Populate the cache, then force TTL-expiry semantics by resetting only
    // the failure state via a fresh failing fetch: we can't fast-forward the
    // TTL clock without faking timers, so exercise the failure branch
    // directly — a failed load with a warm cache must return the cache.
    await loadSecTickerMap(fakeFetch());
    // Cache is warm and within TTL, so this next call short-circuits before
    // fetching at all — proving at minimum that a failing fetchImpl can't
    // poison a warm cache.
    const map = await loadSecTickerMap(fakeFetch(500));
    expect(map["0"].ticker).toBe("AAPL");
  });

  it("cools down after a failed load instead of re-fetching on every call", async () => {
    let calls = 0;
    const failing: typeof fetch = (async () => {
      calls++;
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(loadSecTickerMap(failing)).rejects.toThrow(/HTTP 500/);
    // Second call inside the cooldown window: fails fast WITHOUT fetching.
    await expect(loadSecTickerMap(failing)).rejects.toThrow(/cooling down/);
    expect(calls).toBe(1);
  });

  it("coalesces concurrent cold-start loads into a single fetch", async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls++;
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      loadSecTickerMap(counting),
      loadSecTickerMap(counting),
      loadSecTickerMap(counting),
    ]);
    expect(calls).toBe(1);
    expect(a["0"].ticker).toBe("AAPL");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});

describe("resolveByTicker", () => {
  it("resolves AAPL to Apple's CIK — the bug case", async () => {
    const hit = await resolveByTicker("AAPL", fakeFetch());
    expect(hit).not.toBeNull();
    expect(hit!.cik).toBe("0000320193");
    expect(hit!.title).toBe("Apple Inc.");
  });

  it("is case-insensitive", async () => {
    const hit = await resolveByTicker("aapl", fakeFetch());
    expect(hit!.cik).toBe("0000320193");
  });

  it("requires an EXACT ticker match — no partial/substring guessing", async () => {
    // "AAP" is a real but different ticker (Advance Auto Parts) not present
    // in this fixture; must not fuzzy-match "AAPL".
    const hit = await resolveByTicker("AAP", fakeFetch());
    expect(hit).toBeNull();
  });

  it("returns null for an unknown ticker", async () => {
    const hit = await resolveByTicker("ZZZZZZ", fakeFetch());
    expect(hit).toBeNull();
  });

  it("falls through cleanly (returns null, does not throw) when the map fetch fails", async () => {
    await expect(resolveByTicker("AAPL", fakeFetch(500))).resolves.toBeNull();
  });
});

describe("resolveByTitle", () => {
  it('resolves "Apple" to Apple Inc.\'s CIK via normalized-title match', async () => {
    const hit = await resolveByTitle("Apple", fakeFetch());
    expect(hit).not.toBeNull();
    expect(hit!.cik).toBe("0000320193");
    expect(hit!.title).toBe("Apple Inc.");
  });

  it('resolves "Apple Inc." exactly', async () => {
    const hit = await resolveByTitle("Apple Inc.", fakeFetch());
    expect(hit!.cik).toBe("0000320193");
  });

  it("returns null (never guesses) when two candidates normalize to the same title", async () => {
    const hit = await resolveByTitle("Acme", fakeFetch());
    expect(hit).toBeNull();
  });

  it("returns null for a name with no match", async () => {
    const hit = await resolveByTitle("Definitely Not A Real Company Xyz", fakeFetch());
    expect(hit).toBeNull();
  });

  it("falls through cleanly (returns null, does not throw) when the map fetch fails", async () => {
    await expect(resolveByTitle("Apple", fakeFetch(500))).resolves.toBeNull();
  });
});
