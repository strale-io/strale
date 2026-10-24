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

import { __resetWebProviderCacheForTests, assertPlainPreflightAllowed, assertRenderedTargetAllowed, fetchCompanyPage, fetchPage } from "./web-provider.js";
import { __resetRobotsCacheForTests } from "../../lib/robots-txt.js";
import { STRALE_USER_AGENT, SiteAccessRefusedError, SourceBlockedError } from "../../lib/site-access.js";
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
      if (String(url).startsWith("https://elsewhere.test")) {
        return new Response("User-agent: *\nDisallow: /private\n", { status: 200, headers: { "content-type": "text/plain" } });
      }
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

  it("applies to the Browserless-only path too, before the preflight", async () => {
    robotsBody = "User-agent: StraleBot\nDisallow: /\n";
    await refusalFrom(fetchPage(PAGE, { skipFallback: true }));
    expect(pageCalls()).toHaveLength(0);
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

function redirectedTo(resp: Response, finalUrl: string): Response {
  Object.defineProperty(resp, "url", { value: finalUrl });
  return resp;
}

describe("redirects are held to the final URL's robots.txt", () => {
  it("REGRESSION: an allowed URL that redirects to a disallowed one is refused", async () => {
    pageResponse = () => redirectedTo(html(REAL_PAGE), "https://elsewhere.test/private/page");
    const err = await refusalFrom(fetchPage(PAGE));
    expect(err.block.kind).toBe("robots_disallow");
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a redirect to an allowed URL is fine", async () => {
    pageResponse = () => redirectedTo(html(REAL_PAGE), "https://elsewhere.test/public");
    const r = await fetchPage(PAGE);
    expect(r.html).toBe(REAL_PAGE);
  });

  it("REGRESSION: Browserless landing on a disallowed URL (X-Response-URL) is refused", async () => {
    browserlessFetchMock.mockImplementation(async () =>
      html(REAL_PAGE, 200, { "x-response-code": "200", "x-response-url": "https://elsewhere.test/private/x" }),
    );
    await refusalFrom(fetchPage(PAGE, { skipFallback: true }));
  });
});

describe("a non-block 4xx is terminal but stays an ordinary failure", () => {
  it("a 400 is not a site-access refusal", async () => {
    pageResponse = () => html("bad", 400);
    const err = (await fetchPage(PAGE).catch((e: unknown) => e)) as Error;
    expect(err).not.toBeInstanceOf(SiteAccessRefusedError);
    expect(classifyTransactionFailure(err.message)).not.toBe("tos_policy");
  });
});

describe("a block on a source STRALE chose is a capability fault, not a refusal", () => {
  it("REGRESSION: source: \"strale\" turns the block into SourceBlockedError, which counts", async () => {
    pageResponse = () => html("denied", 403);
    const err = (await fetchPage(PAGE, { source: "strale" }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(browserlessFetchMock, "still no other route").not.toHaveBeenCalled();
    expect(isCapabilityRefusal(err)).toBe(false);
    expect(isUserInputError(err.message), "a dead source must be able to open the breaker").toBe(false);
    const cls = classifyTransactionFailure(err.message);
    expect(cls).toBe("upstream");
    expect(countsAgainstCapability(cls)).toBe(true);
    expect(err.message).not.toMatch(/Use a page the site serves publicly/);
  });

  it("the trust surfaces label it upstream, not a Strale defect", async () => {
    pageResponse = () => html("denied", 403);
    const err = (await fetchPage(PAGE, { source: "strale" }).catch((e: unknown) => e)) as Error;
    expect(categorizeError(err)).toBe("upstream_error");
  });

  it("a robots.txt disallow on a Strale-chosen source counts too", async () => {
    robotsBody = "User-agent: *\nDisallow: /\n";
    const err = (await fetchPage(PAGE, { source: "strale" }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(countsAgainstCapability(classifyTransactionFailure(err.message))).toBe(true);
  });

  it("fetchCompanyPage (registries) is always a Strale-chosen source", async () => {
    browserlessFetchMock.mockImplementation(async () => html(REAL_PAGE, 200, { "x-response-code": "403" }));
    await expect(fetchCompanyPage(PAGE)).rejects.toBeInstanceOf(SourceBlockedError);
  });
});

describe("a rendered route with no plain tier looks at the site plainly first", () => {
  // Chrome can run a JavaScript challenge to completion before the page is
  // read, so a route without tier 1 (skipFallback, /screenshot, /pdf) must see
  // the site's first answer before Browserless is asked.
  it("REGRESSION: a challenge served to the plain look stops skipFallback before Browserless", async () => {
    pageResponse = () => html(CHALLENGE);
    const err = await refusalFrom(fetchPage(PAGE, { skipFallback: true }));
    expect(err.block.kind).toBe("challenge");
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: a non-default waitUntil (no tier 1) gets the same plain look", async () => {
    pageResponse = () => html("blocked", 403);
    const err = await refusalFrom(fetchPage(PAGE, { waitUntil: "domcontentloaded" }));
    expect(err.block).toEqual({ kind: "http", status: 403 });
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a challenge served with a 503 is refused too", async () => {
    pageResponse = () => html(CHALLENGE, 503);
    const err = await refusalFrom(assertPlainPreflightAllowed(PAGE));
    expect(err.block.kind).toBe("challenge");
  });

  it("a redirect robots.txt disallows is refused", async () => {
    pageResponse = () => {
      const r = html(REAL_PAGE);
      Object.defineProperty(r, "url", { value: "https://elsewhere.test/private/x" });
      return r;
    };
    await refusalFrom(assertPlainPreflightAllowed(PAGE));
  });

  it("an ordinary page passes, and so does a plain 5xx (the render may still work)", async () => {
    await expect(assertPlainPreflightAllowed(PAGE)).resolves.toBe(200);
    pageResponse = () => html("server error", 502);
    await expect(assertPlainPreflightAllowed(PAGE)).resolves.toBe(502);
  });

  it("a transport failure is left to the rendered route (timeout, DNS, TLS, parser, dual-stack, a long chain)", async () => {
    const fetchFailed = (cause: unknown) => Object.assign(new TypeError("fetch failed"), { cause });
    const failures = [
      // AbortSignal.timeout rejects with a DOMException named TimeoutError, numeric code 23.
      Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError", code: 23 }),
      fetchFailed(Object.assign(new Error("getaddrinfo ENOTFOUND site.test"), { code: "ENOTFOUND" })),
      // Node's OpenSSL refuses legacy TLS that Chrome still opens.
      fetchFailed(Object.assign(new Error("packet length too long"), { code: "ERR_SSL_PACKET_LENGTH_TOO_LONG" })),
      fetchFailed(Object.assign(new Error("Response does not match the HTTP/1.1 protocol"), { name: "HTTPParserError" })),
      fetchFailed(new AggregateError([Object.assign(new Error("connect EAFNOSUPPORT"), { code: "EAFNOSUPPORT" })])),
      new Error("Too many redirects (>20) — refusing to follow further. Starting URL: https://site.test/page."),
    ];
    for (const failure of failures) {
      pageResponse = () => {
        throw failure;
      };
      await expect(assertPlainPreflightAllowed(PAGE), failure.message).resolves.toBeUndefined();
    }
  });

  it("REGRESSION: a connection-time SSRF refusal is passed on as itself, not swallowed or left as 'fetch failed'", async () => {
    const refusal = Object.assign(new Error("Resolved host targets a restricted address."), { code: "ESSRFBLOCKED" });
    pageResponse = () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: refusal });
    };
    await expect(assertPlainPreflightAllowed(PAGE)).rejects.toBe(refusal);
  });

  it("REGRESSION: a refusal is decided on its code, not on words in the caller's URL", async () => {
    pageResponse = () => {
      throw new Error("Reddit is not a supported source: its Terms of Service prohibit automated access (https://socket.abort.test/timeout).");
    };
    await expect(assertPlainPreflightAllowed(PAGE)).rejects.toThrow(/Terms of Service prohibit automated access/);
  });

  it("REGRESSION: a non-block 4xx is the target's final answer, as in tier 1 (no render)", async () => {
    pageResponse = () => html("bad request", 400);
    await expect(fetchPage(PAGE, { skipFallback: true })).rejects.toThrow(/URL returned HTTP 400/);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a 416, which a ranged GET can draw by itself, still renders on the fetchPage route", async () => {
    pageResponse = () => html("", 416);
    await expect(fetchPage(PAGE, { skipFallback: true })).resolves.toBeDefined();
    expect(browserlessFetchMock).toHaveBeenCalledTimes(1);
  });

  it("the preflight itself refuses only blocks and challenges; a 404 is the caller's to judge", async () => {
    // A screenshot or PDF of a 404 page (or a single-page app that serves its
    // routes with 404) behaves as before this check existed.
    pageResponse = () => html("not found", 404);
    await expect(assertPlainPreflightAllowed(PAGE)).resolves.toBe(404);
  });

  it("follows a redirect chain as long as Chrome would (20 hops)", async () => {
    await assertPlainPreflightAllowed(PAGE);
    const [, init] = pageCalls().at(-1) as [string, { maxRedirects?: number }];
    expect(init.maxRedirects).toBe(20);
  });

  it("a cached render is served without a new preflight", async () => {
    await fetchPage(PAGE, { skipFallback: true });
    const before = pageCalls().length;
    await fetchPage(PAGE, { skipFallback: true });
    expect(pageCalls().length).toBe(before);
    expect(browserlessFetchMock).toHaveBeenCalledTimes(1);
  });

  it("a page that ignores Range is read only to the cap", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    pageResponse = () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulled += chunk.length;
            if (pulled > 64 * 1024 * 1024) controller.close();
            else controller.enqueue(chunk);
          },
        }),
        { status: 200, headers: { "content-type": "text/html" } },
      );
    await assertPlainPreflightAllowed(PAGE);
    expect(pulled).toBeLessThan(1024 * 1024);
  });

  it("a block's body is released before the refusal", async () => {
    const cancel = vi.fn();
    pageResponse = () =>
      new Response(new ReadableStream({ pull() {}, cancel }), { status: 403, headers: { "content-type": "text/html" } });
    await refusalFrom(assertPlainPreflightAllowed(PAGE));
    expect(cancel).toHaveBeenCalled();
  });
});

