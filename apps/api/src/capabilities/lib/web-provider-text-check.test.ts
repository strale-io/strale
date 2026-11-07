/**
 * R1: the plain-fetch tier's "is there real text?" check must not block the
 * event loop on a hostile page. It once took the body with a regex that
 * rescanned from every "<body" (4.4 s on 256 KB, second R1 review of #964),
 * and a linear version still spent up to 0.6 s on a 16 MiB page (third
 * review). These drive fetchPage itself, so they fail if the call site stops
 * using the bounded check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.fn();
const browserlessFetchMock = vi.fn();
const isPreflight = (init: unknown) =>
  new Headers((init as RequestInit | undefined)?.headers).get("range") === "bytes=0-8191";
vi.mock("../../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  safeFetch: (...args: unknown[]) =>
    isPreflight(args[1])
      ? new Response("<html><body>ordinary page</body></html>", { status: 200, headers: { "content-type": "text/html" } })
      : safeFetchMock(...args),
}));
vi.mock("../../lib/metered-vendor-fetch.js", () => ({
  browserlessFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  meteredVendorFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  vendorReachabilityFetch: (...args: unknown[]) => browserlessFetchMock(...args),
}));
vi.mock("../../lib/robots-txt.js", () => ({
  assertRobotsAllowed: vi.fn(async () => {}),
  assertRedirectAllowed: vi.fn(async () => {}),
}));
vi.mock("../../lib/url-validator.js", () => ({ validateUrl: vi.fn(async () => {}) }));

import { fetchPage, __resetWebProviderCacheForTests } from "./web-provider.js";

const page = (html: string) => new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

/** Longest gap between ticks of a 5 ms interval while `work` runs, with a trailing tick. */
async function maxGap(work: () => Promise<unknown>): Promise<number> {
  let last = performance.now();
  let gap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    gap = Math.max(gap, now - last);
    last = now;
  }, 5);
  try {
    await work().catch(() => undefined);
  } finally {
    await new Promise((r) => setTimeout(r, 25));
    clearInterval(timer);
  }
  return gap;
}

beforeEach(() => {
  safeFetchMock.mockReset();
  browserlessFetchMock.mockReset();
  browserlessFetchMock.mockRejectedValue(new Error("rendering is not part of this test"));
  __resetWebProviderCacheForTests();
  process.env.BROWSERLESS_URL = "https://chromium.test";
  process.env.BROWSERLESS_API_KEY = "test-key";
});
afterEach(() => vi.restoreAllMocks());

describe("fetchPage's plain-tier text check on hostile pages", () => {
  it("a flood of <body> does not block the event loop", async () => {
    safeFetchMock.mockImplementation(async () => page(`<html><body>${"<body>".repeat(43_690)}`));
    expect(await maxGap(() => fetchPage("https://example.test/a"))).toBeLessThan(500);
  }, 30_000);

  it("16 MiB of ordinary text is accepted without blocking the event loop", async () => {
    const html = `<html><body><p>${"a ".repeat(8 * 1024 * 1024 - 32)}</p></body></html>`;
    safeFetchMock.mockImplementation(async () => page(html));
    let result: { html: string } | undefined;
    const gap = await maxGap(async () => { result = await fetchPage("https://example.test/b"); });
    expect(result?.html.length).toBe(html.length);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
    expect(gap).toBeLessThan(500);
  }, 30_000);
});
