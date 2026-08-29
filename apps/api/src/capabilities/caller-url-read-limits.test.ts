/**
 * #432 — the 20 caller-URL capabilities the #428 ledger recorded but did not
 * bound, plus the readers added for the media classes they needed.
 *
 * Two layers, because either alone is weak. The reader matrix pins the
 * enforcement semantics (boundary, lying declaration, cancellation, what a
 * truncating read keeps); the per-capability layer pins that each capability
 * actually goes through a bounded reader — a swap that got missed would leave
 * the reader tests green and the capability unbounded.
 *
 * Sizes are streamed, never allocated: `streamingResponse` enqueues views over
 * one shared zero page, so a 50 MB sitemap boundary costs no more memory than
 * a 4 KiB one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, fetchViaJina, fetchRenderedHtml } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  fetchViaJina: vi.fn(),
  fetchRenderedHtml: vi.fn(),
}));

// url-to-markdown's tiers 2 and 3. Mocked so "layer 1 refused and stopped" is
// observable — see the cascade test below.
vi.mock("./lib/jina-reader.js", () => ({ fetchViaJina }));
vi.mock("./lib/browserless-extract.js", () => ({ fetchRenderedHtml }));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  // Keep discardBody real — paid-api-preflight's whole fix is that it cancels
  // the stream, and a stubbed no-op would make that test prove nothing.
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));

vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));

import { getDirectExecutor } from "./index.js";
import {
  MAX_FETCHED_API_RESPONSE_BYTES,
  MAX_FETCHED_HTML_BYTES,
  MAX_FETCHED_ROBOTS_BYTES,
  MAX_FETCHED_SITEMAP_BYTES,
  MAX_SCRAPED_CONTACT_BYTES,
  readJsonWithLimit,
  readRobotsTxt,
  readSitemapXml,
  readTextTruncated,
  ResourceLimitError,
} from "../lib/resource-limits.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";
import { streamingResponse, streamingResponseOf } from "./lib/streaming-response-testutil.js";

import "./url-to-markdown.js";
import "./url-to-text.js";
import "./meta-extract.js";
import "./link-extract.js";
import "./tech-stack-detect.js";
import "./og-image-check.js";
import "./gdpr-website-check.js";
import "./job-posting-analyze.js";
import "./domain-contact-extract.js";
import "./social-post-generate.js";
import "./robots-txt-parse.js";
import "./sitemap-parse.js";
import "./api-health-check.js";
import "./paid-api-preflight.js";
import "./page-exists.js";
import "./phishing-site-check.js";

const HTML = (bytes: number) =>
  Buffer.from(`<html><head><title>t</title></head><body>${"word ".repeat(bytes / 5)}</body></html>`);

beforeEach(() => {
  safeFetchMock.mockReset();
  fetchViaJina.mockReset();
  fetchRenderedHtml.mockReset();
  fetchViaJina.mockResolvedValue(null);
  fetchRenderedHtml.mockResolvedValue(HTML(20_000).toString());
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Reader matrix ───────────────────────────────────────────────────────────

describe("readSitemapXml — refuse at the protocol maximum", () => {
  it("accepts a body one byte under the limit", async () => {
    const { response } = streamingResponse(MAX_FETCHED_SITEMAP_BYTES - 1);
    await expect(readSitemapXml(response)).resolves.toHaveLength(MAX_FETCHED_SITEMAP_BYTES - 1);
  });

  it("accepts a body exactly at the limit", async () => {
    const { response } = streamingResponse(MAX_FETCHED_SITEMAP_BYTES);
    await expect(readSitemapXml(response)).resolves.toHaveLength(MAX_FETCHED_SITEMAP_BYTES);
  });

  it("refuses a body one byte over the limit", async () => {
    const { response } = streamingResponse(MAX_FETCHED_SITEMAP_BYTES + 1);
    await expect(readSitemapXml(response)).rejects.toThrow(/must be a sitemap whose XML is 50\.0MB or less/);
  });

  it("refuses on an over-limit declaration without pulling the body", async () => {
    const h = streamingResponse(1024, { declare: MAX_FETCHED_SITEMAP_BYTES + 1 });
    await expect(readSitemapXml(h.response)).rejects.toThrow(ResourceLimitError);
    expect(h.pulls()).toBe(0);
    expect(h.cancelled()).toBe(true);
  });

  it("refuses on actual bytes when the declaration lies small", async () => {
    const h = streamingResponse(MAX_FETCHED_SITEMAP_BYTES + 65_536, { declare: 200 });
    await expect(readSitemapXml(h.response)).rejects.toThrow(ResourceLimitError);
    expect(h.cancelled()).toBe(true);
  });

  it("refuses on actual bytes with no declaration at all", async () => {
    const h = streamingResponse(MAX_FETCHED_SITEMAP_BYTES + 65_536);
    await expect(readSitemapXml(h.response)).rejects.toThrow(ResourceLimitError);
    expect(h.cancelled()).toBe(true);
  });
});

describe("readRobotsTxt / readTextTruncated — keep the prefix, do not refuse", () => {
  it("returns a short file whole", async () => {
    const { response } = streamingResponseOf(Buffer.from("User-agent: *\nDisallow: /x\n"));
    await expect(readRobotsTxt(response)).resolves.toBe("User-agent: *\nDisallow: /x\n");
  });

  it("returns exactly the limit for a file at the limit", async () => {
    const { response } = streamingResponse(MAX_FETCHED_ROBOTS_BYTES);
    await expect(readRobotsTxt(response)).resolves.toHaveLength(MAX_FETCHED_ROBOTS_BYTES);
  });

  it("truncates one byte over the limit rather than throwing", async () => {
    const h = streamingResponse(MAX_FETCHED_ROBOTS_BYTES + 1);
    await expect(readRobotsTxt(h.response)).resolves.toHaveLength(MAX_FETCHED_ROBOTS_BYTES);
    expect(h.cancelled()).toBe(true);
  });

  it("truncates a hugely oversized file and stops pulling", async () => {
    const h = streamingResponse(MAX_FETCHED_ROBOTS_BYTES * 20);
    await expect(readRobotsTxt(h.response)).resolves.toHaveLength(MAX_FETCHED_ROBOTS_BYTES);
    // 500 KiB in 64 KiB chunks — eight pulls, the last one cut at the cap —
    // out of a body 20x that size. Not one pull more.
    expect(h.pulls()).toBe(Math.ceil(MAX_FETCHED_ROBOTS_BYTES / (64 * 1024)));
  });

  it("ignores an over-limit declaration — a declaration cannot refuse a truncating read", async () => {
    const h = streamingResponse(4096, { declare: MAX_FETCHED_ROBOTS_BYTES * 99 });
    await expect(readRobotsTxt(h.response)).resolves.toHaveLength(4096);
    expect(h.pulls()).toBeGreaterThan(0);
  });

  it("honours a caller-chosen cap (the contact scrapers' 300 KB)", async () => {
    const h = streamingResponse(MAX_SCRAPED_CONTACT_BYTES + 100_000);
    await expect(readTextTruncated(h.response, MAX_SCRAPED_CONTACT_BYTES)).resolves.toHaveLength(
      MAX_SCRAPED_CONTACT_BYTES,
    );
  });
});

describe("readJsonWithLimit — bound the bytes, then parse", () => {
  it("parses a normal payload", async () => {
    const { response } = streamingResponseOf(Buffer.from('{"ok":true,"n":2}'));
    await expect(readJsonWithLimit(response)).resolves.toEqual({ ok: true, n: 2 });
  });

  it("accepts a payload exactly at the limit", async () => {
    // `[` + N-2 spaces + `]` — valid JSON, exactly MAX bytes.
    const body = Buffer.from(`[${" ".repeat(MAX_FETCHED_API_RESPONSE_BYTES - 2)}]`);
    const { response } = streamingResponseOf(body);
    await expect(readJsonWithLimit(response)).resolves.toEqual([]);
  });

  it("refuses one byte over the limit", async () => {
    const { response } = streamingResponse(MAX_FETCHED_API_RESPONSE_BYTES + 1);
    await expect(readJsonWithLimit(response)).rejects.toThrow(
      /must be an endpoint whose response is 4\.0MB or less/,
    );
  });

  it("never reaches the parser once the cap is crossed", async () => {
    // The bytes are valid JSON; the failure must still be the size refusal,
    // which proves the read is bounded BEFORE JSON.parse rather than after.
    const spy = vi.spyOn(JSON, "parse");
    const { response } = streamingResponse(MAX_FETCHED_API_RESPONSE_BYTES + 65_536);
    await expect(readJsonWithLimit(response)).rejects.toThrow(ResourceLimitError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("preserves malformed-payload semantics — SyntaxError, same as response.json()", async () => {
    const { response } = streamingResponseOf(Buffer.from("<html>not json</html>"));
    await expect(readJsonWithLimit(response)).rejects.toThrow(SyntaxError);
  });

  it("refuses an over-limit declaration without pulling", async () => {
    const h = streamingResponse(64, { declare: MAX_FETCHED_API_RESPONSE_BYTES + 1 });
    await expect(readJsonWithLimit(h.response)).rejects.toThrow(ResourceLimitError);
    expect(h.pulls()).toBe(0);
    expect(h.cancelled()).toBe(true);
  });
});

// ─── Per-capability: the HTML class ──────────────────────────────────────────

/**
 * Each entry drives the real executor. The oversized case must reject with a
 * size refusal, and the normal case must still succeed — a bound that also
 * breaks the working path is not a fix.
 */
