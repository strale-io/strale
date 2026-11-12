/**
 * page-exists against a host that does not resolve, with the real fetch path.
 *
 * PR #1018 review B1: safeFetch's robots.txt pre-check rethrows the resolver's
 * own Error (code ENOTFOUND or EAI_AGAIN, not wrapped in a TypeError), so a
 * test that mocks safeFetch cannot see what the executor receives. Here
 * safeFetch, the robots pre-check and undici stay real; only the resolver is
 * mocked, so no request leaves the machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn(), lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ default: dns }));
vi.mock("node:dns", () => ({ lookup: dns.lookup }));

import { getDirectExecutor } from "./index.js";
import "./page-exists.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { withAcquisitionMethod } from "../lib/data-access.js";
import { assertBillableOutput, outcomeFromError } from "../lib/execution-outcome.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

const URL_UNDER_TEST = "https://no-such-host.test/listing/123";

/** What getaddrinfo hands back: a plain Error carrying an errno code. */
function resolverFails(code: string) {
  const fail = (hostname: string) =>
    Object.assign(new Error(`getaddrinfo ${code} ${hostname}`), { code, errno: -3008, syscall: "getaddrinfo", hostname });
  dns.resolve4.mockRejectedValue(fail("no-such-host.test"));
  dns.resolve6.mockRejectedValue(fail("no-such-host.test"));
  dns.lookup.mockImplementation((hostname: string, _opts: unknown, callback: (err: Error) => void) => {
    queueMicrotask(() => callback(fail(hostname)));
  });
}

const run = () =>
  withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor("page-exists")!({ url: URL_UNDER_TEST }));

beforeEach(() => {
  __resetRobotsCacheForTests();
  dns.resolve4.mockReset();
  dns.resolve6.mockReset();
  dns.lookup.mockReset();
});

describe("page-exists, real safeFetch and robots pre-check, resolver mocked (review B1)", () => {
  it("bills exists:false with reason dns_nxdomain when the host does not exist", async () => {
    resolverFails("ENOTFOUND");
    const result = (await run()) as { output: Record<string, unknown> };
    expect(result.output).toMatchObject({ exists: false, confidence: "high", reason: "dns_nxdomain", status_code: null });
    expect(() => assertBillableOutput("page-exists", result.output)).not.toThrow();
    expect(dns.lookup).toHaveBeenCalled();
  });

  // promise-audit T1 follow-up 34: EAI_AGAIN is Strale's own resolver failing
  // for now, not the caller's site, so it counts against page-exists.
  it("fails unbilled, as its own failure, when Strale's resolver only fails for now", async () => {
    resolverFails("EAI_AGAIN");
    const err = await run().then(
      () => { throw new Error("expected page-exists to throw"); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    const upstream = err as UpstreamUnavailableError;
    expect(upstream.message).toContain("network error (EAI_AGAIN); retry shortly.");
    expect(upstream.retryable).toBe(true);
    expect(isUserInputError(upstream.message)).toBe(false);
    expect(outcomeFromError(upstream)).toMatchObject({
      billable: false,
      fault: "provider",
      counts_against_capability: true,
    });
  });
});

/**
 * PR #1018 review round 2, S-a: an ENOTFOUND for a host the caller did not
 * ask about (a redirect hop, or where the site's robots.txt redirects) says
 * nothing about the requested page. Here the requested host resolves and
 * answers; global fetch stands in for undici on the wire, and fails for the
 * other host the way undici does (TypeError "fetch failed", the resolver's
 * Error on its cause). safeFetch's redirect loop and the robots pre-check
 * stay real.
 */
describe("page-exists, a live page that leads to a host that does not resolve (review round 2, S-a)", () => {
  const LIVE = "https://live.test/listing/123";

  function wire(routes: (url: URL) => Response | "nxdomain") {
    dns.resolve4.mockImplementation(async (hostname: string) => {
      if (hostname === "live.test") return ["93.184.216.34"];
      throw Object.assign(new Error(`queryA ENOTFOUND ${hostname}`), { code: "ENOTFOUND", hostname });
    });
    dns.resolve6.mockImplementation(async (hostname: string) => {
      throw Object.assign(new Error(`queryAaaa ENODATA ${hostname}`), { code: "ENODATA", hostname });
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const answer = routes(url);
      if (answer !== "nxdomain") return answer;
      const cause = Object.assign(new Error(`getaddrinfo ENOTFOUND ${url.hostname}`), {
        code: "ENOTFOUND",
        errno: -3008,
        syscall: "getaddrinfo",
        hostname: url.hostname,
      });
      throw Object.assign(new TypeError("fetch failed"), { cause });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const runLive = () =>
    withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor("page-exists")!({ url: LIVE }));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function expectNotBilled() {
    const err = await runLive().then(
      (r) => { throw new Error(`expected a throw, got ${JSON.stringify((r as { output?: unknown }).output)}`); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    const upstream = err as UpstreamUnavailableError;
    expect(upstream.code).toBe("ENOTFOUND");
    expect(upstream.retryable).toBe(false);
    expect(outcomeFromError(upstream)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  }

  it("does not bill exists:false when the live page redirects to a host that does not resolve", async () => {
    const fetchMock = wire((url) => {
      if (url.hostname !== "live.test") return "nxdomain";
      if (url.pathname === "/robots.txt") return new Response("", { status: 404 });
      return new Response("", { status: 301, headers: { location: "https://gone.test/listing/123" } });
    });
    await expectNotBilled();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("gone.test"))).toBe(true);
  });

  it("does not bill exists:false when the live site's robots.txt redirects to a host that does not resolve", async () => {
    wire((url) => {
      if (url.hostname !== "live.test") return "nxdomain";
      if (url.pathname === "/robots.txt") return new Response("", { status: 301, headers: { location: "https://gone.test/robots.txt" } });
      return new Response("<html><body>listing</body></html>", { status: 200 });
    });
    await expectNotBilled();
  });

  // Review round 4, T7: the limitation says an unreadable robots.txt fails
  // the call unbilled; this pins that a 5xx on robots.txt does.
  it("fails unbilled, without fetching the page, when the site's robots.txt answers with a server error", async () => {
    const fetchMock = wire((url) => {
      if (url.pathname === "/robots.txt") return new Response("", { status: 503 });
      return new Response("<html><body>listing</body></html>", { status: 200 });
    });
    const err = await runLive().then(
      (r) => { throw new Error(`expected a throw, got ${JSON.stringify((r as { output?: unknown }).output)}`); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/listing/123"))).toBe(false);
  });
});
