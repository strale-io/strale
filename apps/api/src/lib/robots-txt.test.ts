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

  it("a 429 robots.txt is treated like a 5xx: refused", async () => {
    safeFetchMock.mockResolvedValue(text("", 429));
    await expect(assertRobotsAllowed("https://site.test/x")).rejects.toThrow(SiteAccessRefusedError);
  });

  it("a transport failure allows the fetch and is not cached", async () => {
    safeFetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND site.test"));
    await expect(assertRobotsAllowed("https://site.test/x")).resolves.toBeUndefined();
    safeFetchMock.mockResolvedValueOnce(text("User-agent: *\nDisallow: /\n"));
    await expect(assertRobotsAllowed("https://site.test/x")).rejects.toThrow(SiteAccessRefusedError);
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
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
