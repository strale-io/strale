/**
 * #428 — the shared web-provider layer must bound every tier's HTML read and
 * its response cache.
 *
 * `fetchPage` is the fetch path for 37 capability files. Before this change
 * all three tiers called `.text()` with no ceiling — plain fetch, Jina, and
 * Browserless alike — and the results went into a cache limited to 200
 * entries with no byte budget at all. One caller URL pointing at a large page
 * could materialise it in full, three times over as the tiers fell through,
 * and then park it in memory for five minutes.
 *
 * What these tests prove:
 *
 *   1. Each tier reads under `MAX_FETCHED_HTML_BYTES`, enforced on ACTUAL
 *      streamed bytes: exact limit accepted, +1 refused, a declared
 *      over-limit refused before the body is pulled (and cancelled), an
 *      understated declaration caught by the counter.
 *   2. Oversize is TERMINAL. The refusal does not cascade into the next tier
 *      re-fetching the same huge resource — the amplification this issue
 *      exists to stop — while every LEGITIMATE fallback reason (short body,
 *      JS challenge, upstream error) still falls through exactly as before.
 *   3. The cache is bounded by bytes as well as entries, and its accounting
 *      survives overwrite, shrink, growth, expiry, refusal and failure
 *      without leaking or double-counting.
 *   4. An oversize refusal classifies `caller_input` (floor-exempt); upstream
 *      failures and fallback conditions do not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.fn();
const browserlessFetchMock = vi.fn();

vi.mock("../../lib/safe-fetch.js", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

vi.mock("../../lib/metered-vendor-fetch.js", () => ({
  browserlessFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  meteredVendorFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  vendorReachabilityFetch: (...args: unknown[]) => browserlessFetchMock(...args),
}));

// The URLs below are fake hosts; the SSRF validator's own behaviour is covered
// by its suite. Same pattern as web-extract-resilience.test.ts.
vi.mock("../../lib/url-validator.js", () => ({ validateUrl: vi.fn(async () => {}) }));

import {
  fetchPage,
  __resetWebProviderCacheForTests,
  __webProviderCacheStatsForTests,
} from "./web-provider.js";
import { MAX_FETCHED_HTML_BYTES, MAX_ERROR_BODY_BYTES, ImageLimitError } from "./image-limits.js";
import { streamingResponse, streamingResponseOf } from "./streaming-response-testutil.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "../../lib/transaction-failure-taxonomy.js";

const CHUNK = 64 * 1024;
const LIMIT = MAX_FETCHED_HTML_BYTES;
/** The cache budget, restated so a change to it fails these tests loudly. */
const CACHE_BUDGET = 64 * 1024 * 1024;

/**
 * Valid HTML of EXACTLY `bytes` bytes that clears every tier's content gate
 * (has a <body>, >2000 chars, >200 chars of visible text). All ASCII, so byte
 * length and string length coincide and boundary arithmetic stays honest.
 */
function htmlOfBytes(bytes: number): Buffer {
  const head = "<html><head><title>t</title></head><body><p>";
  const tail = "</p></body></html>";
  const fillLen = bytes - head.length - tail.length;
  if (fillLen < 0) throw new Error(`htmlOfBytes: ${bytes} is smaller than the markup`);
  const html = head + "Real page content. ".repeat(Math.ceil(fillLen / 19)).slice(0, fillLen) + tail;
  const buf = Buffer.from(html, "utf8");
  if (buf.byteLength !== bytes) throw new Error(`htmlOfBytes: got ${buf.byteLength}, want ${bytes}`);
  return buf;
}

/** A Jina-style body: no markup gate, just needs >500 chars. */
const jinaBody = (bytes: number) => htmlOfBytes(bytes);

const URL_UNDER_TEST = "https://example.test/page";

/** Drive tier 1 only (plain fetch succeeds or refuses). */
const plainTier = (handle: { response: Response }) => safeFetchMock.mockResolvedValue(handle.response);

/** Make tier 1 fall through with a transient error so tier 2 (Jina) runs. */
function plainTierFallsThrough(): void {
  safeFetchMock.mockRejectedValue(new Error("network timeout"));
}