const HTML_CAPABILITIES: Array<{ slug: string; inputs: Record<string, unknown> }> = [
  { slug: "url-to-text", inputs: { url: "https://example.test/a" } },
  { slug: "url-to-markdown", inputs: { url: "https://example.test/a" } },
  { slug: "meta-extract", inputs: { url: "https://example.test/a" } },
  { slug: "link-extract", inputs: { url: "https://example.test/a" } },
  { slug: "tech-stack-detect", inputs: { url: "https://example.test/a" } },
  { slug: "og-image-check", inputs: { url: "https://example.test/a" } },
  { slug: "gdpr-website-check", inputs: { url: "https://example.test/a" } },
  { slug: "job-posting-analyze", inputs: { url: "https://example.test/a" } },
  { slug: "social-post-generate", inputs: { url: "https://example.test/a" } },
];

describe("HTML capabilities refuse an oversized page", () => {
  it.each(HTML_CAPABILITIES)("$slug", async ({ slug, inputs }) => {
    safeFetchMock.mockImplementation(async () => {
      const { response } = streamingResponse(MAX_FETCHED_HTML_BYTES + 65_536, {
        contentType: "text/html",
      });
      return response;
    });
    const executor = getDirectExecutor(slug);
    expect(executor, `${slug} is not registered`).toBeDefined();
    const err = await executor!(inputs).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, `${slug} did not refuse an oversized page`).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/must be a page whose HTML is 16\.0MB or less/);
  });
});

