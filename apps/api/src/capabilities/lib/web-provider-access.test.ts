/**
 * DEC-20261023-A on the shared fetch path: honest identification on every
 * route, robots.txt before the first request, and a block STOPS the chain.
 *
 * Before 2026-10-24 the plain-fetch tier treated 400/403/429 as routine
 * bot-gating and fell through to Jina and then Browserless, and a challenge
 * page was sent to the real browser so it would execute the challenge. Each
 * "is not sent to Browserless" assertion below fails against that code.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.fn();
const browserlessFetchMock = vi.fn();

vi.mock("../../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));
vi.mock("../../lib/metered-vendor-fetch.js", () => ({
  browserlessFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  meteredVendorFetch: (...args: unknown[]) => browserlessFetchMock(...args),
  vendorReachabilityFetch: (...args: unknown[]) => browserlessFetchMock(...args),
}));
vi.mock("../../lib/url-validator.js", () => ({ validateUrl: vi.fn(async () => {}) }));

import { __resetWebProviderCacheForTests, fetchPage } from "./web-provider.js";
import { __resetRobotsCacheForTests } from "../../lib/robots-txt.js";
import { STRALE_USER_AGENT, SiteAccessRefusedError } from "../../lib/site-access.js";
import { isCapabilityRefusal } from "../../lib/capability-refusal.js";
import { isUserInputError } from "../../lib/circuit-breaker.js";
import { categorizeError } from "../../lib/quality-capture.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "../../lib/transaction-failure-taxonomy.js";

const PAGE = "https://site.test/page";
const REAL_PAGE = `<html><body><p>${"Real page content. ".repeat(200)}</p></body></html>`;
const CHALLENGE = `<html><body>${"x".repeat(2500)} Checking your browser before accessing site.test</body></html>`;

let robotsBody: string | null = null; // null → robots.txt answers 404
let pageResponse: () => Response;

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
}

function pageCalls(): unknown[][] {
  return safeFetchMock.mock.calls.filter(([url]) => !String(url).endsWith("/robots.txt"));
}

beforeEach(() => {
  safeFetchMock.mockReset();
  browserlessFetchMock.mockReset();
  __resetWebProviderCacheForTests();
  __resetRobotsCacheForTests();
  vi.stubGlobal("fetch", vi.fn(async () => html(REAL_PAGE)));
  process.env.BROWSERLESS_URL = "https://chromium.test";
  process.env.BROWSERLESS_API_KEY = "test-key";
  robotsBody = null;
  pageResponse = () => html(REAL_PAGE);
  safeFetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/robots.txt")) {
      return robotsBody === null
        ? new Response("", { status: 404 })
        : new Response(robotsBody, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return pageResponse();
  });
  browserlessFetchMock.mockImplementation(async () => html(REAL_PAGE));
});

async function refusalFrom(p: Promise<unknown>): Promise<SiteAccessRefusedError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected a site-access refusal").toBeInstanceOf(SiteAccessRefusedError);
  return err as SiteAccessRefusedError;
}

describe("honest identification", () => {
  it("the plain fetch sends the Strale user agent", async () => {
    await fetchPage(PAGE);
    const [, init] = pageCalls()[0] as [string, { headers: Record<string, string> }];
    expect(init.headers["User-Agent"]).toBe(STRALE_USER_AGENT);
  });

  it("the Browserless route sends the Strale user agent in its body", async () => {
    await fetchPage(PAGE, { skipFallback: true });
    const [, init] = browserlessFetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).userAgent).toBe(STRALE_USER_AGENT);
  });

  it("the user agent says what it is", () => {
    expect(STRALE_USER_AGENT).toMatch(/StraleBot/);
    expect(STRALE_USER_AGENT).not.toMatch(/Chrome\/|Safari\/|Windows NT|AppleWebKit/);
  });
});

describe("robots.txt is honoured before the first request", () => {
  it("REGRESSION: a Disallow refuses without fetching the page on any route", async () => {
    robotsBody = "User-agent: *\nDisallow: /page\n";
    const err = await refusalFrom(fetchPage(PAGE));
    expect(err.block.kind).toBe("robots_disallow");
    expect(pageCalls()).toHaveLength(0);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("applies to the Browserless-only path too", async () => {
    robotsBody = "User-agent: StraleBot\nDisallow: /\n";
    await refusalFrom(fetchPage(PAGE, { skipFallback: true }));
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("an allowed path is fetched normally", async () => {
    robotsBody = "User-agent: *\nDisallow: /other\n";
    const r = await fetchPage(PAGE);
    expect(r.html).toBe(REAL_PAGE);
  });
});

describe("a block stops the chain (no other route is tried)", () => {
  for (const status of [401, 403, 407, 429]) {
    it(`REGRESSION: a plain-fetch HTTP ${status} is refused and NOT sent to Browserless`, async () => {
      pageResponse = () => html("denied", status);
      const err = await refusalFrom(fetchPage(PAGE));
      expect(err.block).toEqual({ kind: "http", status });
      expect(browserlessFetchMock).not.toHaveBeenCalled();
      expect(globalThis.fetch, "a third route (Jina) was tried").not.toHaveBeenCalled();
    });
  }

  it("REGRESSION: a challenge page served with 200 is refused, not handed to the real browser", async () => {
    pageResponse = () => html(CHALLENGE);
    const err = await refusalFrom(fetchPage(PAGE));
    expect(err.block.kind).toBe("challenge");
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: a challenge page served with a 5xx is refused too", async () => {
    pageResponse = () => html(CHALLENGE, 503);
    await refusalFrom(fetchPage(PAGE));
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a 400 is terminal (no other route), with the ordinary not-loaded wording", async () => {
    pageResponse = () => html("bad", 400);
    await expect(fetchPage(PAGE)).rejects.toThrow(/URL returned HTTP 400/);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: Browserless reporting the target's 403 in X-Response-Code is refused without a retry", async () => {
    browserlessFetchMock.mockImplementation(async () => html(REAL_PAGE, 200, { "x-response-code": "403" }));
    const err = await refusalFrom(fetchPage(PAGE, { skipFallback: true, maxRetries: 3 }));
    expect(err.block).toEqual({ kind: "http", status: 403 });
    expect(browserlessFetchMock).toHaveBeenCalledTimes(1);
  });

  it("Browserless reporting the target's 429 is refused too", async () => {
    browserlessFetchMock.mockImplementation(async () => html(REAL_PAGE, 200, { "x-response-code": "429" }));
    await refusalFrom(fetchPage(PAGE, { skipFallback: true }));
  });

  it("a challenge in the rendered page is refused", async () => {
    browserlessFetchMock.mockImplementation(async () => html(CHALLENGE));
    const err = await refusalFrom(fetchPage(PAGE, { skipFallback: true }));
    expect(err.block.kind).toBe("challenge");
  });
});

describe("escalation that is NOT routing around a block still works", () => {
  it("a JavaScript shell (200, almost no text) is rendered by Browserless", async () => {
    pageResponse = () => html("<html><body><div id=root></div></body></html>");
    const r = await fetchPage(PAGE);
    expect(r.html).toBe(REAL_PAGE);
    expect(browserlessFetchMock).toHaveBeenCalledTimes(1);
  });

  it("a plain 5xx (not a challenge) falls through to Browserless", async () => {
    pageResponse = () => html("upstream broke", 502);
    const r = await fetchPage(PAGE);
    expect(r.html).toBe(REAL_PAGE);
  });

  it("Jina is never called on the way", async () => {
    pageResponse = () => html("<html><body></body></html>");
    await fetchPage(PAGE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("an X-Response-Code of 200 is an ordinary render", async () => {
    browserlessFetchMock.mockImplementation(async () => html(REAL_PAGE, 200, { "x-response-code": "200" }));
    const r = await fetchPage(PAGE, { skipFallback: true });
    expect(r.html).toBe(REAL_PAGE);
  });
});

describe("a site block is a refusal to every health consumer", () => {
  it("breaker, trust surfaces, taxonomy and floor all exempt it", async () => {
    pageResponse = () => html("denied", 403);
    const err = await refusalFrom(fetchPage(PAGE));
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(isUserInputError(err.message), "would open the circuit breaker").toBe(true);
    expect(categorizeError(err), "would count on the trust surfaces").toBe("capability_refusal");
    const cls = classifyTransactionFailure(err.message);
    expect(cls).toBe("tos_policy");
    expect(countsAgainstCapability(cls), "would count against the quality floor").toBe(false);
  });

  it("still recognised when an executor wraps the message in its own sentence", () => {
    const wrapped = `Could not fetch site.test: Site refused automated access: site.test refuses automated access (HTTP 403). Strale stops at a site's block and does not retry it through another route, so retrying the same URL will not succeed.`;
    expect(isCapabilityRefusal(wrapped)).toBe(true);
    expect(classifyTransactionFailure(wrapped)).toBe("tos_policy");
  });

  it("NEGATIVE CONTROL: a genuine upstream failure still counts", () => {
    const cls = classifyTransactionFailure("The target site (site.test) returned a server error (HTTP 503).");
    expect(cls).not.toBe("tos_policy");
  });
});
