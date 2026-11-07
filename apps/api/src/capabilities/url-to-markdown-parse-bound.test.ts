/**
 * R1 at the capability level: url-to-markdown is free-tier and keyless, so
 * any caller can point it at a hostile page. The page must be converted or
 * refused quickly, a refusal must not fall through to Browserless, and a
 * hostile page must never come back as an empty success.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, fetchRenderedHtml } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  fetchRenderedHtml: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", () => ({ fetchRenderedHtml }));
vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/robots-txt.js", () => ({
  assertRobotsAllowed: vi.fn(async () => {}),
  assertRedirectAllowed: vi.fn(async () => {}),
}));

import { getDirectExecutor } from "./index.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { HtmlTooComplexError } from "./lib/html-parse-bound.js";
import { htmlToCleanMarkdown, stopConversionWorkers } from "./lib/readability-convert.js";
import "./url-to-markdown.js";

/**
 * CPU milliseconds this test process has used since `since` (user + system,
 * worker threads included). Vitest runs each test file in its own process
 * (pool: "forks"), so unlike wall-clock time this does not grow when other
 * test files load the machine: CI at full parallelism timed the same 5,000-deep
 * conversion at 2.4 s that takes well under 1 s of CPU.
 */
const cpuMs = (since: NodeJS.CpuUsage): number => {
  const d = process.cpuUsage(since);
  return (d.user + d.system) / 1000;
};

// The conversion runs in a worker thread that starts on first use; start it
// here so the timings below measure conversions, not the worker's start-up.
beforeAll(async () => {
  await htmlToCleanMarkdown("<p>warm up</p>", "https://example.test/");
}, 30_000);
afterAll(stopConversionWorkers);

const WORDS = "Readable words that a person would want in the Markdown output. ".repeat(20);

function page(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function run(html: string): Promise<{ ms: number; result: unknown; error: unknown }> {
  safeFetchMock.mockImplementation(async () => page(html));
  const started = process.cpuUsage();
  try {
    const result = await getDirectExecutor("url-to-markdown")!({ url: "https://example.test/a" });
    return { ms: cpuMs(started), result, error: null };
  } catch (error) {
    return { ms: cpuMs(started), result: null, error };
  }
}

beforeEach(() => {
  safeFetchMock.mockReset();
  fetchRenderedHtml.mockReset();
  fetchRenderedHtml.mockRejectedValue(new Error("Browserless must not be reached in this suite"));
});

describe("url-to-markdown on hostile pages", () => {
  it("converts a deeply nested page quickly and keeps its text", async () => {
    const { ms, result, error } = await run(`<html><body>${"<div>".repeat(20_000)}<p>${WORDS}</p></body></html>`);
    expect(error).toBeNull();
    expect(ms).toBeLessThan(2_000);
    const output = (result as { output: { markdown: string; word_count: number } }).output;
    expect(output.markdown).toContain("Readable words that a person would want");
    expect(output.word_count).toBeGreaterThan(100);
  });

  it("refuses a page with too much markup, without trying Browserless", async () => {
    const { ms, error } = await run(`<html><body><p>${WORDS}</p>${"<p>x".repeat(1_000_000)}</body></html>`);
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect(isCapabilityRefusal(error)).toBe(true);
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
    expect(ms).toBeLessThan(2_000);
  });

  it("refuses nesting crafted to defeat the pre-pass, rather than returning empty Markdown", async () => {
    const { ms, error } = await run(`<html><body><p>${WORDS}</p>${"<b><i><u><a>".repeat(8_000)}</body></html>`);
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect(ms).toBeLessThan(2_000);
  });

  it("checks for a JavaScript shell in linear time", async () => {
    // The text-length check before conversion was a regex chain that retried
    // from every "<": 256 KB of "<a" took 13 s there.
    const { ms } = await run(`<html><body><p>${WORDS}</p>${"<a".repeat(128 * 1024)}`);
    expect(ms).toBeLessThan(2_000);
  });
});
