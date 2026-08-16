/**
 * Regression tests for routing web-extract through the shared web-provider
 * layer (T0.3 investigation, 2026-08-16), plus fixes from two review rounds
 * on that change (external/Codex review, then a six-lens review round;
 * both 2026-08-16).
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
 *
 * web-extract is a live-fetch capability (manifest: freshness_category:
 * live-fetch) and opts OUT of the shared cache entirely (skipCache: true —
 * see web-extract.ts). A cache hit would return HTML rendered up to 5
 * minutes earlier stamped with a fresh `provenance.fetched_at`, i.e.
 * fabricated provenance (six-lens review, HIGH). Because of that, tests
 * that exercise cache BEHAVIOR (namespace isolation, minHtmlLength
 * revalidation on hit) call `fetchRenderedHtml`/`fetchPage` directly rather
 * than through the web-extract executor, which never reads or writes the
 * cache.
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
import { fetchPage, fetchRenderedHtml } from "./lib/web-provider.js";

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

  it("never caches — two identical web-extract calls make two independent Browserless renders (six-lens review, HIGH: a cache hit would fabricate provenance.fetched_at on a live-fetch capability)", async () => {
    const FIRST_RENDER = `<html><head><title>Example Domain</title></head><body>${"First render. ".repeat(30)}</body></html>`;
    const SECOND_RENDER = `<html><head><title>Example Domain</title></head><body>${"Second render, different bytes. ".repeat(30)}</body></html>`;
    fetchMock
      .mockResolvedValueOnce(new Response(FIRST_RENDER, { status: 200 }))
      .mockResolvedValueOnce(new Response(SECOND_RENDER, { status: 200 }));

    const first = await exec()({
      url: "https://example.com/no-cache-test",
      extract: "headline",
    });
    const second = await exec()({
      url: "https://example.com/no-cache-test",
      extract: "headline",
    });

    // Pre-fix (cache enabled), this would be 1 call and both provenance
    // timestamps would describe the SAME render — the second one lying
    // about when its (stale) HTML was actually fetched.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectBrowserlessContentPost(fetchMock.mock.calls[0]);
    expectBrowserlessContentPost(fetchMock.mock.calls[1]);
    expect(first.provenance.fetched_at).toBeTruthy();
    expect(second.provenance.fetched_at).toBeTruthy();
  }, 10000);

  it("keeps the skipFallback cache namespace separate from the fallback-tier namespace at the shared-layer level (external review finding 1, BLOCKER — driven via direct fetchRenderedHtml calls per six-lens review, since web-extract itself no longer reads/writes cache)", async () => {
    const url = "https://example.com/shared-cache-test";
    const PLAIN_FETCH_HTML = `<html><head><title>Plain Fetch Version</title></head><body>${"Plain-fetch content, definitely not what Browserless would render. ".repeat(
      40,
    )}</body></html>`;

    // Warm the cache via a NON-skipFallback call — served by tier 1 (plain
    // fetch through safeFetch, which also goes through the stubbed global
    // fetch), not Browserless. Lands in the "default:networkidle0" namespace.
    fetchMock.mockResolvedValueOnce(
      new Response(PLAIN_FETCH_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const warmed = await fetchRenderedHtml(url);
    expect(warmed).toContain("Plain Fetch Version");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/content");

    // A skipFallback caller for the SAME url, called directly against the
    // shared layer (not through web-extract). Pre-fix, the single
    // URL-keyed cache would return the plain-fetch HTML above with zero
    // further fetch calls. Post-fix, the namespaces are disjoint, so this
    // must make its own Browserless render.
    fetchMock.mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));
    const rendered = await fetchRenderedHtml(url, { skipFallback: true, maxRetries: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectBrowserlessContentPost(fetchMock.mock.calls[1]);
    expect(rendered).toContain("Example Domain");
    expect(rendered).not.toContain("Plain Fetch Version");
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

  it("a cache hit shorter than the caller's minHtmlLength is treated as a miss, not silently handed back (six-lens review, Medium 3)", async () => {
    const url = "https://example.com/min-length-cache-test";
    const shortHtml = "<html>short</html>"; // 19 bytes

    // A caller with a loose minHtmlLength (10) renders and caches 19 bytes
    // under the "skipFallback:networkidle0" namespace.
    fetchMock.mockResolvedValueOnce(new Response(shortHtml, { status: 200 }));
    const first = await fetchRenderedHtml(url, {
      skipFallback: true,
      maxRetries: 1,
      minHtmlLength: 10,
    });
    expect(first).toBe(shortHtml);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second caller in the SAME namespace needs at least 100 bytes. Pre-fix,
    // getCached() would hand back the 19-byte entry regardless — a value
    // this caller would have rejected from a live response. Post-fix, the
    // stale-short hit is treated as a miss and a fresh render happens.
    fetchMock.mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 }));
    const second = await fetchRenderedHtml(url, {
      skipFallback: true,
      maxRetries: 1,
      minHtmlLength: 100,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectBrowserlessContentPost(fetchMock.mock.calls[1]);
    expect(second).toContain("Example Domain");
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

  it("the generic-status branch never echoes upstream body content into the message — no secrets/tokens/markup can leak (six-lens review, HIGH, round 3: a denylist sanitizer cannot be made secret-safe, so the appended-detail approach was removed entirely)", async () => {
    const bodyWithSecrets =
      `<html><body><script>alert(1)</script>Bearer sk_live_FAKESECRETTOKEN1234 ` +
      `net::ERR_CERT_FAKE_SECRET_IN_TOKEN ` +
      `signed_url=https://internal.example/secret?token=abc123 ${"padding ".repeat(20)}</body></html>`;
    fetchMock.mockResolvedValueOnce(new Response(bodyWithSecrets, { status: 422 }));

    let message = "";
    await fetchPage("https://example.com/no-body-leak-test", {
      skipFallback: true,
      maxRetries: 1,
    }).catch((err: unknown) => {
      message = err instanceof Error ? err.message : String(err);
    });

    expect(message).toContain("422");
    // Fixed string, status only — none of the upstream body survives.
    expect(message).not.toMatch(/sk_live_FAKESECRETTOKEN1234/);
    expect(message).not.toMatch(/ERR_CERT_FAKE_SECRET_IN_TOKEN/);
    expect(message).not.toMatch(/internal\.example/);
    expect(message).not.toMatch(/token=abc123/);
    expect(message).not.toMatch(/<script|<html|<body|padding/i);
  }, 10000);

  it("pins the retry count to exactly maxRetries attempts — two failing transient (non-net-error) responses make exactly 2 calls then throw (six-lens review, LOW coverage gap a)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("server error 1", { status: 500 }))
      .mockResolvedValueOnce(new Response("server error 2", { status: 500 }));

    let message = "";
    await fetchPage("https://example.com/two-attempts-pin-test", {
      skipFallback: true,
      // default maxRetries = 2
    }).catch((err: unknown) => {
      message = err instanceof Error ? err.message : String(err);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(message).toMatch(/HTTP 500/);
    expect(message).toMatch(/usually transient/i);
  }, 10000);

  it("maps a Browserless net-error (ERR_NAME_NOT_RESOLVED) to a non-retryable message with exactly 1 call, not the 5xx 'usually transient' framing (six-lens review, Medium 2b + retry-site fix)", async () => {
    const netErrorBody = "net::ERR_NAME_NOT_RESOLVED at https://this-domain-does-not-exist.invalid/";
    fetchMock.mockResolvedValueOnce(new Response(netErrorBody, { status: 502 }));

    let message = "";
    await fetchPage("https://example.com/net-error-test", {
      skipFallback: true,
      // default maxRetries = 2 — proves the net-error short-circuits the
      // retry budget rather than merely being the only attempt available.
    }).catch((err: unknown) => {
      message = err instanceof Error ? err.message : String(err);
    });

    // Retrying was NOT attempted, even though the retry budget allowed it —
    // this is what makes "retrying will not help" true.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(message).toMatch(/does not resolve/i);
    expect(message).toMatch(/retrying will not help/i);
    expect(message).not.toMatch(/usually transient/i);
  }, 10000);

  it("maps a Browserless connection-refused net-error to a non-retryable message with exactly 1 call (six-lens review, Medium 2b + retry-site fix)", async () => {
    const netErrorBody = "net::ERR_CONNECTION_REFUSED";
    fetchMock.mockResolvedValueOnce(new Response(netErrorBody, { status: 502 }));

    let message = "";
    await fetchPage("https://example.com/net-error-refused-test", {
      skipFallback: true,
      // default maxRetries = 2
    }).catch((err: unknown) => {
      message = err instanceof Error ? err.message : String(err);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(message).toMatch(/connection.*refused/i);
    expect(message).toMatch(/retrying will not help/i);
    expect(message).not.toMatch(/usually transient/i);
  }, 10000);

  it("maps a Browserless TLS-certificate net-error to the permanent (non-retryable) path with exactly 1 call (six-lens review, LOW coverage gap b)", async () => {
    const certErrorBody = "net::ERR_CERT_AUTHORITY_INVALID";
    fetchMock.mockResolvedValueOnce(new Response(certErrorBody, { status: 502 }));

    let message = "";
    await fetchPage("https://example.com/cert-error-test", {
      skipFallback: true,
      // default maxRetries = 2
    }).catch((err: unknown) => {
      message = err instanceof Error ? err.message : String(err);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(message).toMatch(/TLS certificate is invalid/i);
    // Round-5 review HIGH: the matched ERR_CERT_* token is body-controlled
    // and must NOT be echoed — the message is a fixed string.
    expect(message).not.toMatch(/ERR_CERT_AUTHORITY_INVALID/);
    expect(message).toMatch(/retrying will not help/i);
    expect(message).not.toMatch(/usually transient/i);
  }, 10000);

  it("a 429 whose body mentions a net-error token still gets its retry — the permanent-failure short-circuit is scoped to 5xx (round-5 review, MEDIUM)", async () => {
    const RENDERED_HTML = `<html><head><title>Recovered After 429</title></head><body>${"Recovered content after a rate-limited first attempt. ".repeat(30)}</body></html>`;
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate limited — see also net::ERR_NAME_NOT_RESOLVED docs", { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response(RENDERED_HTML, { status: 200, headers: { "content-type": "text/html" } }),
      );

    const result = await fetchPage("https://example.com/scoped-shortcircuit-test", {
      skipFallback: true,
    });

    // 429 keeps its own retry semantics regardless of body text.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.html).toContain("Recovered After 429");
  }, 10000);

  it("a cache-enabled call in web-extract's own namespace still fetches fresh after two web-extract calls — proving skipCache suppressed the writes, not just the reads (round-5 review, LOW)", async () => {
    const url = "https://example.com/no-cache-writeback-test";

    fetchMock
      .mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 })) // web-extract call 1
      .mockResolvedValueOnce(new Response(RENDERED_HTML, { status: 200 })); // web-extract call 2

    await exec()({ url, extract: "headline" });
    await exec()({ url, extract: "headline" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Round-5 review LOW: to prove web-extract WROTE nothing, the probe must
    // read from the SAME namespace web-extract's calls would have written to
    // (skipFallback + networkidle0) — a different-namespace probe would fetch
    // fresh even if web-extract had polluted its own namespace. This is a
    // cache-enabled direct call in that exact namespace: a cache hit here
    // would mean web-extract's skipCache leaked a write.
    const FRESH_RENDER_HTML = `<html><head><title>Fresh Same-Namespace Render</title></head><body>${"Fresh render proving the namespace holds no entry from web-extract. ".repeat(
      40,
    )}</body></html>`;
    fetchMock.mockResolvedValueOnce(
      new Response(FRESH_RENDER_HTML, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const third = await fetchPage(url, { skipFallback: true, waitUntil: "networkidle0" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(third.html).toContain("Fresh Same-Namespace Render");
    expect(third.cached).toBe(false);
  }, 10000);

  it("appends 'Retrying will not help.' to the 403 message for consistency with the other permanent-failure statuses (six-lens review, LOW)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    let message = "";
    await fetchPage("https://example.com/forbidden-test", {
      skipFallback: true,
      maxRetries: 1,
    }).catch((err: unknown) => {
      message = err instanceof Error ? err.message : String(err);
    });

    expect(message).toMatch(/403/);
    expect(message).toMatch(/Retrying will not help\./);
  }, 10000);
});