describe("url-to-markdown — the priority path", () => {
  /**
   * The reason this capability was named first in the work package: it is
   * free-tier and anonymous-reachable, and after #428 its Jina and Browserless
   * legs were bounded while its own layer-1 read was not. Same request, same
   * page, opposite postures depending on which tier answered.
   */
  it("bounds the layer-1 static read", async () => {
    safeFetchMock.mockResolvedValue(
      streamingResponse(MAX_FETCHED_HTML_BYTES + 65_536, { contentType: "text/html" }).response,
    );
    await expect(getDirectExecutor("url-to-markdown")!({ url: "https://example.test/a" })).rejects.toThrow(
      /must be a page whose HTML is 16\.0MB or less/,
    );
  });

  it("does not re-fetch the refused page through Jina or Browserless", async () => {
    // Oversize is TERMINAL. Without the re-throw in tryPlainFetch's catch, the
    // refusal is swallowed as "layer 1 found nothing" and the same oversized
    // page is fetched twice more — and the final error message is identical,
    // which is why this asserts on the tiers rather than on the message.
    safeFetchMock.mockResolvedValue(
      streamingResponse(MAX_FETCHED_HTML_BYTES + 65_536, { contentType: "text/html" }).response,
    );
    await getDirectExecutor("url-to-markdown")!({ url: "https://example.test/a" }).catch(() => undefined);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(fetchViaJina).not.toHaveBeenCalled();
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("still falls through to the next tier for a page that is merely thin", async () => {
    // The positive control for the test above: a short page is a legitimate
    // reason to escalate, and must remain one.
    safeFetchMock.mockResolvedValue(
      streamingResponseOf(Buffer.from("<html><body>hi</body></html>"), {
        contentType: "text/html",
      }).response,
    );
    await getDirectExecutor("url-to-markdown")!({ url: "https://example.test/a" }).catch(() => undefined);
    expect(fetchViaJina).toHaveBeenCalled();
  });
});

describe("HTML capabilities still handle a normal page", () => {
  it.each(HTML_CAPABILITIES.filter((c) => !["job-posting-analyze", "social-post-generate"].includes(c.slug)))(
    "$slug",
    async ({ slug, inputs }) => {
      safeFetchMock.mockImplementation(async () => {
        const { response } = streamingResponseOf(HTML(20_000), { contentType: "text/html" });
        return response;
      });
      const executor = getDirectExecutor(slug)!;
      const result = await executor(inputs).catch((e: Error) => e);
      // The two LLM-backed capabilities are excluded above: they would call
      // Anthropic on the happy path, which this suite must not do.
      expect(result, `${slug} broke on a normal page`).not.toBeInstanceOf(Error);
      // Not merely "did not throw" — it produced an answer. Without this the
      // control would pass on any non-Error value, including undefined.
      expect(result, `${slug} returned no output`).toHaveProperty("output");
    },
  );
});

describe("an upstream failure is reported as itself, not as a size problem", () => {
  it.each(HTML_CAPABILITIES)("$slug", async ({ slug, inputs }) => {
    safeFetchMock.mockImplementation(
      async () => new Response("upstream is unwell", { status: 503, headers: { "content-type": "text/html" } }),
    );
    const err = await getDirectExecutor(slug)!(inputs).then(
      () => null,
      (e: unknown) => e,
    );
    // Two of these treat an unusable page as "no content" rather than as an
    // error, so a null result is legitimate here. What must never happen is a
    // 503 being reported as a size problem.
    if (err) expect((err as Error).message).not.toMatch(/or less/);
    expect(safeFetchMock).toHaveBeenCalled();
  });
});

// ─── Per-capability: the media classes ───────────────────────────────────────

describe("robots-txt-parse truncates rather than refusing", () => {
  it("parses the first 500 KiB of an oversized robots.txt", async () => {
    const padding = "# ".repeat(MAX_FETCHED_ROBOTS_BYTES); // ~1 MiB of comments
    const body = Buffer.from(`User-agent: *\nDisallow: /private\nSitemap: https://x.test/s.xml\n${padding}`);
    safeFetchMock.mockResolvedValue(streamingResponseOf(body).response);
    const out = (await getDirectExecutor("robots-txt-parse")!({ url: "https://example.test" })) as {
      output: Record<string, unknown>;
    };
    expect(out.output.exists).toBe(true);
    expect(out.output.sitemaps).toEqual(["https://x.test/s.xml"]);
  });
});

describe("sitemap-parse refuses above the protocol maximum", () => {
  it("accepts a large but legal sitemap", async () => {
    const entry = "<url><loc>https://example.test/page</loc></url>";
    const body = Buffer.from(`<?xml version="1.0"?><urlset>${entry.repeat(20_000)}</urlset>`);
    safeFetchMock.mockResolvedValue(streamingResponseOf(body).response);
    const out = (await getDirectExecutor("sitemap-parse")!({ url: "https://example.test/sitemap.xml" })) as {
      output: Record<string, unknown>;
    };
    expect(out.output.total_urls).toBe(20_000);
  });

  it("refuses an over-limit sitemap", async () => {
    safeFetchMock.mockResolvedValue(streamingResponse(MAX_FETCHED_SITEMAP_BYTES + 65_536).response);
    await expect(
      getDirectExecutor("sitemap-parse")!({ url: "https://example.test/sitemap.xml" }),
    ).rejects.toThrow(/sitemap whose XML is 50\.0MB or less/);
  });

  it("never reaches the XML parse once refused", async () => {
    // A body that WOULD parse to 1 URL if it were read — the refusal has to
    // win, so `total_urls` must never be produced.
    safeFetchMock.mockResolvedValue(streamingResponse(MAX_FETCHED_SITEMAP_BYTES + 1).response);
    const err = await getDirectExecutor("sitemap-parse")!({ url: "https://example.test/s.xml" }).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(ResourceLimitError);
  });
});

describe("sitemap-parse survives malformed XML in linear time", () => {
  /**
   * #434. The old `/<url>([\s\S]*?)<\/url>/g` and
   * `/<loc>\s*(.*?)\s*<\/loc>/g` were quadratic on unclosed tags: 100,000
   * unclosed `<url>` tags — 488 KB, nothing near the 50 MB fetch cap — took
   * 59.9 s of synchronous CPU, blocking the whole event loop. The caller's
   * server chooses this input freely.
   *
   * The budget below is deliberately loose (2 s against a linear time of a few
   * ms) so the test measures the ALGORITHM rather than the machine. The old
   * code fails it by more than an order of magnitude on a slow CI box.
   */
  const BUDGET_MS = 2_000;

  it.each([
    ["100,000 unclosed <url> tags", `<urlset>${"<url>".repeat(100_000)}</urlset>`],
    ["50,000 unclosed <loc> tags in an index", `<sitemapindex>${"<loc>".repeat(50_000)}</sitemapindex>`],
    ["nested and interleaved openers", `<urlset>${"<url><loc>".repeat(50_000)}</urlset>`],
  ])("%s", async (_label, xml) => {
    safeFetchMock.mockResolvedValue(streamingResponseOf(Buffer.from(xml)).response);
    const started = Date.now();
    await getDirectExecutor("sitemap-parse")!({ url: "https://example.test/sitemap.xml" }).catch(
      () => undefined,
    );
    expect(Date.now() - started, "parser is super-linear on unclosed tags again").toBeLessThan(
      BUDGET_MS,
    );
  });

  it("a well-formed sitemap at the protocol's 50,000-URL cap still parses", async () => {
    const entry = "<url><loc>https://example.test/p</loc><lastmod>2026-08-29</lastmod></url>";
    safeFetchMock.mockResolvedValue(
      streamingResponseOf(Buffer.from(`<urlset>${entry.repeat(50_000)}</urlset>`)).response,
    );
    const started = Date.now();
    const out = (await getDirectExecutor("sitemap-parse")!({
      url: "https://example.test/sitemap.xml",
    })) as { output: Record<string, unknown> };
    expect(out.output.total_urls).toBe(50_000);
    expect(out.output.has_lastmod).toBe(true);
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
  });

  it("keeps the old extraction semantics on a mixed document", async () => {
    // Whitespace trimmed, nearest closing tag wins, an unclosed tail is
    // dropped rather than swallowing the rest — all as the regexes behaved.
    const xml =
      "<urlset>" +
      "<url><loc>  https://a.test/1  </loc><priority>0.7</priority></url>" +
      "<url><loc>https://a.test/2</loc><changefreq>weekly</changefreq></url>" +
      "<url><loc>https://a.test/3</loc>" + // unclosed <url>
      "</urlset>";
    safeFetchMock.mockResolvedValue(streamingResponseOf(Buffer.from(xml)).response);
    const out = (await getDirectExecutor("sitemap-parse")!({
      url: "https://example.test/sitemap.xml",
    })) as { output: Record<string, any> };
    expect(out.output.total_urls).toBe(2);
    expect(out.output.sample_urls[0]).toEqual({
      loc: "https://a.test/1",
      lastmod: undefined,
      changefreq: undefined,
      priority: "0.7",
    });
    expect(out.output.sample_urls[1].changefreq).toBe("weekly");
  });

  it("a sitemap index still lists its children, whitespace trimmed", async () => {
    // The pretty-printed form real sitemap indexes ship in — the old
    // `/<loc>\s*(.*?)\s*<\/loc>/` trimmed via its own `\s*` guards, so the
    // replacement has to trim too or every child URL gains newlines.
    const xml =
      "<sitemapindex>\n" +
      "  <sitemap>\n    <loc>\n      https://a.test/s1.xml\n    </loc>\n  </sitemap>\n" +
      "  <sitemap><loc>https://a.test/s2.xml</loc></sitemap>\n" +
      "</sitemapindex>";
    safeFetchMock.mockResolvedValue(streamingResponseOf(Buffer.from(xml)).response);
    const out = (await getDirectExecutor("sitemap-parse")!({
      url: "https://example.test/sitemap.xml",
    })) as { output: Record<string, unknown> };
    expect(out.output.type).toBe("sitemap_index");
    expect(out.output.child_sitemaps).toEqual(["https://a.test/s1.xml", "https://a.test/s2.xml"]);
  });
});

describe("api-health-check", () => {
  it("refuses to buffer an oversized body but still answers the health question", async () => {
    safeFetchMock.mockResolvedValue(
      streamingResponse(MAX_FETCHED_API_RESPONSE_BYTES + 65_536, {
        contentType: "application/json",
      }).response,
    );
    const out = (await getDirectExecutor("api-health-check")!({ url: "https://example.test/api" })) as {
      output: Record<string, unknown>;
    };
    // The endpoint answered 200 in good time. A body we decline to hold is not
    // evidence that it is unhealthy.
    expect(out.output.is_healthy).toBe(true);
    expect(out.output.status_code).toBe(200);
    expect(JSON.stringify(out.output.response_body)).toMatch(/4\.0MB or less/);
  });

  it("still reports a real connection failure as unhealthy", async () => {
    safeFetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND example.test"));
    const out = (await getDirectExecutor("api-health-check")!({ url: "https://example.test/api" })) as {
      output: Record<string, unknown>;
    };
    expect(out.output.is_healthy).toBe(false);
  });
});

describe("paid-api-preflight drains without materializing", () => {
  it("cancels the body and never pulls a chunk", async () => {
    const handle = streamingResponse(64 * 1024 * 1024, { contentType: "application/json" });
    safeFetchMock.mockResolvedValue(handle.response);
    const out = (await getDirectExecutor("paid-api-preflight")!({ url: "https://example.test/paid" })) as {
      output: Record<string, unknown>;
    };
    expect(out.output.is_reachable).toBe(true);
    expect(handle.pulls()).toBe(0);
    expect(handle.cancelled()).toBe(true);
  });
});

// ─── Contact scrapers: behaviour preserved, local reader gone ────────────────

describe("the contact scrapers keep scanning a prefix", () => {
  it("domain-contact-extract finds markup inside the first 300 KB of a huge page", async () => {
    const head = '<html><body><a href="tel:+46812345678">call</a>';
    const body = Buffer.from(head + "x".repeat(2_000_000) + "</body></html>");
    safeFetchMock.mockImplementation(async () => streamingResponseOf(body, { contentType: "text/html" }).response);
    const out = (await getDirectExecutor("domain-contact-extract")!({ domain: "example.test" })) as {
      output: Record<string, unknown>;
    };
    expect(out.output.phones).toEqual(["+46812345678"]);
  });
});

describe("page-exists keeps its 20 KB scan window", () => {
  it("scans only the prefix of a multi-megabyte page and reports the capped length", async () => {
    const head = "<html><head><title>Real page</title></head><body>Genuine article content here. ";
    const body = Buffer.from(head + "filler ".repeat(1_000_000) + "</body></html>");
    const handle = streamingResponseOf(body, { contentType: "text/html" });
    safeFetchMock.mockResolvedValue(handle.response);
    const out = (await getDirectExecutor("page-exists")!({ url: "https://example.test/a" })) as {
      output: Record<string, unknown>;
    };
    expect(out.output.exists).toBe(true);
    expect(out.output.content_length).toBe(20_000);
    // ~7 MB body, 20 KB read: the stream is abandoned, not drained.
    expect(handle.cancelled()).toBe(true);
    expect(handle.pulls()).toBeLessThan(5);
  });
});

// ─── Non-2xx bodies are cancelled, not left to GC ────────────────────────────

/**
 * #434's cheap residual. These paths throw (or fall through) on a non-2xx
 * without ever reading the body, which leaves the keep-alive connection pinned
 * until the response is collected. `discardBody` cancels it.
 *
 * Behaviour is deliberately unchanged: the same error, the same message, the
 * same fall-through — the only difference is a cancelled stream. The
 * `cancelled()` assertion is what makes that observable; without it the whole
 * change would be untestable and therefore not worth making.
 */
describe("a non-2xx response has its body cancelled", () => {
  const CASES: Array<{ slug: string; inputs: Record<string, unknown>; status: number }> = [
    { slug: "url-to-text", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "meta-extract", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "link-extract", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "og-image-check", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "gdpr-website-check", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "tech-stack-detect", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "sitemap-parse", inputs: { url: "https://example.test/sitemap.xml" }, status: 503 },
    { slug: "robots-txt-parse", inputs: { url: "https://example.test" }, status: 503 },
    // The 404 branch RETURNS rather than throwing, so the response lives
    // longer — the case most worth draining.
    { slug: "robots-txt-parse", inputs: { url: "https://example.test" }, status: 404 },
    { slug: "job-posting-analyze", inputs: { url: "https://example.test/a" }, status: 503 },
    { slug: "social-post-generate", inputs: { url: "https://example.test/a" }, status: 503 },
  ];

  it.each(CASES)("$slug (HTTP $status)", async ({ slug, inputs, status }) => {
    const handle = streamingResponseOf(HTML(5_000), { contentType: "text/html", status });
    safeFetchMock.mockResolvedValue(handle.response);
    await getDirectExecutor(slug)!(inputs).catch(() => undefined);
    expect(handle.cancelled(), `${slug} left a ${status} body unread and uncancelled`).toBe(true);
    expect(handle.pulls(), `${slug} read a body it does not use`).toBe(0);
  });

  it("a 2xx body is still READ, not cancelled unread", async () => {
    // The control: draining must not have been wired onto the success path.
    const handle = streamingResponseOf(HTML(20_000), { contentType: "text/html" });
    safeFetchMock.mockResolvedValue(handle.response);
    await getDirectExecutor("url-to-text")!({ url: "https://example.test/a" });
    expect(handle.pulls()).toBeGreaterThan(0);
  });
});

// ─── Classification: all three health consumers ──────────────────────────────

describe("a size refusal is judged a refusal by every health consumer", () => {
  const err = new ResourceLimitError("'url' must be a sitemap whose XML is 50.0MB or less.");

  it("quality-capture sees a capability refusal on the object", () => {
    expect(isCapabilityRefusal(err)).toBe(true);
  });

  it("the circuit breaker sees user input on the message", () => {
    expect(isUserInputError(err.message)).toBe(true);
  });

  it("the quality floor's taxonomy classifies it caller_input", () => {
    expect(classifyTransactionFailure(err.message)).toBe("caller_input");
  });

  it("negative control — a genuine upstream fault is none of those things", () => {
    const upstream = "Corporations Canada API returned HTTP 503";
    expect(isUserInputError(upstream)).toBe(false);
    expect(classifyTransactionFailure(upstream)).not.toBe("caller_input");
  });
});