beforeEach(() => {
  safeFetchMock.mockReset();
  browserlessFetchMock.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  __resetWebProviderCacheForTests();
  process.env.BROWSERLESS_URL = "https://chromium.test";
  process.env.BROWSERLESS_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Tier 1: plain fetch ─────────────────────────────────────────────────────

describe("tier 1 (plain fetch) HTML is stream-bounded", () => {
  const okHtml = (bytes: number, declare?: number) =>
    streamingResponseOf(htmlOfBytes(bytes), { declare, contentType: "text/html" });

  it("accepts a body well under the limit", async () => {
    plainTier(okHtml(10_000));
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(10_000);
  });

  it("accepts a body of EXACTLY the limit", async () => {
    plainTier(okHtml(LIMIT));
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(LIMIT);
  });

  it("refuses limit + 1 (chunked, no content-length)", async () => {
    plainTier(okHtml(LIMIT + 1));
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(
      /'url' must be a page whose HTML is 16\.0MB or less/,
    );
  });

  it("refuses a declared over-limit content-length WITHOUT pulling, and cancels the body", async () => {
    const handle = streamingResponseOf(htmlOfBytes(LIMIT + CHUNK), {
      declare: LIMIT + 1,
      contentType: "text/html",
    });
    plainTier(handle);
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(/it declared/);
    expect(handle.pulls(), "body was consumed despite an over-limit declaration").toBe(0);
    expect(handle.cancelled(), "unconsumed body was not cancelled").toBe(true);
  });

  it("does NOT trust an understated content-length — the byte counter refuses", async () => {
    plainTier(okHtml(LIMIT + CHUNK, 1024));
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(
      /'url' must be a page whose HTML is/,
    );
  });

  it("an empty body falls through rather than being accepted as a page", async () => {
    // Empty is not oversize — it is "no usable HTML", the pre-existing
    // fall-through condition. Tier 2 must therefore still run.
    plainTier(streamingResponseOf(Buffer.alloc(0), { contentType: "text/html" }));
    const jina = streamingResponseOf(jinaBody(5_000));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jina.response);
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(5_000);
  });

  it("a UTF-8 BOM is stripped, matching Response.text() (Buffer.toString does not)", async () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), htmlOfBytes(10_000)]);
    plainTier(streamingResponseOf(body, { contentType: "text/html" }));
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.startsWith("﻿")).toBe(false);
    expect(r.html.startsWith("<html>")).toBe(true);
  });

  it("multi-byte UTF-8 split across chunk boundaries decodes intact", async () => {
    // The decode happens once over the whole assembled buffer, so a character
    // straddling a 64 KiB boundary must not become replacement chars.
    const pad = "é".repeat(40_000); // 80 000 bytes, crosses chunk boundaries
    const body = Buffer.from(`<html><body><p>${pad}</p></body></html>`, "utf8");
    plainTier(streamingResponseOf(body, { contentType: "text/html" }));
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html).not.toContain("�");
    expect(r.html).toContain("é".repeat(100));
  });

  it("a non-HTML content-type releases the body and falls through", async () => {
    const handle = streamingResponseOf(htmlOfBytes(10_000), { contentType: "application/json" });
    plainTier(handle);
    const jina = streamingResponseOf(jinaBody(5_000));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jina.response);
    await fetchPage(URL_UNDER_TEST);
    expect(handle.cancelled(), "unread non-HTML body was left open").toBe(true);
  });

  it("a permanent 404 keeps its existing terminal message", async () => {
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(/URL returned HTTP 404/);
  });
});

// ─── Tier 2: Jina ────────────────────────────────────────────────────────────

describe("tier 2 (Jina) HTML is stream-bounded", () => {
  beforeEach(plainTierFallsThrough);
  const jinaFetch = () => globalThis.fetch as ReturnType<typeof vi.fn>;

  it("accepts a body of exactly the limit", async () => {
    jinaFetch().mockResolvedValue(streamingResponseOf(jinaBody(LIMIT)).response);
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(LIMIT);
  });

  it("refuses limit + 1", async () => {
    jinaFetch().mockResolvedValue(streamingResponseOf(jinaBody(LIMIT + 1)).response);
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(
      /'url' must be a page whose HTML is 16\.0MB or less/,
    );
  });

  it("refuses a declared over-limit length without pulling, and cancels", async () => {
    const handle = streamingResponseOf(jinaBody(LIMIT + CHUNK), { declare: LIMIT + 1 });
    jinaFetch().mockResolvedValue(handle.response);
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(/it declared/);
    expect(handle.pulls()).toBe(0);
    expect(handle.cancelled()).toBe(true);
  });

  it("a Jina error response releases its body and falls through to Browserless", async () => {
    const handle = streamingResponseOf(Buffer.from("upstream said no"), {});
    jinaFetch().mockResolvedValue(new Response(handle.response.body, { status: 502 }));
    browserlessFetchMock.mockResolvedValue(
      streamingResponseOf(htmlOfBytes(9_000)).response,
    );
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(9_000);
  });
});

