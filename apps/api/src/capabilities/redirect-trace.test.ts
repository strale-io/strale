/**
 * Regression tests for redirect-trace's core bug (Phase-4 tail fix,
 * 2026-08-17).
 *
 * redirect-trace calls `safeFetch(url, {maxRedirects: 0})` expecting the
 * first 3xx response back so it can walk the redirect chain itself. But
 * `safe-fetch.ts`'s `followRedirects` increments `hop` to 1 on the first
 * redirect and throws "Too many redirects (>0)" whenever `hop >
 * maxRedirects` — with `maxRedirects: 0` that was ALWAYS true on the first
 * redirect. Introduced in commit 1f0d480 (2026-04-17) swapping raw
 * `fetch(url, {redirect:'manual'})` for safeFetch under a wrong equivalence
 * assumption. Any URL with >=1 real redirect failed; the harness "passed"
 * only when httpbin.org 503s (not a redirect — skips the broken branch),
 * which is why it went undetected.
 *
 * Fix: safeFetch grows a `returnOnRedirectCap` option that returns the 3xx
 * response at the cap instead of throwing, used only by redirect-trace. SSRF
 * validation per hop is unchanged — each hop's URL is still validated
 * BEFORE any request, including inside redirect-trace's own manual
 * next-hop loop (test 2 below asserts the blocked hop is never fetched).
 *
 * `validateUrl` is mocked to reject literal loopback IPs (mirroring the
 * real implementation's `net.isIP` fast path, which needs no DNS) and
 * accept everything else — this keeps the suite deterministic and
 * network-free while still exercising the real "block before fetch" shape
 * for the SSRF test. The general validateUrl/isBlockedIp behavior has its
 * own direct coverage in url-validator.test.ts; this file exists to prove
 * redirect-trace's hop loop actually calls it at the right time.
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
import "./redirect-trace.js";

describe("redirect-trace", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("traces a 2-hop redirect chain correctly (the core bug case)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u === "https://example.test/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "/middle", server: "test-srv" },
        });
      }
      if (u === "https://example.test/middle") {
        return new Response(null, {
          status: 302,
          headers: { location: "/end" },
        });
      }
      if (u === "https://example.test/end") {
        return new Response(null, { status: 200 });
      }
      throw new Error(`unexpected fetch to ${u}`);
    });

    const exec = getDirectExecutor("redirect-trace")!;
    const result = await exec({ url: "https://example.test/start" });
    const output = result.output as Record<string, unknown>;

    // Pre-fix this threw "Too many redirects (>0)" on the very first hop.
    expect(output.chain).toHaveLength(3);
    expect(output.redirect_count).toBe(2);
    expect(output.final_url).toBe("https://example.test/end");
    expect(output.final_status_code).toBe(200);
    expect(output.original_url).toBe("https://example.test/start");
    expect(output.uses_https).toBe(true);
    expect(output.same_domain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("blocks a redirect to a private IP at hop N — the blocked hop is never fetched", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u === "https://example.test/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1:1/" },
        });
      }
      // If we ever get here, the SSRF guard failed to stop the hop
      // BEFORE the request — the whole point of the per-hop validation.
      throw new Error(`SSRF guard failed to block fetch to ${u}`);
    });

    const exec = getDirectExecutor("redirect-trace")!;
    await expect(exec({ url: "https://example.test/start" })).rejects.toThrow(
      /restricted/,
    );
    // Only the first (allowed) hop was ever fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects the maxRedirects cap on the trace's own hop count", async () => {
    // Every hop redirects to the next — an effectively infinite chain if
    // uncapped. Confirms redirect-trace's own step-count cap (independent
    // of safeFetch's per-call maxRedirects: 0), which is what actually
    // bounds the chain length here.
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(String(url));
      const n = parseInt(u.pathname.slice(1) || "0", 10);
      return new Response(null, {
        status: 302,
        headers: { location: `/${n + 1}` },
      });
    });

    const exec = getDirectExecutor("redirect-trace")!;
    const result = await exec({
      url: "https://example.test/0",
      max_redirects: 2,
    });
    const output = result.output as Record<string, unknown>;

    expect(output.chain).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
