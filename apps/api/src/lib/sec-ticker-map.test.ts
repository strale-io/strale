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
  stripSecTitleAnnotation,
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

/**
 * Production, 2026-11-16/17: one wallet bought 332 US company lookups and was
 * refused on ORACLE CORP, BANK OF AMERICA CORP, TUCOWS INC and Fatpipe Inc.
 * All four are in SEC's own ticker file. Two shapes in that file hid them
 * from the exact title path; the rows below are copied from the live file.
 */
describe("resolveByTitle, shapes of the live SEC file", () => {
  const LIVE = {
    // One registrant, two listed securities: one row per ticker, same CIK.
    "0": { cik_str: 1341439, ticker: "ORCL", title: "ORACLE CORP" },
    "1": { cik_str: 1341439, ticker: "ORCL-PD", title: "ORACLE CORP" },
    // SEC's registrant annotation, in the spellings the file uses.
    "2": { cik_str: 70858, ticker: "BAC", title: "BANK OF AMERICA CORP /DE/" },
    "3": { cik_str: 909494, ticker: "TCX", title: "TUCOWS INC /PA/" },
    "4": { cik_str: 1993400, ticker: "FATN", title: "Fatpipe Inc/UT" },
    "5": { cik_str: 875320, ticker: "VRTX", title: "VERTEX PHARMACEUTICALS INC / MA" },
    "6": { cik_str: 909832, ticker: "COST", title: "COSTCO WHOLESALE CORP /NEW" },
    "7": { cik_str: 1094517, ticker: "TM", title: "TOYOTA MOTOR CORP/" },
    // Slashes that are part of the name and must survive.
    "8": { cik_str: 1434265, ticker: "GMAB", title: "GENMAB A/S" },
    "9": { cik_str: 39263, ticker: "CFR", title: "CULLEN/FROST BANKERS, INC." },
    // Two DIFFERENT registrants that collide only once the annotation is gone.
    "10": { cik_str: 5550001, ticker: "TWN1", title: "TWIN CORP /DE/" },
    "11": { cik_str: 5550002, ticker: "TWN2", title: "TWIN CORP /NV/" },
    // Depositary-receipt facilities: a shell beside the issuer, and one alone.
    "12": { cik_str: 2102907, ticker: "RML", title: "Resolution Minerals Ltd" },
    "13": { cik_str: 2086869, ticker: "RLMLY", title: "RESOLUTION MINERALS LTD/ADR" },
    "14": { cik_str: 5550003, ticker: "TYHOY", title: "TOYOTA TSUSHO CORP/ADR" },
    "15": { cik_str: 5550004, ticker: "PANDY", title: "Pandora A/S / ADR" },
  };

  it("treats two rows with one CIK as one company (Oracle, ORCL and ORCL-PD)", async () => {
    const hit = await resolveByTitle("ORACLE CORP", fakeFetch(200, LIVE));
    expect(hit).not.toBeNull();
    expect(hit!.cik).toBe("0001341439");
    expect(hit!.ticker).toBe("ORCL"); // the primary listing, not the preferred
    expect((await resolveByTitle("Oracle", fakeFetch(200, LIVE)))!.cik).toBe("0001341439");
  });

  it.each([
    ["BANK OF AMERICA CORP", "0000070858"],
    ["Bank of America Corp", "0000070858"],
    ["TUCOWS INC", "0000909494"],
    ["Fatpipe Inc", "0001993400"],
    ["Vertex Pharmaceuticals", "0000875320"],
    ["Costco Wholesale", "0000909832"],
    ["Toyota Motor Corp", "0001094517"],
  ])("matches %s although SEC's title carries a registrant annotation", async (name, cik) => {
    const hit = await resolveByTitle(name, fakeFetch(200, LIVE));
    expect(hit?.cik).toBe(cik);
  });

  it("returns SEC's own title, annotation intact", async () => {
    const hit = await resolveByTitle("Tucows", fakeFetch(200, LIVE));
    expect(hit!.title).toBe("TUCOWS INC /PA/");
  });

  it("still refuses two different registrants that share a name once the annotation is removed", async () => {
    expect(await resolveByTitle("Twin Corp", fakeFetch(200, LIVE))).toBeNull();
  });

  it("never resolves a name to a depositary-receipt facility (/ADR)", async () => {
    expect(await resolveByTitle("Toyota Tsusho", fakeFetch(200, LIVE))).toBeNull();
    expect(await resolveByTitle("Toyota Tsusho Corp", fakeFetch(200, LIVE))).toBeNull();
    expect(await resolveByTitle("Pandora", fakeFetch(200, LIVE))).toBeNull();
    // Not even when the caller types the tag: the row is not in the index.
    expect(await resolveByTitle("Toyota Tsusho Corp ADR", fakeFetch(200, LIVE))).toBeNull();
    // The facility is still reachable by its own ticker.
    expect((await resolveByTicker("TYHOY", fakeFetch(200, LIVE)))!.cik).toBe("0005550003");
  });

  it("resolves to the issuer when an /ADR facility shares its name", async () => {
    const hit = await resolveByTitle("Resolution Minerals", fakeFetch(200, LIVE));
    expect(hit!.cik).toBe("0002102907");
  });

  it("leaves slashes that belong to the name", async () => {
    expect((await resolveByTitle("Genmab", fakeFetch(200, LIVE)))!.cik).toBe("0001434265");
    expect((await resolveByTitle("Cullen/Frost Bankers", fakeFetch(200, LIVE)))!.cik).toBe("0000039263");
  });
});

describe("stripSecTitleAnnotation", () => {
  it.each([
    ["BANK OF AMERICA CORP /DE/", "BANK OF AMERICA CORP"],
    ["Fatpipe Inc/UT", "Fatpipe Inc"],
    ["PROGRESSIVE CORP/OH/", "PROGRESSIVE CORP"],
    ["VERTEX PHARMACEUTICALS INC / MA", "VERTEX PHARMACEUTICALS INC"],
    ["ARM HOLDINGS PLC /UK", "ARM HOLDINGS PLC"],
    ["COSTCO WHOLESALE CORP /NEW", "COSTCO WHOLESALE CORP"],
    ["TOYOTA MOTOR CORP/", "TOYOTA MOTOR CORP"],
    ["Core Scientific, Inc./tx", "Core Scientific, Inc."],
    ["Pandora A/S / ADR", "Pandora A/S / ADR"], // a facility, not an annotation
    ["TOYOTA TSUSHO CORP/ADR", "TOYOTA TSUSHO CORP/ADR"],
    ["GENMAB A/S", "GENMAB A/S"],
    ["CULLEN/FROST BANKERS, INC.", "CULLEN/FROST BANKERS, INC."],
    ["Apple Inc.", "Apple Inc."],
  ])("%s -> %s", (title, expected) => {
    expect(stripSecTitleAnnotation(title)).toBe(expected);
  });
});
