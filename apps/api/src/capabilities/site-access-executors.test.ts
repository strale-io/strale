/**
 * DEC-20261023-A in the executors that fetch a third-party page themselves
 * rather than (only) through web-provider: honest user agent, robots.txt
 * first, and a block ends the call instead of being retried through another
 * route (Browserless, a proxy, the next path on the same site).
 *
 * Each REGRESSION test fails against the pre-2026-10-24 code, which sent a
 * spoofed Chrome user agent (tech-stack-detect, cookie-scan), rendered a
 * blocked page in Browserless anyway (url-to-markdown, cookie-scan), retried
 * a registry's 403 through a Browserless "EU proxy" (estonian-company-data),
 * and kept trying more paths on a site that had refused (privacy finders).
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, fetchRenderedHtml, browserlessFetchMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  fetchRenderedHtml: vi.fn(),
  browserlessFetchMock: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRenderedHtml,
}));
vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/metered-vendor-fetch.js", () => ({
  browserlessFetch: browserlessFetchMock,
  meteredVendorFetch: browserlessFetchMock,
  vendorReachabilityFetch: browserlessFetchMock,
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));

import { getDirectExecutor } from "./index.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import {
  STRALE_USER_AGENT,
  SiteAccessRefusedError,
  SourceBlockedError,
  siteAccessRefusal,
} from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";

import "./tech-stack-detect.js";
import "./cookie-scan.js";
import "./url-to-markdown.js";
import "./domain-contact-extract.js";
import "./estonian-company-data.js";
import "./company-enrich.js";
import "./privacy-policy-analyze.js";
import "./screenshot-url.js";
import "./html-to-pdf.js";
import "./youtube-summarize.js";
import "./landing-page-roast.js";
import "./container-track.js";

const PAGE_HTML = `<html><head><title>t</title></head><body><p>${"Real words here. ".repeat(300)}</p></body></html>`;

let robotsBody: string | null;
let pageResponse: () => Response;

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

function pageCalls(): Array<[string, { headers?: Record<string, string> }]> {
  return safeFetchMock.mock.calls.filter(([u]) => !String(u).endsWith("/robots.txt")) as Array<
    [string, { headers?: Record<string, string> }]
  >;
}

async function run(slug: string, input: Record<string, unknown>): Promise<unknown> {
  const exec = getDirectExecutor(slug);
  expect(exec, `${slug} is not registered`).toBeDefined();
  return exec!(input).then(
    () => null,
    (e: unknown) => e,
  );
}

beforeEach(() => {
  safeFetchMock.mockReset();
  fetchRenderedHtml.mockReset();
  browserlessFetchMock.mockReset();
  __resetRobotsCacheForTests();
  robotsBody = null;
  pageResponse = () => html(PAGE_HTML);
  safeFetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/robots.txt")) {
      return robotsBody === null
        ? new Response("", { status: 404 })
        : new Response(robotsBody, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return pageResponse();
  });
  fetchRenderedHtml.mockResolvedValue(PAGE_HTML);
  browserlessFetchMock.mockResolvedValue(html(PAGE_HTML));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.BROWSERLESS_URL = "https://chromium.test";
  process.env.BROWSERLESS_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tech-stack-detect", () => {
  it("REGRESSION: identifies as Strale, not as desktop Chrome", async () => {
    await run("tech-stack-detect", { url: "https://site.test" });
    const [, init] = pageCalls()[0];
    expect(init.headers?.["User-Agent"]).toBe(STRALE_USER_AGENT);
  });

  it("a 403 is a site-access refusal", async () => {
    pageResponse = () => html("no", 403);
    const err = await run("tech-stack-detect", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
  });

  it("robots.txt Disallow refuses before the page is requested", async () => {
    robotsBody = "User-agent: *\nDisallow: /\n";
    const err = await run("tech-stack-detect", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(pageCalls()).toHaveLength(0);
  });
});

describe("cookie-scan", () => {
  it("REGRESSION: identifies as Strale, not as desktop Chrome", async () => {
    await run("cookie-scan", { url: "https://site.test" });
    const [, init] = pageCalls()[0];
    expect(init.headers?.["User-Agent"]).toBe(STRALE_USER_AGENT);
  });

  it("REGRESSION: a 403 on the header fetch ends the scan; the page is not rendered instead", async () => {
    pageResponse = () => html("no", 403);
    const err = await run("cookie-scan", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });
});

describe("url-to-markdown", () => {
  it("REGRESSION: a 403 is refused and not retried through Browserless", async () => {
    pageResponse = () => html("no", 403);
    const err = await run("url-to-markdown", { url: "https://site.test/a" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("a challenge page is refused and not rendered", async () => {
    pageResponse = () =>
      html(`<html><body>${"x".repeat(3000)} Checking your browser before accessing site.test</body></html>`);
    const err = await run("url-to-markdown", { url: "https://site.test/a" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("a refusal from the render route keeps its marker (not remapped to a 403 message)", async () => {
    pageResponse = () => html("<html><body>shell</body></html>"); // thin → escalate
    fetchRenderedHtml.mockRejectedValue(siteAccessRefusal("https://site.test/a", { kind: "http", status: 403 }));
    const err = (await run("url-to-markdown", { url: "https://site.test/a" })) as Error;
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(classifyTransactionFailure(err.message)).toBe("tos_policy");
  });

  it("sends the Strale user agent", async () => {
    await run("url-to-markdown", { url: "https://site.test/a" });
    expect(pageCalls()[0][1].headers?.["User-Agent"]).toBe(STRALE_USER_AGENT);
  });
});

describe("domain-contact-extract", () => {
  it("a 429 is a site-access refusal, not wrapped as a fetch failure", async () => {
    pageResponse = () => html("slow down", 429);
    const err = await run("domain-contact-extract", { domain: "site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
  });

  it("REGRESSION: a named person's address is withheld and counted, never returned (never lane, item 3)", async () => {
    pageResponse = () =>
      html(
        `<html><body>${"Contact us. ".repeat(30)} Write to info@site.test or jane.doe@site.test, ` +
          `sales@site.test, john.smith@site.test.</body></html>`,
      );
    const exec = getDirectExecutor("domain-contact-extract")!;
    const r = await exec({ domain: "site.test" });
    const text = JSON.stringify(r.output);
    expect(text).not.toContain("jane.doe@");
    expect(text).not.toContain("john.smith@");
    expect(r.output.personal_addresses_withheld).toBe(2);
    expect(r.output.role_emails).toEqual(expect.arrayContaining(["info@site.test", "sales@site.test"]));
    expect(r.output).not.toHaveProperty("published_personal_addresses");
  });

  it("REGRESSION: every shape of personal address is withheld — an allowlist, not a name detector", async () => {
    // The first version withheld only first.last@ and returned these as
    // "role" addresses (independent review, 2026-10-24).
    const personal = ["petter", "jdoe", "j.doe", "jane.m.doe", "anna-karin.svensson", "petter.lindstrom2"];
    const organisational = ["orders", "press-team", "customer.service", "support+eu"];
    pageResponse = () =>
      html(
        `<html><body>${"Contact us. ".repeat(30)} ` +
          [...personal, ...organisational].map((l) => `${l}@site.test`).join(" ") +
          `</body></html>`,
      );
    const r = await getDirectExecutor("domain-contact-extract")!({ domain: "site.test" });
    const text = JSON.stringify(r.output);
    for (const l of personal) expect(text, l).not.toContain(`${l}@`);
    expect(r.output.personal_addresses_withheld).toBe(personal.length);
    expect(r.output.role_emails).toEqual(
      expect.arrayContaining(organisational.map((l) => `${l}@site.test`)),
    );
  });

  it("REGRESSION: a personal LinkedIn profile is not returned as the company's social link", async () => {
    pageResponse = () =>
      html(
        `<html><body>${"About us. ".repeat(30)} <a href="https://www.linkedin.com/in/jane-doe">Jane</a> ` +
          `<a href="https://www.linkedin.com/company/site-test">Company</a></body></html>`,
      );
    const r = await getDirectExecutor("domain-contact-extract")!({ domain: "site.test" });
    const links = r.output.social_links as Record<string, string>;
    expect(links.linkedin).toBe("https://www.linkedin.com/company/site-test");
    expect(JSON.stringify(r.output)).not.toContain("/in/jane-doe");
  });

  it("robots.txt Disallow refuses before the homepage is requested", async () => {
    robotsBody = "User-agent: StraleBot\nDisallow: /\n";
    const err = await run("domain-contact-extract", { domain: "site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(pageCalls()).toHaveLength(0);
  });
});

describe("estonian-company-data", () => {
  it("REGRESSION: the registry's 403 is a refusal; it is not retried through a Browserless proxy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("geo-blocked", { status: 403 })));
    const err = await run("estonian-company-data", { registry_code: "10238429" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(browserlessFetchMock).not.toHaveBeenCalled();
  });

  it("identifies as Strale to the registry API", async () => {
    const fetchSpy = vi.fn(async () => new Response("no", { status: 403 }));
    vi.stubGlobal("fetch", fetchSpy);
    await run("estonian-company-data", { registry_code: "10238429" });
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toBe(STRALE_USER_AGENT);
  });
});

describe("company-enrich", () => {
  it("sends the Strale user agent to Browserless, and a reported 403 is a refusal", async () => {
    browserlessFetchMock.mockResolvedValue(
      new Response(PAGE_HTML, { status: 200, headers: { "x-response-code": "403" } }),
    );
    const err = await run("company-enrich", { domain: "site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    const [, init] = browserlessFetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).userAgent).toBe(STRALE_USER_AGENT);
  });
});

describe("multi-path finders stop on a site-wide block", () => {
  it("REGRESSION: privacy-policy-analyze stops at the first 429 instead of trying more paths", async () => {
    fetchRenderedHtml
      .mockResolvedValueOnce(`<html><body><a href="/privacy">Privacy</a>${"word ".repeat(50)}</body></html>`)
      .mockRejectedValue(siteAccessRefusal("https://site.test/privacy", { kind: "http", status: 429 }));
    const err = await run("privacy-policy-analyze", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(fetchRenderedHtml).toHaveBeenCalledTimes(2);
  });

  it("a per-path robots Disallow is skipped, and the next path is tried", async () => {
    fetchRenderedHtml
      .mockResolvedValueOnce(`<html><body><a href="/privacy">Privacy</a>${"word ".repeat(50)}</body></html>`)
      .mockRejectedValueOnce(siteAccessRefusal("https://site.test/privacy", { kind: "robots_disallow" }))
      .mockResolvedValue(PAGE_HTML);
    await run("privacy-policy-analyze", { url: "https://site.test" });
    expect(fetchRenderedHtml.mock.calls.length).toBeGreaterThan(2);
  });
});

describe("Browserless screenshot and PDF routes identify as Strale", () => {
  it("screenshot-url", async () => {
    browserlessFetchMock.mockResolvedValue(
      new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "content-type": "image/png" } }),
    );
    await run("screenshot-url", { url: "https://site.test" });
    const [, init] = browserlessFetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).userAgent).toBe(STRALE_USER_AGENT);
  });

  it("html-to-pdf, and robots.txt is checked for a URL", async () => {
    robotsBody = "User-agent: *\nDisallow: /\n";
    const err = await run("html-to-pdf", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
    expect(browserlessFetchMock).not.toHaveBeenCalled();

    robotsBody = null;
    __resetRobotsCacheForTests();
    browserlessFetchMock.mockResolvedValue(
      new Response(Buffer.from("%PDF-1.4"), { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    await run("html-to-pdf", { url: "https://site.test" });
    const [, init] = browserlessFetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).userAgent).toBe(STRALE_USER_AGENT);
  });
});

describe("screenshots and PDFs of a block page are refused, not billed", () => {
  it("REGRESSION: screenshot-url refuses when Browserless reports the target's 403", async () => {
    browserlessFetchMock.mockResolvedValue(
      new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png", "x-response-code": "403" },
      }),
    );
    const err = await run("screenshot-url", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
  });

  it("REGRESSION: html-to-pdf refuses when Browserless reports the target's 429", async () => {
    browserlessFetchMock.mockResolvedValue(
      new Response(Buffer.from("%PDF-1.4"), {
        status: 200,
        headers: { "content-type": "application/pdf", "x-response-code": "429" },
      }),
    );
    const err = await run("html-to-pdf", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
  });

  // Chrome can run a JavaScript challenge to completion before the capture,
  // so the challenge must be seen in a plain look first.
  const CHALLENGE_PAGE = `<html><body>${"x".repeat(2500)} Checking your browser before accessing site.test</body></html>`;
  const inputs: Record<string, Record<string, unknown>> = {
    "screenshot-url": { url: "https://site.test" },
    "html-to-pdf": { url: "https://site.test" },
    "company-enrich": { domain: "site.test" },
  };
  for (const [slug, input] of Object.entries(inputs)) {
    it(`REGRESSION: ${slug} stops at a challenge page before Browserless is asked`, async () => {
      pageResponse = () => html(CHALLENGE_PAGE, 503);
      const err = await run(slug, input);
      expect(err).toBeInstanceOf(SiteAccessRefusedError);
      expect(browserlessFetchMock).not.toHaveBeenCalled();
    });
  }

  it("html-to-pdf with caller markup makes no preflight (there is no target)", async () => {
    browserlessFetchMock.mockResolvedValue(new Response(Buffer.from("%PDF-1.4"), { status: 200, headers: { "content-type": "application/pdf" } }));
    await run("html-to-pdf", { html: "<p>hello</p>" });
    expect(pageCalls()).toHaveLength(0);
  });
});

describe("youtube-summarize", () => {
  it("REGRESSION: YouTube's HTTP-200 'confirm you're not a bot' page is a block, not a reason to render", async () => {
    pageResponse = () => html("<html><body>Sign in to confirm you’re not a bot</body></html>");
    await run("youtube-summarize", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("a robots.txt disallow on the watch page is a block too", async () => {
    robotsBody = "User-agent: *\nDisallow: /watch\n";
    await run("youtube-summarize", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
    expect(pageCalls()).toHaveLength(0);
  });

  it("POSITIVE CONTROL: a 200 page without captions and without a block still renders", async () => {
    pageResponse = () => html("<html><body>watch page, captions load via JS</body></html>");
    fetchRenderedHtml.mockResolvedValue("<html>no captions here either</html>");
    await run("youtube-summarize", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(fetchRenderedHtml).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: a refused watch page is not re-fetched through Browserless", async () => {
    pageResponse = () => html("no", 429);
    await run("youtube-summarize", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });
});

describe("landing-page-roast", () => {
  it("refuses when Browserless reports the target's 403 on the screenshot", async () => {
    browserlessFetchMock.mockResolvedValue(
      new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png", "x-response-code": "403" },
      }),
    );
    const err = await run("landing-page-roast", { url: "https://site.test" });
    expect(err).toBeInstanceOf(SiteAccessRefusedError);
  });
});

describe("container-track", () => {
  it("says the carrier refused Strale, when it did", async () => {
    fetchRenderedHtml.mockRejectedValue(
      new SourceBlockedError("Source unavailable to Strale: carrier refuses automated access (HTTP 403).", {
        kind: "http",
        status: 403,
      }),
    );
    const exec = getDirectExecutor("container-track")!;
    const r = await exec({ container_number: "MSCU1234565", carrier: "msc" });
    expect(String(r.output.note)).toMatch(/refuses automated access/);
  });
});

describe("no executor impersonates a browser", () => {
  // Guard for never-lane item 2 ("spoofing browser fingerprints"): a
  // User-Agent literal naming a real browser engine. Scans every capability
  // source, so a new executor cannot reintroduce one unnoticed.
  const here = dirname(fileURLToPath(import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(p);
    }
  };
  walk(here);
  walk(resolve(here, "../lib"));

  it("finds no browser-engine user-agent literal", () => {
    const offenders = files.filter((f) =>
      /["'`]Mozilla\/5\.0 \((?!compatible;)[^"'`]*(?:AppleWebKit|Gecko|Chrome\/|Safari\/)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
