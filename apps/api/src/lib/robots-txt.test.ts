/**
 * robots.txt, honoured before Strale fetches a third-party page
 * (DEC-20261023-A). Two layers: the RFC 9309 parser and matcher as pure
 * functions, then `assertRobotsAllowed` against a stubbed fetch, covering
 * every access result the RFC distinguishes and the cache.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.fn();
vi.mock("./safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

import {
  __resetRobotsCacheForTests,
  assertRedirectAllowed,
  assertRobotsAllowed,
  isPathAllowed,
  parseRobotsTxt,
  rulesFor,
} from "./robots-txt.js";
import { SiteAccessRefusedError, STRALE_USER_AGENT } from "./site-access.js";
import { isCapabilityRefusal } from "./capability-refusal.js";
import { classifyTransactionFailure, countsAgainstCapability } from "./transaction-failure-taxonomy.js";

const allowed = (robots: string, path: string, token = "StraleBot") =>
  isPathAllowed(rulesFor(parseRobotsTxt(robots), token), path);

describe("parse and match (RFC 9309 §2.1–2.2)", () => {
  it("no robots rules means everything is allowed", () => {
    expect(allowed("", "/anything")).toBe(true);
  });

  it("the * group applies when no group names StraleBot", () => {
    const robots = "User-agent: *\nDisallow: /private\n";
    expect(allowed(robots, "/private/page")).toBe(false);
    expect(allowed(robots, "/public")).toBe(true);
  });

  it("a StraleBot group replaces the * group entirely", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: StraleBot\nDisallow: /admin\n";
    expect(allowed(robots, "/page")).toBe(true);
    expect(allowed(robots, "/admin/x")).toBe(false);
  });

  it("matches the product token case-insensitively and ignores a version", () => {
    expect(allowed("User-agent: stralebot/2.0\nDisallow: /\n", "/x")).toBe(false);
    // A different bot's group is not ours.
    expect(allowed("User-agent: StraleBotExtra\nDisallow: /\n", "/x")).toBe(true);
  });

  it("consecutive user-agent lines share one group", () => {
    const robots = "User-agent: Googlebot\nUser-agent: StraleBot\nDisallow: /shared\n";
    expect(allowed(robots, "/shared")).toBe(false);
  });

  it("merges several groups for the same agent", () => {
    const robots =
      "User-agent: StraleBot\nDisallow: /a\n\nUser-agent: Other\nDisallow: /\n\nUser-agent: StraleBot\nDisallow: /b\n";
    expect(allowed(robots, "/a")).toBe(false);
    expect(allowed(robots, "/b")).toBe(false);
    expect(allowed(robots, "/c")).toBe(true);
  });

  it("the longest match wins, and allow wins a tie", () => {
    const robots = "User-agent: *\nDisallow: /docs\nAllow: /docs/public\n";
    expect(allowed(robots, "/docs/secret")).toBe(false);
    expect(allowed(robots, "/docs/public/a")).toBe(true);
    expect(allowed("User-agent: *\nDisallow: /p\nAllow: /p\n", "/p")).toBe(true);
  });

  it("supports * wildcards and the $ end anchor", () => {
    const robots = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*q=\n";
    expect(allowed(robots, "/files/report.pdf")).toBe(false);
    expect(allowed(robots, "/files/report.pdf?x=1")).toBe(true);
    expect(allowed(robots, "/search?q=hello")).toBe(false);
  });

  it("an empty Disallow allows everything, and comments are ignored", () => {
    expect(allowed("User-agent: * # all\nDisallow:\n", "/x")).toBe(true);
    expect(allowed("User-agent: *\nDisallow: /x # not here\n", "/x")).toBe(false);
  });

  it("/robots.txt itself is always allowed", () => {
    expect(allowed("User-agent: *\nDisallow: /\n", "/robots.txt")).toBe(true);
  });

  it("percent-encoding is normalised on both sides", () => {
    expect(allowed("User-agent: *\nDisallow: /café\n", "/caf%c3%a9")).toBe(false);
  });

  it("RFC 9309's own example: an encoded URL in the query matches the unencoded pattern", () => {
    const robots = "User-agent: *\nDisallow: /foo/bar?baz=https://foo.bar\n";
    expect(allowed(robots, "/foo/bar?baz=https%3A%2F%2Ffoo.bar")).toBe(false);
  });

  it("a Sitemap line between user-agent lines does not split the group", () => {
    const robots = "User-agent: StraleBot\nSitemap: https://s.test/sitemap.xml\nUser-agent: *\nDisallow: /\n";
    expect(allowed(robots, "/page")).toBe(false);
  });

  it("a UTF-8 BOM does not hide the first user-agent line", () => {
    expect(allowed("\uFEFFUser-agent: *\nDisallow: /\n", "/x")).toBe(false);
  });

  it("REGRESSION: a pathological wildcard pattern matches in linear time (no ReDoS)", () => {
    // Compiled to a backtracking RegExp, the first case took ~17 s and the
    // second ~37 s (review of 2026-10-24) — long enough to stall every
    // request in the process. The site owner writes robots.txt.
    const start = Date.now();
    expect(allowed("User-agent: *\nDisallow: /*a*a*a*b\n", "/" + "a".repeat(5000))).toBe(true);
    expect(allowed(`User-agent: *\nDisallow: /${"*a".repeat(10)}*b\n`, "/" + "a".repeat(5000))).toBe(true);
    expect(allowed("User-agent: *\nDisallow: /*a*a*a*b\n", "/" + "a".repeat(5000) + "b")).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("REGRESSION: one malformed escape does not switch percent-decoding off for the rest", () => {
    // `%E9` alone is not valid UTF-8. Decoding all-or-nothing left `%73`
    // encoded, so `/%73earch` slipped past `Disallow: /search`.
    expect(allowed("User-agent: *\nDisallow: /search\n", "/%73earch?q=%E9")).toBe(false);
    expect(allowed("User-agent: *\nDisallow: /caf%C3%A9/\n", "/caf%C3%A9/?x=%E9")).toBe(false);
  });

  it("wildcard matching is exact, not just fast", () => {
    const robots = "User-agent: *\nDisallow: /a*b*c$\n";
    expect(allowed(robots, "/axxbyyc")).toBe(false);
    expect(allowed(robots, "/axxbyycd")).toBe(true);
    expect(allowed(robots, "/acb")).toBe(true);
    expect(allowed("User-agent: *\nDisallow: /*\n", "/anything")).toBe(false);
    expect(allowed("User-agent: *\nDisallow: /exact$\n", "/exact")).toBe(false);
    expect(allowed("User-agent: *\nDisallow: /exact$\n", "/exact/more")).toBe(true);
  });
});

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

describe("assertRobotsAllowed (access results, RFC 9309 §2.3.1)", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
    __resetRobotsCacheForTests();
  });

  it("fetches /robots.txt for the origin, as StraleBot", async () => {
    safeFetchMock.mockResolvedValue(text("User-agent: *\nAllow: /\n"));
    await assertRobotsAllowed("https://site.test/a/b?c=1");
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = safeFetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://site.test/robots.txt");
    expect(init.headers["User-Agent"]).toBe(STRALE_USER_AGENT);
  });

  it("REGRESSION: a Disallow for the path is a site-access refusal", async () => {
    safeFetchMock.mockResolvedValue(text("User-agent: *\nDisallow: /private\n"));
    const err = await assertRobotsAllowed("https://site.test/private/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect((err as SiteAccessRefusedError).block).toEqual({ kind: "robots_disallow" });
    expect((err as Error).message).toMatch(/robots\.txt disallows this path/);
  });

  it("the query string takes part in matching", async () => {
    safeFetchMock.mockResolvedValue(text("User-agent: *\nDisallow: /*?session=\n"));
    await expect(assertRobotsAllowed("https://site.test/p")).resolves.toBeUndefined();
    await expect(assertRobotsAllowed("https://site.test/p?session=1")).rejects.toThrow(
      SiteAccessRefusedError,
    );
  });

  it("a 404 robots.txt means no rules: allowed", async () => {
    safeFetchMock.mockResolvedValue(text("", 404));
    await expect(assertRobotsAllowed("https://site.test/x")).resolves.toBeUndefined();
  });

  it("a 403 robots.txt is a 4xx, so also allowed (RFC 9309 §2.3.1.3)", async () => {
    safeFetchMock.mockResolvedValue(text("", 403));
    await expect(assertRobotsAllowed("https://site.test/x")).resolves.toBeUndefined();
  });

  it("a 5xx robots.txt is unreachable: refused (RFC 9309 §2.3.1.4)", async () => {
    safeFetchMock.mockResolvedValue(text("down", 503));
    const err = await assertRobotsAllowed("https://site.test/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect((err as SiteAccessRefusedError).block).toEqual({ kind: "robots_unavailable", status: 503 });
  });

  it("a 429 robots.txt is a 4xx: allowed", async () => {
    safeFetchMock.mockResolvedValue(text("", 429));
    await expect(assertRobotsAllowed("https://site.test/x")).resolves.toBeUndefined();
  });

  it("a transport failure refuses the fetch, and the refusal is cached briefly", async () => {
    // Cached so a robots.txt that hangs costs its timeout once per origin per
    // five minutes, not on every call (review of 2026-10-24).
    safeFetchMock.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    await expect(assertRobotsAllowed("https://site.test/x")).rejects.toThrow(SiteAccessRefusedError);
    await expect(assertRobotsAllowed("https://site.test/y")).rejects.toThrow(SiteAccessRefusedError);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("a body that stalls after the headers is a transport failure, cached like one", async () => {
    const stalled = new Response(
      new ReadableStream({
        start(c) {
          c.error(new Error("The operation was aborted due to timeout"));
        },
      }),
      { status: 200 },
    );
    safeFetchMock.mockResolvedValueOnce(stalled);
    await expect(assertRobotsAllowed("https://site.test/x")).rejects.toThrow(SiteAccessRefusedError);
    await expect(assertRobotsAllowed("https://site.test/y")).rejects.toThrow(SiteAccessRefusedError);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: an over-long URL is refused before matching (bounds rules × path work)", async () => {
    safeFetchMock.mockResolvedValue(text(`User-agent: *\n${"Disallow: /*aaaa*b\n".repeat(2000)}`));
    const err = (await assertRobotsAllowed("https://site.test/" + "a".repeat(5000)).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/^'url' must be 4096 characters or less/);
    expect(isCapabilityRefusal(err)).toBe(true);
    const start = Date.now();
    await assertRobotsAllowed("https://site.test/" + "a".repeat(4000));
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("concurrent checks for one origin share a single robots.txt request", async () => {
    let release: (r: Response) => void = () => {};
    safeFetchMock.mockReturnValueOnce(new Promise<Response>((r) => (release = r)));
    const checks = [1, 2, 3].map((i) => assertRobotsAllowed(`https://site.test/p${i}`));
    release(text("User-agent: *\nAllow: /\n"));
    await Promise.all(checks);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("assertRedirectAllowed checks the final URL only when it differs", async () => {
    safeFetchMock.mockResolvedValue(text("User-agent: *\nDisallow: /private\n"));
    await expect(assertRedirectAllowed("https://a.test/x", "https://a.test/x")).resolves.toBeUndefined();
    await expect(assertRedirectAllowed("https://a.test/x", "")).resolves.toBeUndefined();
    expect(safeFetchMock).not.toHaveBeenCalled();
    await expect(assertRedirectAllowed("https://a.test/x", "https://b.test/private/y")).rejects.toThrow(
      SiteAccessRefusedError,
    );
  });

  it("caches the verdict per origin", async () => {
    safeFetchMock.mockResolvedValue(text("User-agent: *\nDisallow: /no\n"));
    await assertRobotsAllowed("https://site.test/a");
    await assertRobotsAllowed("https://site.test/b");
    await expect(assertRobotsAllowed("https://site.test/no")).rejects.toThrow();
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    await assertRobotsAllowed("https://other.test/no");
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a malformed or non-http URL rather than refusing it", async () => {
    await expect(assertRobotsAllowed("not a url")).resolves.toBeUndefined();
    await expect(assertRobotsAllowed("ftp://site.test/x")).resolves.toBeUndefined();
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("the refusal is a refusal to every health consumer", async () => {
    safeFetchMock.mockResolvedValue(text("User-agent: *\nDisallow: /\n"));
    const err = (await assertRobotsAllowed("https://site.test/x").catch((e: unknown) => e)) as Error;
    const { isUserInputError } = await import("./circuit-breaker.js");
    const { categorizeError } = await import("./quality-capture.js");
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(isUserInputError(err.message)).toBe(true);
    expect(categorizeError(err)).toBe("capability_refusal");
    const cls = classifyTransactionFailure(err.message);
    expect(cls).toBe("tos_policy");
    expect(countsAgainstCapability(cls)).toBe(false);
  });
});