describe("a Browserless redirect is held to the blocklist", () => {
  it("REGRESSION: landing on a blocklisted host (X-Response-URL) is refused", async () => {
    const res = html(REAL_PAGE, 200, { "x-response-code": "200", "x-response-url": "https://www.trustpilot.com/review/x" });
    await expect(assertRenderedTargetAllowed(PAGE, res)).rejects.toThrow(/Terms of Service prohibit automated access/);
  });

  it("an ordinary final URL passes", async () => {
    const res = html(REAL_PAGE, 200, { "x-response-code": "200", "x-response-url": PAGE });
    await expect(assertRenderedTargetAllowed(PAGE, res)).resolves.toBeUndefined();
  });
});

describe("tier 1 never hands Strale's own refusals to Chrome", () => {
  // Before this, any tier-1 error the catch did not recognise fell through to
  // Browserless — including a blocklist refusal on a redirect hop and the
  // connection-time SSRF block — so Chrome visited the place Strale refused.
  it("REGRESSION: a blocklisted host on a redirect hop is refused, and Chrome is not asked", async () => {
    pageResponse = () => {
      throw new Error("LinkedIn is not a supported source: its Terms of Service prohibit automated access, so Strale does not fetch it.");
    };
    await expect(fetchPage(PAGE)).rejects.toThrow(/Terms of Service prohibit automated access/);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: a connection-time SSRF block is refused as itself, and Chrome is not asked", async () => {
    const refusal = Object.assign(new Error("Resolved host targets a restricted address."), { code: "ESSRFBLOCKED" });
    pageResponse = () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: refusal });
    };
    await expect(fetchPage(PAGE)).rejects.toBe(refusal);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: a name that does not resolve is reported, not rendered (undici's message is only 'fetch failed')", async () => {
    pageResponse = () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND site.test"), { code: "ENOTFOUND" }) });
    };
    await expect(fetchPage(PAGE)).rejects.toThrow(/Could not reach site\.test/);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: after a tier-1 transport failure, a challenge seen by the plain look stops the call", async () => {
    let calls = 0;
    pageResponse = () => {
      calls += 1;
      if (calls === 1) throw new Error("Too many redirects (>3) — refusing to follow further. Starting URL: https://site.test/page.");
      return html(CHALLENGE);
    };
    const err = await refusalFrom(fetchPage(PAGE));
    expect(err.block.kind).toBe("challenge");
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a tier-1 timeout still reaches Chrome once the plain look also fails in transport", async () => {
    pageResponse = () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError", code: 23 });
    };
    await expect(fetchPage(PAGE)).resolves.toBeDefined();
    expect(pageCalls()).toHaveLength(2);
    expect(browserlessFetchMock).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: a body that breaks off mid-read ('terminated': a reset, a bad encoding) still renders, after a plain look", async () => {
    for (const code of ["UND_ERR_SOCKET", "Z_DATA_ERROR"]) {
      safeFetchMock.mockClear();
      browserlessFetchMock.mockClear();
      __resetWebProviderCacheForTests();
      let calls = 0;
      pageResponse = () => {
        calls += 1;
        if (calls > 1) return html(REAL_PAGE);
        const broken = Object.assign(new TypeError("terminated"), { cause: Object.assign(new Error("other side closed"), { code }) });
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<html><body>"));
              controller.error(broken);
            },
          }),
          { status: 200, headers: { "content-type": "text/html" } },
        );
      };
      await expect(fetchPage(PAGE), code).resolves.toBeDefined();
      // The first answer was never fully seen, so a plain look came before Chrome.
      expect(pageCalls(), code).toHaveLength(2);
      expect(browserlessFetchMock, code).toHaveBeenCalledTimes(1);
    }
  });

  it("a refused connection is reported, not rendered", async () => {
    pageResponse = () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    };
    await expect(fetchPage(PAGE)).rejects.toThrow(/connection was refused/);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a redirect to an invalid URL ends the call with a readable sentence", async () => {
    pageResponse = () => {
      throw Object.assign(new TypeError("Invalid URL"), { code: "ERR_INVALID_URL" });
    };
    await expect(fetchPage(PAGE)).rejects.toThrow(/redirected to an address that is not a valid URL/);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("a page tier 1 saw (a JavaScript shell) is rendered without a second plain look", async () => {
    pageResponse = () => html("<html><body><div id=root></div></body></html>");
    await fetchPage(PAGE);
    expect(pageCalls()).toHaveLength(1);
    expect(browserlessFetchMock).toHaveBeenCalledTimes(1);
  });
});
