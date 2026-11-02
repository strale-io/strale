import { afterEach, beforeEach, expect, it, vi } from "vitest";
const dns = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock("dns/promises", () => ({ default: dns }));
import { getDirectExecutor } from "./index.js";
import { withAcquisitionMethod } from "../lib/data-access.js";
import { __resetRobotsCacheForTests, assertRobotsAllowed } from "../lib/robots-txt.js";
import { STRALE_USER_AGENT } from "../lib/site-access.js";
import "./uptime-check.js";
import "./url-health-check.js";
import "./redirect-trace.js";
import "./paid-api-preflight.js";
import "./robots-txt-parse.js";
import "./api-health-check.js";
import "./page-exists.js";
import "./url-to-markdown.js";
const run = (slug: string) => withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor(slug)!({ url: "https://site.test/path" }));
beforeEach(() => {
  __resetRobotsCacheForTests();
  dns.resolve4.mockResolvedValue(["93.184.216.34"]);
  dns.resolve6.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(["uptime-check", "url-health-check", "redirect-trace", "paid-api-preflight"])("Round 2 %s probes a Disallow-all site without retrieving page content", async slug => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("robots.txt")) return new Response("User-agent: *\nDisallow: /");
    expect(new Headers(init.headers).get("user-agent")).toBe(STRALE_USER_AGENT);
    return new Response("private-page-content");
  });
  vi.stubGlobal("fetch", fetch);
  // Populate a real Disallow verdict first, then prove it cannot change the probe.
  await expect(assertRobotsAllowed("https://site.test/path")).rejects.toThrow();
  const { output } = await run(slug);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["https://site.test/robots.txt", "https://site.test/path"]);
  expect(JSON.stringify(output)).not.toContain("private-page-content");
  if (slug === "uptime-check") expect(output.status).toBe("up");
});
it("Round 2 uptime reports a real transport failure as down despite Disallow-all", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("robots.txt")) return new Response("User-agent: *\nDisallow: /");
    throw new Error("connection refused");
  }));
  await expect(assertRobotsAllowed("https://site.test/path")).rejects.toThrow();
  expect((await run("uptime-check")).output).toMatchObject({ status: "down", error: "connection refused" });
});
it.each(["url-to-markdown", "page-exists", "api-health-check"])("Round 2 %s remains content-gated and surfaces refusal", async slug => {
  const fetch = vi.fn(async () => new Response("User-agent: *\nDisallow: /"));
  vi.stubGlobal("fetch", fetch);
  await expect(run(slug)).rejects.toMatchObject({ block: { kind: "robots_disallow" } });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("Round 2 robots-txt-parse fetches its control file directly", async () => {
  const fetch = vi.fn(async () => new Response("User-agent: *\nDisallow: /"));
  vi.stubGlobal("fetch", fetch);
  expect((await run("robots-txt-parse")).output.blocks_all_crawlers).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("Round 2 DNS typo preserves the socket diagnostic from the robots fetch", async () => {
  const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND site.test"), { code: "ENOTFOUND" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: dnsError })));
  await expect(run("url-to-markdown")).rejects.toThrow("getaddrinfo ENOTFOUND site.test");
});
it("Round 2 content monitor latency excludes the robots lookup", async () => {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    now += url.endsWith("robots.txt") ? 500 : 25;
    return new Response(url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : "body");
  }));
  expect((await run("api-health-check")).output.response_time_ms).toBe(25);
});

it("Round 2 content monitor latency excludes robots on redirected origins too", async () => {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("robots.txt")) {
      now += 500;
      return new Response("User-agent: *\nAllow: /");
    }
    now += 25;
    return url.startsWith("https://site.test")
      ? new Response(null, { status: 302, headers: { location: "https://other.test/path" } })
      : new Response("body");
  }));
  expect((await run("api-health-check")).output.response_time_ms).toBe(50);
});