// ─── Tier 3: Browserless ─────────────────────────────────────────────────────

describe("tier 3 (Browserless) HTML is stream-bounded", () => {
  // skipFallback goes straight to Browserless, isolating the tier.
  const render = () => fetchPage(URL_UNDER_TEST, { skipFallback: true });

  it("accepts a body of exactly the limit", async () => {
    browserlessFetchMock.mockResolvedValue(streamingResponseOf(htmlOfBytes(LIMIT)).response);
    const r = await render();
    expect(r.html.length).toBe(LIMIT);
  });

  it("refuses limit + 1", async () => {
    browserlessFetchMock.mockResolvedValue(streamingResponseOf(htmlOfBytes(LIMIT + 1)).response);
    await expect(render()).rejects.toThrow(/'url' must be a page whose HTML is 16\.0MB or less/);
  });

  it("refuses a declared over-limit length without pulling, and cancels", async () => {
    const handle = streamingResponseOf(htmlOfBytes(LIMIT + CHUNK), { declare: LIMIT + 1 });
    browserlessFetchMock.mockResolvedValue(handle.response);
    await expect(render()).rejects.toThrow(/it declared/);
    expect(handle.pulls()).toBe(0);
    expect(handle.cancelled()).toBe(true);
  });

  it("an understated content-length is caught by the byte counter", async () => {
    browserlessFetchMock.mockResolvedValue(
      streamingResponseOf(htmlOfBytes(LIMIT + CHUNK), { declare: 512 }).response,
    );
    await expect(render()).rejects.toThrow(/'url' must be a page whose HTML is/);
  });

  it("a too-short render keeps its existing retry-then-throw behaviour", async () => {
    browserlessFetchMock.mockResolvedValue(streamingResponseOf(Buffer.from("<p>hi</p>")).response);
    await expect(render()).rejects.toThrow(/empty or too-short HTML/);
  });

  it("an upstream 5xx keeps its existing humanised message", async () => {
    browserlessFetchMock.mockResolvedValue(new Response("boom", { status: 503 }));
    await expect(render()).rejects.toThrow(/returned a server error \(HTTP 503\)/);
  });

  it("a huge error body is TRUNCATED, not refused — the upstream error still surfaces", async () => {
    // An error body is read to explain a failure; refusing it on size would
    // replace an accurate upstream message with a size error.
    const giant = Buffer.alloc(MAX_ERROR_BODY_BYTES * 3, 0x41);
    browserlessFetchMock.mockResolvedValue(
      new Response(streamingResponseOf(giant).response.body, { status: 503 }),
    );
    await expect(render()).rejects.toThrow(/returned a server error \(HTTP 503\)/);
  });

  it("a net-error marker inside a bounded error body is still classified permanent", async () => {
    browserlessFetchMock.mockResolvedValue(
      new Response("net::ERR_NAME_NOT_RESOLVED", { status: 500 }),
    );
    await expect(render()).rejects.toThrow(/does not resolve.*retrying will not help/s);
  });
});

// ─── Oversize is terminal: no cross-tier amplification ───────────────────────

