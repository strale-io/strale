/**
 * Regression tests for routing web-extract through the shared web-provider
 * layer (T0.3 investigation, 2026-08-16).
 *
 * Before this fix, web-extract called Browserless with a bare `fetch()`:
 * one attempt, no retry, no backoff, no cache — unlike the other 47+
 * Browserless-backed capabilities, which all go through
 * `lib/web-provider.ts` and get exponential-backoff retry, a 5-minute
 * response cache, and a concurrency limiter for free. Real customer
 * failures in the 14 days before the fix were navigation timeouts and
 * transient HTTP 429s that a retry would likely have absorbed, each
 * billed against the customer's error budget.
 *
 * These tests exercise the real `web-provider.ts` retry/cache machinery
 * (only `@anthropic-ai/sdk` and `url-validator.js` are mocked) so they
 * assert the actual wiring, not a mocked-away stand-in. All three fail
 * against the pre-fix bare-fetch executor and pass against the fix —
 * see the handoff report for the fail-before verification transcript.
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

const RENDERED_HTML = `<html><head><title>Example Domain</title></head><body>${"Real page content. ".repeat(20)}</body></html>`;

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

  it("recovers from a transient 429 via the shared retry layer (bare fetch had exactly one attempt and would have failed here)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));

    const result = await exec()({
      url: "https://example.com/retry-test",
      extract: "headline",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.output.page_title).toBe("Example Domain");
    expect(result.output.data).toMatchObject({ headline: "hi" });
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
    expect(second.output.page_title).toBe(first.output.page_title);
    expect(second.output.page_title).toBe("Example Domain");
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
