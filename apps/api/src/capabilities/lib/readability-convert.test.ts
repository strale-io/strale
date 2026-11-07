/**
 * R1: the HTML conversion runs off the event loop under a wall-clock limit.
 *
 * The #964 review found pages that pass every markup limit and still take
 * 10-80 s to convert (10k flat <div>: 9.4 s in Readability). Run on the main
 * thread, that time blocks every other request. These tests hold that the
 * API stays responsive while such a page is converted, that the page is
 * refused at the limit, and that the converter recovers afterwards.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ResourceLimitError } from "../../lib/resource-limits.js";
import { HtmlTooComplexError } from "./html-parse-bound.js";
import { convertHtmlToMarkdownSync, postProcessMarkdown } from "./readability-convert-sync.js";
import { boundInput, CONVERSION_LIMITS, ConversionBusyError, htmlToCleanMarkdown, stopConversionWorkers } from "./readability-convert.js";

const DEFAULTS = { ...CONVERSION_LIMITS };
const URL_ = "https://example.test/a";

/** Within every markup limit, but Readability needs seconds for it. */
const SLOW_PAGE = `<html><body>${"<div>a short line of text</div>".repeat(10_000)}</body></html>`;
const ARTICLE = `<html><head><title>T</title></head><body><article><h1>Heading</h1>${"<p>Readable words that a person would want in the Markdown output, long enough to count.</p>".repeat(40)}</article></body></html>`;

/** Longest gap between ticks of a 10 ms interval while `work` runs. */
async function maxEventLoopGap<T>(work: () => Promise<T>): Promise<{ gap: number; value: T | undefined; error: unknown }> {
  let last = performance.now();
  let gap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    gap = Math.max(gap, now - last);
    last = now;
  }, 10);
  // Let the interval tick once more after `work` settles: a synchronous block
  // that ends with the settle is only seen by the tick after it (F5 of the
  // second R1 review).
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 30));
    clearInterval(timer);
  };
  try {
    const value = await work();
    await settle();
    return { gap, value, error: null };
  } catch (error) {
    await settle();
    return { gap, value: undefined, error };
  }
}

beforeAll(async () => {
  await htmlToCleanMarkdown("<p>warm up</p>", URL_); // start the worker once
}, 30_000);
afterEach(() => Object.assign(CONVERSION_LIMITS, DEFAULTS));
afterAll(stopConversionWorkers);