describe("oversize does not cascade through the tiers", () => {
  it("an oversized plain fetch does NOT trigger Jina or Browserless", async () => {
    plainTier(streamingResponseOf(htmlOfBytes(LIMIT + 1), { contentType: "text/html" }));
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(ImageLimitError);
    expect(globalThis.fetch, "Jina re-fetched a page already judged too large").not.toHaveBeenCalled();
    expect(
      browserlessFetchMock,
      "Browserless re-rendered a page already judged too large",
    ).not.toHaveBeenCalled();
  });

  it("an oversized Jina response does NOT trigger Browserless", async () => {
    plainTierFallsThrough();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      streamingResponseOf(jinaBody(LIMIT + 1)).response,
    );
    await expect(fetchPage(URL_UNDER_TEST)).rejects.toThrow(ImageLimitError);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("an oversized Browserless render is not retried", async () => {
    browserlessFetchMock.mockResolvedValue(streamingResponseOf(htmlOfBytes(LIMIT + 1)).response);
    await expect(
      fetchPage(URL_UNDER_TEST, { skipFallback: true, maxRetries: 3 }),
    ).rejects.toThrow(ImageLimitError);
    expect(browserlessFetchMock, "an oversize refusal consumed a retry").toHaveBeenCalledTimes(1);
  });

  // ── the fallbacks that MUST still work ──
  it("POSITIVE CONTROL: a too-short plain response still falls through to Jina", async () => {
    plainTier(streamingResponseOf(Buffer.from("<html><body>tiny</body></html>"), {
      contentType: "text/html",
    }));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      streamingResponseOf(jinaBody(6_000)).response,
    );
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(6_000);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("POSITIVE CONTROL: a JS-challenge plain response still falls through", async () => {
    const challenge = Buffer.from(
      `<html><body>${"x".repeat(2500)} In order to continue, we need to verify that you're not a robot. Enable JavaScript and then reload the page.</body></html>`,
    );
    plainTier(streamingResponseOf(challenge, { contentType: "text/html" }));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      streamingResponseOf(jinaBody(6_000)).response,
    );
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(6_000);
  });

  it("POSITIVE CONTROL: a bot-gating 403 still falls through to Jina", async () => {
    safeFetchMock.mockResolvedValue(new Response("denied", { status: 403 }));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      streamingResponseOf(jinaBody(6_000)).response,
    );
    const r = await fetchPage(URL_UNDER_TEST);
    expect(r.html.length).toBe(6_000);
  });

  it("a small plain-fetch success short-circuits — no fallback at all", async () => {
    plainTier(streamingResponseOf(htmlOfBytes(8_000), { contentType: "text/html" }));
    await fetchPage(URL_UNDER_TEST);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });
});

// ─── Cache: bounded by bytes as well as entries ──────────────────────────────

describe("response cache byte accounting", () => {
  /** Cache one page of `bytes` at `url` via the plain-fetch tier. */
  async function cachePage(url: string, bytes: number): Promise<void> {
    plainTier(streamingResponseOf(htmlOfBytes(bytes), { contentType: "text/html" }));
    await fetchPage(url);
  }

  const stats = __webProviderCacheStatsForTests;

  it("accounts a single entry by its UTF-8 payload size", async () => {
    await cachePage("https://a.test/1", 10_000);
    expect(stats()).toEqual({ entries: 1, bytes: 10_000 });
  });

  it("evicts oldest-first on the ENTRY count, keeping bytes consistent", async () => {
    for (let i = 0; i < 205; i++) await cachePage(`https://a.test/${i}`, 3_000);
    const s = stats();
    expect(s.entries).toBe(200);
    expect(s.bytes).toBe(200 * 3_000);
  });

  it("evicts on the BYTE budget before the entry count is reached", async () => {
    // 40 x 2 MiB = 80 MiB > the 64 MiB budget, at only 40 entries.
    const twoMiB = 2 * 1024 * 1024;
    for (let i = 0; i < 40; i++) await cachePage(`https://b.test/${i}`, twoMiB);
    const s = stats();
    expect(s.entries, "byte budget did not bind before the entry cap").toBeLessThan(40);
    expect(s.bytes).toBeLessThanOrEqual(CACHE_BUDGET);
    expect(s.bytes).toBe(s.entries * twoMiB);
  });

  /**
   * Re-fetch a URL that IS cached, forcing the overwrite path.
   *
   * A plain second fetch would take the cache hit and never write, so it
   * proves nothing about overwrite accounting. The production route that
   * genuinely overwrites a live entry is minHtmlLength revalidation: a caller
   * whose bar is higher than the cached body's length treats the hit as a
   * miss, re-fetches, and writes over the entry that is still resident.
   */
  async function overwriteCached(url: string, newBytes: number, rejectShorterThan: number) {
    plainTier(streamingResponseOf(htmlOfBytes(newBytes), { contentType: "text/html" }));
    await fetchPage(url, { minHtmlLength: rejectShorterThan });
  }

  it("an overwrite replaces accounting rather than adding to it", async () => {
    await cachePage("https://c.test/x", 10_000);
    await overwriteCached("https://c.test/x", 10_000, 20_000);
    expect(stats()).toEqual({ entries: 1, bytes: 10_000 });
  });

  it("a SHRINKING overwrite lowers the total", async () => {
    await cachePage("https://c.test/y", 50_000);
    await overwriteCached("https://c.test/y", 5_000, 60_000);
    expect(stats()).toEqual({ entries: 1, bytes: 5_000 });
  });

  it("a GROWING overwrite raises the total by the difference only", async () => {
    await cachePage("https://c.test/z", 5_000);
    await overwriteCached("https://c.test/z", 50_000, 6_000);
    expect(stats()).toEqual({ entries: 1, bytes: 50_000 });
  });

  it("expiry removes the entry AND its bytes", async () => {
    await cachePage("https://d.test/1", 10_000);
    expect(stats().bytes).toBe(10_000);
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 6 * 60 * 1000);
    // A read past the TTL is what prunes the entry.
    plainTier(streamingResponseOf(htmlOfBytes(4_000), { contentType: "text/html" }));
    await fetchPage("https://d.test/1");
    expect(stats()).toEqual({ entries: 1, bytes: 4_000 });
  });

  it("an oversize refusal caches nothing and leaks no bytes", async () => {
    await cachePage("https://e.test/keep", 10_000);
    plainTier(streamingResponseOf(htmlOfBytes(LIMIT + 1), { contentType: "text/html" }));
    await expect(fetchPage("https://e.test/huge")).rejects.toThrow(ImageLimitError);
    expect(stats()).toEqual({ entries: 1, bytes: 10_000 });
  });

  it("a failed fetch caches nothing and leaks no bytes", async () => {
    await cachePage("https://f.test/keep", 10_000);
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchPage("https://f.test/gone")).rejects.toThrow(/HTTP 404/);
    expect(stats()).toEqual({ entries: 1, bytes: 10_000 });
  });

  it("INVARIANT: after every operation the total is non-negative and within budget", async () => {
    // Every size clears tier 1's own >2000-char content gate; a smaller one
    // would fall through to the unmocked lower tiers and test nothing here.
    const sizes = [5_000, 1024 * 1024, 20_000, 5 * 1024 * 1024, 3_000, 2 * 1024 * 1024];
    for (let i = 0; i < 60; i++) {
      // Deliberately reuses keys so overwrite paths are exercised too.
      await cachePage(`https://g.test/${i % 25}`, sizes[i % sizes.length]);
      const s = stats();
      expect(s.bytes).toBeGreaterThanOrEqual(0);
      expect(s.bytes).toBeLessThanOrEqual(CACHE_BUDGET);
      expect(s.entries).toBeLessThanOrEqual(200);
    }
  });

  it("skipCache writes nothing", async () => {
    plainTier(streamingResponseOf(htmlOfBytes(10_000), { contentType: "text/html" }));
    await fetchPage("https://h.test/1", { skipCache: true });
    expect(stats()).toEqual({ entries: 0, bytes: 0 });
  });
});

