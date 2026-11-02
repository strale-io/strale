import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const dns = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn(), lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ default: dns }));
vi.mock("node:dns", () => ({ lookup: dns.lookup }));
import { safeFetch, safeHttpAgent } from "./safe-fetch.js";
import { __resetRobotsCacheForTests } from "./robots-txt.js";
import { withAcquisitionMethod } from "./data-access.js";
import { refusalDetails } from "./capability-refusal.js";
import { STRALE_USER_AGENT } from "./site-access.js";

beforeEach(() => {
  __resetRobotsCacheForTests();
  dns.resolve4.mockResolvedValue(["93.184.216.34"]);
  dns.resolve6.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());
const page = () => new Response("page");
const fetchPage = (path = "/private") => withAcquisitionMethod("customer_directed_fetch", () => safeFetch(`https://site.test${path}`));

describe("H6 robots enforcement inside safeFetch", () => {
  it.each(["*", "StraleBot"])("stops a %s disallow before requesting the page", async agent => {
    const fetch = vi.fn(async () => new Response(`User-agent: ${agent}\nDisallow: /private`));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPage()).rejects.toMatchObject({ block: { kind: "robots_disallow" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://site.test/robots.txt");
  });
  it("allows a longer Allow rule and sends the honest agent on both requests", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("User-agent: *\nDisallow: /\nAllow: /public")).mockResolvedValueOnce(page());
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPage("/public")).resolves.toBeInstanceOf(Response);
    expect(fetch.mock.calls.map(call => new Headers(call[1].headers).get("user-agent"))).toEqual([STRALE_USER_AGENT, STRALE_USER_AGENT]);
  });
  it("matches wildcard rules", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("User-agent: *\nDisallow: /*.pdf$"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPage("/a/doc.pdf")).rejects.toMatchObject({ block: { kind: "robots_disallow" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("caches for an hour per origin and checks each page path", async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /private") : page());
    vi.stubGlobal("fetch", fetch);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await fetchPage("/public"); await fetchPage("/other");
      await expect(fetchPage()).rejects.toThrow();
      expect(fetch.mock.calls.filter(([url]) => url.endsWith("/robots.txt"))).toHaveLength(1);
      clock.mockReturnValue(now + 3_600_001);
      await fetchPage("/public");
      expect(fetch.mock.calls.filter(([url]) => url.endsWith("/robots.txt"))).toHaveLength(2);
    } finally { clock.mockRestore(); }
  });
  it.each([400, 401, 403, 404, 429])( "robots HTTP %s allows the page", async status => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(page());
    vi.stubGlobal("fetch", fetch);
    await fetchPage(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("robots 5xx stops before the page", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPage()).rejects.toMatchObject({ block: { kind: "robots_unavailable", status: 503 } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("robots timeout is bounded and conservative", async () => {
    const fetch = vi.fn().mockImplementation(async (_url, init) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("timeout", "TimeoutError");
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(fetchPage()).rejects.toMatchObject({ block: { kind: "robots_unavailable", status: 0 } });
      expect(timeout).toHaveBeenCalledWith(5000);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { timeout.mockRestore(); }
  });
  it.each(["vendor_api", "direct_api"] as const)("%s skips robots even within a page executor", async method => {
    const fetch = vi.fn().mockResolvedValue(page()); vi.stubGlobal("fetch", fetch);
    await withAcquisitionMethod("public_page_read", () => safeFetch("https://api.test/data", { acquisitionMethod: method }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://api.test/data");
  });
  it("checks a redirected path before requesting it", async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith("robots.txt")
      ? new Response("User-agent: *\nDisallow: /private")
      : new Response(null, { status: 302, headers: { location: "/private" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPage("/public")).rejects.toMatchObject({ block: { kind: "robots_disallow" } });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["https://site.test/robots.txt", "https://site.test/public"]);
  });
});

const blocked = ["0.1.2.3", "100.64.0.1", "198.18.0.1", "198.19.255.254", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "192.0.2.1", "198.51.100.1", "203.0.113.1", "::ffff:10.0.0.1", "::ffff:c612:1", "0:0:0:0:0:ffff:c612:1", "64:ff9b::808:808", "2002:0808:0808::1", "2001:db8::1", "ff02::1"];
describe("H6 SSRF DNS resolution", () => {
  it.each(blocked)("refuses %s before fetch", async address => {
    dns.resolve4.mockResolvedValue(address.includes(":") ? [] : [address]);
    dns.resolve6.mockResolvedValue(address.includes(":") ? [address] : []);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(safeFetch("https://target.test/data")).rejects.toThrow("restricted");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(blocked)("connection-time lookup also refuses %s", async address => {
    dns.lookup.mockImplementation((_host, _opts, callback) => callback(null, address, address.includes(":") ? 6 : 4));
    const lookup = safeHttpAgent.options.lookup;
    const callback = vi.fn();
    lookup("target.test", {}, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "ESSRFBLOCKED" }));
  });
});

it("H6 a robots transport failure advises bounded retry on object and string error paths", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  const error = await fetchPage().catch(error => error);
  expect(error.message).not.toContain("retrying the same URL will not succeed");
  for (const shape of [error, error.message]) {
    expect(refusalDetails(shape)).toMatchObject({ retryable: true, retry_after_seconds: 300, next_step: expect.stringContaining("same URL") });
  }
});

it("H6 the robots deadline includes stalled DNS and never fetches after late resolution", async () => {
  const realTimeout = AbortSignal.timeout;
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => ms === 5000 ? deadline.signal : realTimeout(ms));
  let finishDns!: (addresses: string[]) => void;
  dns.resolve4.mockResolvedValueOnce(["93.184.216.34"]).mockImplementationOnce(() => new Promise(resolve => { finishDns = resolve; }));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  try {
    const result = fetchPage().catch(error => error);
    await vi.waitFor(() => expect(finishDns).toBeTypeOf("function"));
    deadline.abort(new DOMException("deadline exceeded", "TimeoutError"));
    expect(await result).toMatchObject({ block: { kind: "robots_unavailable", status: 0 } });
    expect(fetch).not.toHaveBeenCalled();
    finishDns(["93.184.216.34"]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  } finally { timeout.mockRestore(); }
});