describe("htmlToCleanMarkdown in a worker", () => {
  it("returns exactly what the in-process conversion returns", async () => {
    expect(await htmlToCleanMarkdown(ARTICLE, URL_)).toEqual(convertHtmlToMarkdownSync(ARTICLE, URL_));
  });

  it("keeps the event loop responsive on a slow page and refuses it at the time limit", async () => {
    CONVERSION_LIMITS.timeoutMs = 1_500;
    const started = performance.now();
    const { gap, error } = await maxEventLoopGap(() => htmlToCleanMarkdown(SLOW_PAGE, URL_));
    const ms = performance.now() - started;
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect((error as ResourceLimitError).isCapabilityRefusal).toBe(true);
    expect((error as Error).message).toMatch(/did not finish within 1.5 s/);
    expect(ms).toBeLessThan(3_000);
    // In-process, the whole conversion is one gap of several seconds.
    expect(gap).toBeLessThan(250);
  }, 20_000);

  it("recovers after terminating a worker: the next page converts", async () => {
    CONVERSION_LIMITS.timeoutMs = 1_000;
    await expect(htmlToCleanMarkdown(SLOW_PAGE, URL_)).rejects.toBeInstanceOf(HtmlTooComplexError);
    CONVERSION_LIMITS.timeoutMs = DEFAULTS.timeoutMs;
    const result = await htmlToCleanMarkdown(ARTICLE, URL_);
    expect(result.markdown).toContain("# Heading");
  }, 30_000);

  it("refuses at once when the queue is full, and never bills it", async () => {
    await stopConversionWorkers();
    CONVERSION_LIMITS.workers = 1;
    CONVERSION_LIMITS.maxQueued = 1;
    CONVERSION_LIMITS.timeoutMs = 1_000;
    const running = htmlToCleanMarkdown(SLOW_PAGE, URL_); // takes the only worker
    const queued = htmlToCleanMarkdown(ARTICLE, URL_); // waits
    await expect(htmlToCleanMarkdown(ARTICLE, URL_)).rejects.toBeInstanceOf(ConversionBusyError);
    const busy = new ConversionBusyError();
    expect(busy).toBeInstanceOf(ResourceLimitError);
    expect(busy.isCapabilityRefusal).toBe(true);
    await expect(running).rejects.toBeInstanceOf(HtmlTooComplexError);
    CONVERSION_LIMITS.timeoutMs = DEFAULTS.timeoutMs;
    expect((await queued).markdown).toContain("# Heading");
    await stopConversionWorkers();
  }, 30_000);

  it("the gap helper sees a block that ends as the work settles", async () => {
    // Guards the helper itself: an in-process conversion is exactly this shape.
    const { gap } = await maxEventLoopGap(async () => {
      await new Promise((r) => setTimeout(r, 15));
      const end = performance.now() + 400;
      while (performance.now() < end) { /* block */ }
    });
    expect(gap).toBeGreaterThan(300);
  });

  it("strips links and images in the worker, with the same result as in-process", async () => {
    const page = ARTICLE.replace("</article>", '<p>See <a href="https://example.test/x">the docs</a> and <img src="https://example.test/i.png" alt="pic"></p></article>');
    const expected = convertHtmlToMarkdownSync(page, URL_);
    const options = { includeLinks: false, includeImages: false };
    const got = await htmlToCleanMarkdown(page, URL_, options);
    expect(got.markdown).toBe(postProcessMarkdown(expected.markdown, options));
    expect(got.markdown).toContain("See the docs");
    expect(got.markdown).not.toContain("](");
  });

  it("keeps the event loop free while stripping links from a flood of '['", async () => {
    // 60,000 "[" in a <pre> reach the Markdown unescaped; the link regex then
    // rescans from every "[": about 1 s on the main thread before the move.
    const page = `<html><body><p>${"Readable words for the intro. ".repeat(10)}</p><pre>${"[".repeat(60_000)}</pre></body></html>`;
    const { gap, error } = await maxEventLoopGap(() => htmlToCleanMarkdown(page, URL_, { includeLinks: false }));
    expect(error).toBeNull();
    expect(gap).toBeLessThan(250);
  }, 20_000);

  it("cuts input past maxInputChars at a tag boundary", () => {
    CONVERSION_LIMITS.maxInputChars = 20;
    expect(boundInput("<p>short</p>")).toBe("<p>short</p>");
    expect(boundInput("<p>aaaa</p><p>bbbbbbbbbbbbbb</p>")).toBe("<p>aaaa</p>");
  });

  it("refuses a page that waits in the queue past maxQueueWaitMs", async () => {
    await stopConversionWorkers();
    CONVERSION_LIMITS.workers = 1;
    CONVERSION_LIMITS.timeoutMs = 3_000;
    CONVERSION_LIMITS.maxQueueWaitMs = 500;
    const running = htmlToCleanMarkdown(SLOW_PAGE, URL_);
    const started = performance.now();
    await expect(htmlToCleanMarkdown(ARTICLE, URL_)).rejects.toBeInstanceOf(ConversionBusyError);
    expect(performance.now() - started).toBeLessThan(2_000);
    await expect(running).rejects.toBeInstanceOf(HtmlTooComplexError);
    await stopConversionWorkers();
  }, 30_000);

  it("passes a markup refusal from the worker back as HtmlTooComplexError", async () => {
    const error = await htmlToCleanMarkdown("<p>x".repeat(1_000_000), URL_).catch((e) => e);
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect((error as Error).message).toMatch(/too complex to convert safely/);
  }, 20_000);
});
