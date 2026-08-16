/**
 * Regression tests for routing web-extract through the shared web-provider
 * layer (T0.3 investigation, 2026-08-16), plus fixes from the external
 * (Codex) review of that change (2026-08-16).
 *
 * Before the original fix, web-extract called Browserless with a bare
 * `fetch()`: one attempt, no retry, no backoff, no cache — unlike the other
 * 47+ Browserless-backed capabilities, which all go through
 * `lib/web-provider.ts` and get exponential-backoff retry, a 5-minute
 * response cache, and a concurrency limiter for free. Real customer
 * failures in the 14 days before the fix were navigation timeouts and
 * transient HTTP 429s that a retry would likely have absorbed, each
 * billed against the customer's error budget.
 *
 * These tests exercise the real `web-provider.ts` retry/cache machinery
 * (only `@anthropic-ai/sdk` and `url-validator.js` are mocked) so they
 * assert the actual wiring, not a mocked-away stand-in. See the handoff
 * report for the fail-before verification transcript for each test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

// Avoid real DNS lookups in the shared layer's SSRF check (same pattern as
// screenshot-url.test.ts) — the URLs below are fake test hosts.
vi.mock("../lib/url-validator.js", () => ({ validateUrl: vi.fn(async () => {}) }));

import { getDirectExecutor } from "./index.js";
import "./web-extract.js";
import { fetchRenderedHtml } from "./lib/web-provider.js";

const RENDERED_HTML = `<html><head><title>Example Domain</title></head><body>${"Real page content. ".repeat(20)}</body></html>`;

/** Assert a captured global-fetch call was a POST to Browserless's /content endpoint. */
function expectBrowserlessContentPost(call: unknown[]): void {
  const [reqUrl, init] = call as [string, RequestInit];
  expect(String(reqUrl)).toContain("chromium.test");
  expect(String(reqUrl)).toContain("/content");
  expect(init?.method).toBe("POST");
}

describe("web-extract shared resilience", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.BROWSERLESS_URL = "https://chromium.test";
    process.env.BROWSERLESS_API_KEY = "test-token";
    process.env.ANTHROPIC_API_KEY = "test-key";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    messagesCreate.mockReset();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"headline":"hi"}' }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("web-extract")!;

  it("recovers from a transient 429 via the shared retry layer, and every retry actually hits Browserless (bare fetch had exactly one attempt and would have failed here)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));

    const result = await exec()({
      url: "https://example.com/retry-test",
      extract: "headline",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // External review finding 5: counting fetch calls alone doesn't prove
    // the retry hit Browserless — it would also pass if the first call were
    // misrouted through a fallback tier. Pin every call to the real
    // Browserless /content POST endpoint.
    for (const call of fetchMock.mock.calls) {
      expectBrowserlessContentPost(call);
    }
    expect(result.output.page_title).toBe("Example Domain");
    expect(result.output.data).toMatchObject({ headline: "hi" });
  }, 10000);

  it("recovers from a transient 408 (request timeout) via the shared retry layer (external review finding 2: 408 was missing from the transient classification)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("nav timeout", { status: 408 }))
      .mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));

    const result = await exec()({
      url: "https://example.com/408-retry-test",
      extract: "headline",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expectBrowserlessContentPost(call);
    }
    expect(result.output.page_title).toBe("Example Domain");
  }, 10000);

  it("serves a repeat render of the same URL from the shared TTL cache — one upstream call for two capability calls (bare fetch had no cache and would call Browserless twice)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));

    const first = await exec()({
      url: "https://example.com/cache-test",
      extract: "headline",
    });
    const second = await exec()({
      url: "https://example.com/cache-test",
      extract: "headline",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectBrowserlessContentPost(fetchMock.mock.calls[0]);
    expect(second.output.page_title).toBe(first.output.page_title);
    expect(second.output.page_title).toBe("Example Domain");
  }, 10000);

  it("keeps the skipFallback cache namespace separate from the fallback-tier namespace — a plain-fetch-warmed entry for the same URL is never read by web-extract (external review finding 1, BLOCKER)", async () => {
    const url = "https://example.com/shared-cache-test";
    const PLAIN_FETCH_HTML = `<html><head><title>Plain Fetch Version</title></head><body>${"Plain-fetch content, definitely not what Browserless would render. ".repeat(
      40,
    )}</body></html>`;

    // Warm the cache via a NON-skipFallback call — this is served by tier 1
    // (plain fetch through safeFetch, which also goes through the stubbed
    // global fetch), not Browserless.
    fetchMock.mockResolvedValueOnce(
      new Response(PLAIN_FETCH_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const warmed = await fetchRenderedHtml(url);
    expect(warmed).toContain("Plain Fetch Version");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // That one call must NOT have been a Browserless render — confirms the
    // warm-up really went through the fallback tier, not tier 3.
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/content");

    // web-extract (skipFallback: true) requests the SAME url. Pre-fix, the
    // single URL-keyed cache would return the plain-fetch HTML above with
    // zero further fetch calls — silently violating web-extract's "full
    // JavaScript rendering" contract. Post-fix, the namespaces are disjoint,
    // so this must make its own Browserless render.
    fetchMock.mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));
    const result = await exec()({ url, extract: "headline" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectBrowserlessContentPost(fetchMock.mock.calls[1]);
    expect(result.output.page_title).toBe("Example Domain");
    expect(result.output.page_title).not.toBe("Plain Fetch Version");
  }, 10000);

  it("accepts a Browserless render between 50 and 100 bytes — web-extract's pre-existing 50-byte floor is preserved via minHtmlLength, not silently tightened to the shared layer's default of 100 (external review finding 4)", async () => {
    // 74 bytes: >= web-extract's historical 50-byte floor, < the shared
    // layer's default 100-byte floor.
    const shortButValid = `<html><title>Hi</title><body>${"x".repeat(30)}</body></html>`;
    expect(shortButValid.length).toBeGreaterThanOrEqual(50);
    expect(shortButValid.length).toBeLessThan(100);

    fetchMock.mockResolvedValueOnce(new Response(shortButValid, { status: 200 }));

    const result = await exec()({
      url: "https://example.com/short-content-test",
      extract: "headline",
    });

    // A single attempt succeeds — the shared default would have rejected
    // this as "too short", retried once, and thrown.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.output.page_title).toBe("Hi");
  }, 10000);

  it("maps a permanent Browserless failure (404) to a structured, human-readable error with no raw response body embedded (bare fetch spliced up to 200 raw chars of the body straight into the thrown message)", async () => {
    const rawErrorBody = `<html><body><h1>Not Found</h1><p>${"filler text ".repeat(30)}</p></body></html>`;
    fetchMock.mockResolvedValueOnce(new Response(rawErrorBody, { status: 404 }));

    let message = "";
    await exec()({ url: "https://example.com/missing-page", extract: "headline" }).catch(
      (err: unknown) => {
        message = err instanceof Error ? err.message : String(err);
      },
    );

    expect(message).toBeTruthy();
    // No raw HTML/markup leaked into the error — this is the exact shape
    // the pre-fix `errText.slice(0, 200)` splice used to produce.
    expect(message).not.toMatch(/<html|<body|<h1|<p>|filler text/i);
    expect(message).toMatch(/404/);
    // 404 is not a transient status — the shared layer does not retry it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 10000);
});