// ─── Failure taxonomy ────────────────────────────────────────────────────────

describe("failure taxonomy", () => {
  it("POSITIVE CONTROL: an oversize refusal is caller_input and floor-exempt", async () => {
    plainTier(streamingResponseOf(htmlOfBytes(LIMIT + 1), { contentType: "text/html" }));
    const err = await fetchPage(URL_UNDER_TEST).catch((e: Error) => e);
    const cls = classifyTransactionFailure((err as Error).message);
    expect(cls, `"${(err as Error).message}" classified ${cls}`).toBe("caller_input");
    expect(countsAgainstCapability(cls)).toBe(false);
  });

  it("the declared-length variant classifies the same way", () => {
    const cls = classifyTransactionFailure(
      "'url' must be a page whose HTML is 16.0MB or less (it declared 40.0MB).",
    );
    expect(cls).toBe("caller_input");
  });

  it("NEGATIVE CONTROL: an upstream 5xx is not rebadged caller_input", async () => {
    browserlessFetchMock.mockResolvedValue(new Response("boom", { status: 503 }));
    const err = await fetchPage(URL_UNDER_TEST, { skipFallback: true }).catch((e: Error) => e);
    expect(classifyTransactionFailure((err as Error).message)).not.toBe("caller_input");
  });

  it("NEGATIVE CONTROL: an anti-bot challenge at tier 3 is not rebadged caller_input", async () => {
    const challenge = Buffer.from(
      `<html><body>${"x".repeat(300)} Checking your browser before accessing example.test</body></html>`,
    );
    browserlessFetchMock.mockResolvedValue(streamingResponseOf(challenge).response);
    const err = await fetchPage(URL_UNDER_TEST, { skipFallback: true }).catch((e: Error) => e);
    expect(classifyTransactionFailure((err as Error).message)).not.toBe("caller_input");
  });
});
