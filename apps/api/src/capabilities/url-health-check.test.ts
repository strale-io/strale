/**
 * Regression tests for url-health-check's redirect-following bug (Phase-4
 * tail fix, MEDIUM-5, 2026-08-17 review).
 *
 * Same bug class as redirect-trace.ts before its own fix: this executor's
 * comment claimed "safeFetch with maxRedirects: 0 returns the 3xx so we can
 * walk the chain ourselves" — but without `returnOnRedirectCap: true`,
 * safeFetch's `followRedirects` increments hop to 1 on the first redirect
 * and throws "Too many redirects (>0)" whenever hop > maxRedirects, which
 * with maxRedirects: 0 is ALWAYS true on the first redirect. Any URL with a
 * real redirect failed this whole capability instead of reporting the
 * redirect chain (follow_redirects: true) or the bare 3xx status
 * (follow_redirects: false).
 *
 * `validateUrl` is mocked to reject literal loopback IPs (mirroring the
 * real implementation's `net.isIP` fast path, no DNS needed) and accept
 * everything else — deterministic and network-free, same pattern as
 * redirect-trace.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/url-validator.js", () => ({
  validateUrl: vi.fn(async (u: string) => {
    if (/127\.0\.0\.1|::1|localhost/.test(String(u))) {
      throw new Error("This URL targets a restricted address.");
    }
  }),
}));

import { getDirectExecutor } from "./index.js";
import "./url-health-check.js";

describe("url-health-check", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("follows a redirect chain to the final 200 (the core bug case, follow_redirects: true)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u === "https://example.test/start") {
        return new Response(null, {
          status: 301,
          headers: { location: "https://example.test/end", server: "test-srv" },
        });
      }
      if (u === "https://example.test/end") {
        return new Response(null, { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected fetch to ${u}`);
    });

    const exec = getDirectExecutor("url-health-check")!;
    const result = await exec({ url: "https://example.test/start" });
    const output = result.output as Record<string, unknown>;

    // Pre-fix this threw "Too many redirects (>0)" on the very first hop.
    expect(output.status_code).toBe(200);
    expect(output.final_url).toBe("https://example.test/end");
    expect(output.is_up).toBe(true);
    expect(output.redirect_chain).toEqual([
      { url: "https://example.test/start", status: 301 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports the bare 3xx status when follow_redirects is false, instead of throwing", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.test/end" },
      }),
    );

    const exec = getDirectExecutor("url-health-check")!;
    const result = await exec({ url: "https://example.test/start", follow_redirects: false });
    const output = result.output as Record<string, unknown>;

    expect(output.status_code).toBe(302);
    expect(output.final_url).toBe("https://example.test/start");
    // is_up's window is [200,400) — a bare 3xx (unfollowed) still counts as
    // "up" (the server responded); it just isn't the ultimate destination.
    expect(output.is_up).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a non-redirecting 200 directly with no redirect chain", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const exec = getDirectExecutor("url-health-check")!;
    const result = await exec({ url: "https://example.test/ok" });
    const output = result.output as Record<string, unknown>;

    expect(output.status_code).toBe(200);
    expect(output.redirect_chain).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
