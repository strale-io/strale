/**
 * Swallowed-upstream-failure fixes, wave 2b: cookie-scan (audit row 9),
 * barcode-lookup (15), backlink-check (16), github-repo-analyze (21),
 * seo-audit (23) and startup-domain-check (24);
 * archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md.
 *
 * Each billed a normal answer when the upstream that decides it had failed:
 * an empty cookie list, "product not found", no backlinks, "No README" and
 * "abandoned", "No robots.txt", and a domain "available" because a resolver
 * did not answer. Each now throws, unbilled, or (for a secondary leg) keeps
 * the answer, nulls that leg and names it in `unavailable_sources`. The real
 * negatives keep their exact output and stay billed.
 *
 * Describe blocks are tagged: "failure:" tests fail against the pre-fix
 * executors; "negative:" and "passthrough:" tests pass against both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, fetchRenderedHtml, meteredFetchMock, resolve4, llmCreate, extractJsonWithLlm, logWarnMock } = vi.hoisted(() => ({
  logWarnMock: vi.fn(),
  safeFetchMock: vi.fn(),
  fetchRenderedHtml: vi.fn(),
  meteredFetchMock: vi.fn(),
  resolve4: vi.fn(),
  llmCreate: vi.fn(),
  extractJsonWithLlm: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRenderedHtml,
}));
vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/metered-vendor-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  meteredVendorFetch: meteredFetchMock,
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/anthropic-client.js", () => ({
  createAnthropicClient: () => ({ messages: { create: llmCreate } }),
}));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm }));
vi.mock("../lib/log.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logWarn: logWarnMock,
}));
vi.mock("node:dns/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:dns/promises")>();
  return { ...original, resolve4, default: { ...original, resolve4 } };
});

import { getDirectExecutor } from "./index.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { outcomeFromError, assertBillableOutput } from "../lib/execution-outcome.js";
import { categorizeFailureReason, isRetryableFailure } from "../lib/trust-helpers.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import "./cookie-scan.js";
import "./barcode-lookup.js";
import "./backlink-check.js";
import "./github-repo-analyze.js";
import "./seo-audit.js";
import "./startup-domain-check.js";

type Out = Record<string, any>;

function exec(slug: string) {
  const fn = getDirectExecutor(slug);
  if (!fn) throw new Error(`${slug} is not registered`);
  return fn;
}

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  const err = await promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e,
  );
  expect((err as Error).name).toBe("UpstreamUnavailableError");
  expect((err as Error).message).not.toMatch(/not found|invalid|missing|required/i);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err as Error & { retryable?: boolean };
}

async function billed(slug: string, promise: Promise<unknown>): Promise<Out> {
  const { output } = (await promise) as { output: Out };
  expect(() => assertBillableOutput(slug, output)).not.toThrow();
  return output;
}

const status = (code: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status: code, headers });
const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
const networkError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const vendorDown = () =>
  Object.assign(new Error("Vendor 'serper' is exhausted; the request was refused before spending or charging."), {
    name: "VendorUnavailableError",
  });
const dnsError = (code: string) => Object.assign(new Error(`queryA ${code}`), { code, syscall: "queryA" });

/** Transport failures every leg must treat as "no answer", retryable. */
const transient: Array<[string, () => Promise<Response>]> = [
  ["HTTP 503", async () => status(503)],
  ["HTTP 429", async () => status(429)],
  ["a network error", async () => { throw networkError(); }],
  ["a timeout", async () => { throw timeout(); }],
];

let fetchMock: ReturnType<typeof vi.fn>;
const savedSerperKey = process.env.SERPER_API_KEY;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  safeFetchMock.mockReset();
  fetchRenderedHtml.mockReset();
  meteredFetchMock.mockReset();
  resolve4.mockReset();
  llmCreate.mockReset();
  extractJsonWithLlm.mockReset();
  logWarnMock.mockReset();
  __resetRobotsCacheForTests();
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.SERPER_API_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedSerperKey === undefined) delete process.env.SERPER_API_KEY;
  else process.env.SERPER_API_KEY = savedSerperKey;
});

// ─── cookie-scan (row 9) ────────────────────────────────────────────────────

const PAGE = `<html><head><title>Shop</title></head><body><p>${"Real words here. ".repeat(40)}</p></body></html>`;
const NO_TRACKING = {
  tracking_scripts: [{ name: "Google Analytics", detected: false }],
  consent_banner_detected: false,
  consent_banner_text: null,
  third_party_domains_detected: [],
  potential_issues: [],
};
const llmReply = (text: string, stop_reason = "end_turn") => ({ content: [{ type: "text", text }], stop_reason });

/** The site answers `page` for the page and 404 for robots.txt. */
function site(page: () => Promise<Response>) {
  safeFetchMock.mockImplementation(async (url: string) => (String(url).endsWith("/robots.txt") ? status(404) : page()));
  fetchRenderedHtml.mockResolvedValue(PAGE);
}

describe("cookie-scan failure: the cookie request that fails throws (row 9)", () => {
  it.each(transient.filter(([label]) => label !== "HTTP 429"))(
    "throws, unbilled and retryable, when the site's response is %s",
    async (_label, answer) => {
      site(answer);
      llmCreate.mockResolvedValue(llmReply(JSON.stringify(NO_TRACKING)));
      const err = await expectUnbilledUpstreamFailure(exec("cookie-scan")({ url: "https://shop.test" }));
      expect(err.message).toContain("website shop.test");
      expect(err.retryable).toBe(true);
    },
  );
});

describe("cookie-scan failure: an unusable page analysis is null, not 'no banner' (row 9)", () => {
  it.each([
    ["a model decline", llmReply("", "refusal")],
    ["a reply that is not JSON", llmReply("I cannot tell from this page.")],
    ["a reply of the wrong shape", llmReply(JSON.stringify({ ...NO_TRACKING, tracking_scripts: "none" }))],
  ])("%s keeps the cookies, nulls the analysis and names it", async (_label, reply) => {
    site(async () => status(200, "", { "set-cookie": "_ga=GA1.1.1; Path=/" }));
    llmCreate.mockResolvedValue(reply);
    const out = await billed("cookie-scan", exec("cookie-scan")({ url: "https://shop.test" }));
    expect(out.cookies.map((c: Out) => c.name)).toEqual(["_ga"]);
    expect(out).toMatchObject({
      tracking_scripts: null,
      consent_banner_detected: null,
      consent_banner_text: null,
      third_party_domains: null,
      potential_issues: null,
      unavailable_sources: ["page analysis"],
    });
  });
});

describe("cookie-scan negative: a site that sets no cookies keeps its exact output", () => {
  it("answers an empty inventory, billed", async () => {
    site(async () => status(200));
    llmCreate.mockResolvedValue(llmReply(JSON.stringify(NO_TRACKING)));
    const out = await billed("cookie-scan", exec("cookie-scan")({ url: "https://shop.test" }));
    expect(out).toEqual({
      url: "https://shop.test",
      cookies: [],
      total_cookies: 0,
      first_party_count: 0,
      third_party_count: 0,
      tracking_scripts: [],
      consent_banner_detected: false,
      consent_banner_text: null,
      third_party_domains: [],
      potential_issues: [],
    });
  });

  it("still reports tracking cookies without a banner the analysis looked for", async () => {
    site(async () => status(200, "", { "set-cookie": "_ga=GA1.1.1; Path=/" }));
    llmCreate.mockResolvedValue(llmReply(JSON.stringify(NO_TRACKING)));
    const out = await billed("cookie-scan", exec("cookie-scan")({ url: "https://shop.test" }));
    expect(out.potential_issues).toEqual(["Tracking cookies detected but no cookie consent banner found."]);
    expect(out).not.toHaveProperty("unavailable_sources");
  });
});

describe("cookie-scan passthrough: Strale's own Browserless state is not wrapped", () => {
  it("rethrows VendorUnavailableError unchanged", async () => {
    site(async () => status(200));
    const down = vendorDown();
    fetchRenderedHtml.mockRejectedValue(down);
    await expect(exec("cookie-scan")({ url: "https://shop.test" })).rejects.toBe(down);
  });
});

// ─── barcode-lookup (row 15) ────────────────────────────────────────────────

const CODE = "5000112548167";
const OFF_NONE = () => json({ status: 0, status_verbose: "product not found" }, 404);
const UPC_NONE = () => json({ code: "OK", total: 0, items: [] });
const UPC_ITEM = () => json({ code: "OK", total: 1, items: [{ title: "Cola 330ml", brand: "Acme", upc: CODE }] });

function barcode(off: () => Promise<Response> | Response, upc: () => Promise<Response> | Response) {
  fetchMock.mockImplementation(async (url: string) => (String(url).includes("openfoodfacts") ? off() : upc()));
}

describe("barcode-lookup failure: a database that does not answer is never 'not found' (row 15)", () => {
  it.each(transient)("throws, unbilled and retryable, when UPCitemdb fails with %s after OFF has none", async (_l, answer) => {
    barcode(OFF_NONE, answer);
    const err = await expectUnbilledUpstreamFailure(exec("barcode-lookup")({ barcode: CODE }));
    expect(err.message).toContain("UPCitemdb lookup API");
    expect(err.retryable).toBe(true);
  });

  it.each(transient)("throws, unbilled and retryable, when Open Food Facts fails with %s and UPCitemdb has none", async (_l, answer) => {
    barcode(answer, UPC_NONE);
    const err = await expectUnbilledUpstreamFailure(exec("barcode-lookup")({ barcode: CODE }));
    expect(err.message).toContain("Open Food Facts product API");
    expect(err.retryable).toBe(true);
  });

  it("names both databases when neither answers", async () => {
    barcode(() => status(503), () => status(429));
    const err = await expectUnbilledUpstreamFailure(exec("barcode-lookup")({ barcode: CODE }));
    expect(err.message).toContain("Open Food Facts product API and UPCitemdb lookup API");
    expect(err.retryable).toBe(true);
  });

  it("throws, not retryable, on a 200 reply that carries no product status", async () => {
    barcode(() => json({ unexpected: true }), UPC_NONE);
    const err = await expectUnbilledUpstreamFailure(exec("barcode-lookup")({ barcode: CODE }));
    expect(err.retryable).toBe(false);
  });
});

describe("barcode-lookup negative: both databases saying 'none' keeps the exact output", () => {
  it.each([
    ["an unknown product", UPC_NONE],
    ["a code UPCitemdb rejects as INVALID_UPC", () => json({ code: "INVALID_UPC", message: "Not a valid UPC code." }, 400)],
  ])("%s answers found:false, billed", async (_l, upc) => {
    barcode(OFF_NONE, upc);
    const out = await billed("barcode-lookup", exec("barcode-lookup")({ barcode: CODE }));
    expect(out).toEqual({
      barcode: CODE,
      found: false,
      message: `No product found for barcode ${CODE}. The product may not be in the database.`,
    });
  });

  it("answers from UPCitemdb when Open Food Facts is down", async () => {
    barcode(() => status(503), UPC_ITEM);
    const out = await billed("barcode-lookup", exec("barcode-lookup")({ barcode: CODE }));
    expect(out).toMatchObject({ found: true, source: "upcitemdb", product_name: "Cola 330ml" });
  });
});

// ─── backlink-check (row 16) ────────────────────────────────────────────────
//
// Serper-only since the #1017 review: Common Crawl's `url=*.domain` query only
// ever returned the domain's own hosts, which are never backlinks.

/** Serper answers `serper`; no other request is expected. */
function backlinks(serper?: () => Promise<Response> | Response) {
  safeFetchMock.mockImplementation(async () => {
    throw new Error("backlink-check asked something other than Serper");
  });
  meteredFetchMock.mockImplementation(async () => {
    if (!serper) throw new Error("Serper was not expected");
    return serper();
  });
}
const organic = (...links: string[]) => json({ organic: links.map((link, i) => ({ title: `Post ${i}`, link })) });

describe("tail2: backlink-check asks Serper only, and a Serper that did not answer is never 'no backlinks'", () => {
  it.each(transient)("Serper %s throws, unbilled and retryable", async (_l, answer) => {
    process.env.SERPER_API_KEY = "test";
    backlinks(answer);
    const err = await expectUnbilledUpstreamFailure(exec("backlink-check")({ domain: "mysite.example" }));
    expect(err.message).toContain("Serper Google search API");
    expect(err.retryable).toBe(true);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });

  it("an unset SERPER_API_KEY throws, unbilled, and classifies dependency_missing by the key's name", async () => {
    backlinks();
    const err = await expectUnbilledUpstreamFailure(exec("backlink-check")({ domain: "mysite.example" }));
    expect(err.message).toContain("SERPER_API_KEY");
    expect(err.retryable).toBe(false);
    expect(categorizeFailureReason(err.message)).toBe("dependency_missing");
    expect(meteredFetchMock).not.toHaveBeenCalled();
  });

  it("a reply with no result list throws, not retryable", async () => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => json({ organic: "nope" }));
    const err = await expectUnbilledUpstreamFailure(exec("backlink-check")({ domain: "mysite.example" }));
    expect(err.retryable).toBe(false);
  });

  it.each([
    ["VendorUnavailableError", vendorDown],
    ["PaidCallBlockedError", () => Object.assign(new Error("Paid call to 'serper' blocked in a test context."), { name: "PaidCallBlockedError" })],
  ])("Strale's own %s is rethrown unchanged", async (_l, make) => {
    process.env.SERPER_API_KEY = "test";
    const own = make();
    backlinks(() => { throw own; });
    await expect(exec("backlink-check")({ domain: "mysite.example" })).rejects.toBe(own);
  });

  it("answers from Serper alone, with no Common Crawl request and no unavailable_sources", async () => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => organic("https://news.example/a"));
    const out = await billed("backlink-check", exec("backlink-check")({ domain: "mysite.example" }));
    expect(out.backlinks.map((b: Out) => b.source_domain)).toEqual(["news.example"]);
    expect(out).not.toHaveProperty("unavailable_sources");
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("Serper finding nothing is the real negative, billed with its exact output", async () => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => json({ organic: [] }));
    const out = await billed("backlink-check", exec("backlink-check")({ domain: "mysite.example" }));
    expect(out).toEqual({
      domain: "mysite.example",
      backlinks: [],
      total_backlinks: 0,
      referring_domains_count: 0,
      unresolved_link_count: 0,
      top_anchors: [],
      dofollow_estimate: null,
      nofollow_estimate: null,
    });
  });
});

describe("tail2: backlink-check normalises the domain before dropping its own hosts", () => {
  const RESULTS = [
    "https://www.google.com/about",
    "https://maps.google.com/x",
    "https://notgoogle.com/a",
    "https://evilgoogle.com/b",
    "https://google.com.evil.example/c",
  ];

  it.each(["google.com.", "Google.COM:443", "https://Google.com:8443/path", "GOOGLE.COM"])(
    "%s drops google.com's own hosts and keeps look-alikes",
    async (domain) => {
      process.env.SERPER_API_KEY = "test";
      backlinks(() => organic(...RESULTS));
      const out = await billed("backlink-check", exec("backlink-check")({ domain }));
      expect(out.domain).toBe("google.com");
      expect(out.backlinks.map((b: Out) => b.source_domain)).toEqual(["notgoogle.com", "evilgoogle.com", "google.com.evil.example"]);
    },
  );

  it("an internationalised domain is compared in its ASCII form", async () => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => organic("https://shop.xn--bcher-kva.example/x", "https://other.example/y"));
    const out = await billed("backlink-check", exec("backlink-check")({ domain: "Bücher.example" }));
    expect(out.domain).toBe("xn--bcher-kva.example");
    expect(out.backlinks.map((b: Out) => b.source_domain)).toEqual(["other.example"]);
  });
});

// ─── github-repo-analyze (row 21) ───────────────────────────────────────────

const REPO = { stargazers_count: 10, forks_count: 2, open_issues_count: 1, license: { spdx_id: "MIT" } };
const ANALYSIS = { tech_stack: ["TypeScript"], activity_level: "active", bus_factor_estimate: 2, maintenance_health_score: 80 };

/** A healthy repository, with `override` answering the requests it matches. */
function github(override: (url: string) => (() => Promise<Response> | Response) | undefined = () => undefined) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    const answer = override(u);
    if (answer) return answer();
    if (u.endsWith("/README.md")) return status(200, "# Widget\nA widget.");
    if (u.startsWith("https://raw.githubusercontent.com/")) return status(404);
    if (u.endsWith("/languages")) return json({ TypeScript: 100 });
    if (u.includes("/commits")) return json([{ commit: { message: "fix", author: { date: "2026-11-01T00:00:00Z" } } }]);
    if (u.includes("/contributors")) return json([{ login: "ada", contributions: 40 }]);
    return json(REPO);
  });
  extractJsonWithLlm.mockImplementation(async () => ({ ...ANALYSIS }));
}
const promptSent = () => (extractJsonWithLlm.mock.calls[0][0] as { prompt: string }).prompt;
const rateLimited = () => status(403, '{"message":"API rate limit exceeded"}', { "x-ratelimit-remaining": "0" });

describe("github-repo-analyze failure: GitHub that does not answer fails the call (row 21)", () => {
  it.each([
    ["the commit list is rate limited", (u: string) => (u.includes("/commits") ? rateLimited : undefined)],
    ["the README host answers 429", (u: string) => (u.endsWith("/README.md") ? () => status(429) : undefined)],
    ["the repo record answers 503", (u: string) => (u.endsWith("/repos/o/r") ? () => status(503) : undefined)],
    ["the language breakdown times out", (u: string) => (u.endsWith("/languages") ? () => { throw timeout(); } : undefined)],
    ["package.json hits a network error", (u: string) => (u.endsWith("/package.json") ? () => { throw networkError(); } : undefined)],
  ])("throws, unbilled and retryable, when %s", async (_l, override) => {
    github(override);
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.retryable).toBe(true);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("throws, not retryable, when GitHub refuses the repository (HTTP 451)", async () => {
    github((u) => (u.endsWith("/repos/o/r") ? () => status(451) : undefined));
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.retryable).toBe(false);
  });

  it("a contributor list GitHub will not produce is null and named, not 'no contributors'", async () => {
    github((u) => (u.includes("/contributors") ? () => status(403, '{"message":"too large"}') : undefined));
    const out = await billed("github-repo-analyze", exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(out.top_contributors).toBeNull();
    expect(out.bus_factor_estimate).toBeNull();
    expect(out.unavailable_sources).toEqual(["GitHub contributors list"]);
    expect(promptSent()).toContain("Contributors: unknown");
  });
});

describe("github-repo-analyze negative: what GitHub says is absent keeps its output", () => {
  it("a repository without a README, package.json or requirements.txt is analysed as such, billed", async () => {
    github((u) => (u.endsWith("/README.md") ? () => status(404) : undefined));
    const out = await billed("github-repo-analyze", exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(promptSent()).toContain("README excerpt:\nNo README");
    expect(out).toEqual({
      ...ANALYSIS,
      repo: "o/r",
      url: "https://github.com/o/r",
      stars: 10,
      forks: 2,
      open_issues: 1,
      license: "MIT",
      languages: { TypeScript: 100 },
      top_contributors: [{ login: "ada", contributions: 40 }],
    });
  });

  it("an empty repository (commits 409, contributors 204) has no commits and no contributors", async () => {
    github((u) =>
      u.includes("/commits") ? () => status(409) : u.includes("/contributors") ? () => new Response(null, { status: 204 }) : undefined,
    );
    const out = await billed("github-repo-analyze", exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(out.top_contributors).toEqual([]);
    expect(out).not.toHaveProperty("unavailable_sources");
    expect(promptSent()).toContain("Recent commits:\n\n");
  });

  it("a repository GitHub does not show stays 'could not access'", async () => {
    github((u) => (u.endsWith("/repos/o/r") ? () => status(404) : undefined));
    await expect(exec("github-repo-analyze")({ url: "https://github.com/o/r" })).rejects.toThrow(
      "Could not access repo o/r. It may be private.",
    );
  });
});

// ─── seo-audit (row 23) ─────────────────────────────────────────────────────

const SEO_PAGE = "<html><head><title>t</title></head><body><p>hello</p></body></html>";

function seo(robots: () => Promise<Response> | Response) {
  fetchRenderedHtml.mockResolvedValue(SEO_PAGE);
  safeFetchMock.mockImplementation(async () => robots());
}

describe("seo-audit failure: an unreadable robots.txt is not 'No robots.txt' (row 23)", () => {
  it.each(transient)("robots.txt %s nulls the two checks, names robots.txt and leaves them out of the score", async (_l, answer) => {
    seo(answer);
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.checks.robots_txt).toEqual({ present: null });
    expect(out.checks.sitemap).toEqual({ referenced_in_robots: null });
    expect(out.unavailable_sources).toEqual(["robots.txt"]);
    expect(out.prioritized_fixes.map((f: Out) => f.issue)).not.toContain("No robots.txt");
    expect(out.prioritized_fixes.map((f: Out) => f.issue)).not.toContain("No sitemap referenced");
    // 35 of the 90 points that were checked.
    expect(out.overall_score).toBe(39);
  });
});

describe("seo-audit negative: a site without robots.txt keeps its exact output", () => {
  it.each([[404], [403], [410]])("robots.txt HTTP %i is 'No robots.txt', billed", async (code) => {
    seo(() => status(code));
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.checks.robots_txt).toEqual({ present: false });
    expect(out.checks.sitemap).toEqual({ referenced_in_robots: false });
    expect(out.prioritized_fixes.map((f: Out) => f.issue)).toEqual(
      expect.arrayContaining(["No robots.txt", "No sitemap referenced"]),
    );
    expect(out.overall_score).toBe(35);
    expect(out).not.toHaveProperty("unavailable_sources");
  });

  it("a robots.txt with a sitemap scores both", async () => {
    seo(() => status(200, "User-agent: *\nSitemap: https://site.test/sitemap.xml\n"));
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.checks.robots_txt).toEqual({ present: true });
    expect(out.checks.sitemap).toEqual({ referenced_in_robots: true });
    expect(out.overall_score).toBe(45);
  });
});

// ─── startup-domain-check (row 24) ──────────────────────────────────────────

/** DNS: `dnsAnswer` for every extension. Handles: `handle(url)`; domain websites answer 200. */
function domains(dnsAnswer: () => Promise<string[]>, handle: (url: string) => Promise<Response> | Response = () => status(404)) {
  resolve4.mockImplementation(dnsAnswer);
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.startsWith("https://github.com/") || u.startsWith("https://registry.npmjs.org/") || u.startsWith("https://pypi.org/")) {
      return handle(u);
    }
    return status(200);
  });
}

describe("startup-domain-check failure: a resolver that does not answer is never 'available' (row 24)", () => {
  it.each(["ESERVFAIL", "ETIMEOUT", "ECONNREFUSED"])("DNS %s throws, unbilled and retryable", async (code) => {
    domains(() => Promise.reject(dnsError(code)));
    const err = await expectUnbilledUpstreamFailure(exec("startup-domain-check")({ company_name: "Acme" }));
    expect(err.message).toContain(code);
    expect(err.retryable).toBe(true);
  });

  it("a name with no A record (ENODATA) is registered, so taken, not available", async () => {
    domains(() => Promise.reject(dnsError("ENODATA")));
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    expect(out.domains.every((d: Out) => d.available === false)).toBe(true);
    expect(out.best_available_domain).toBeNull();
  });

  it.each(transient)("a handle check that fails with %s is null and named, neither available nor taken", async (_l, answer) => {
    domains(
      () => Promise.reject(dnsError("ENOTFOUND")),
      (u) => (u.startsWith("https://registry.npmjs.org/") ? answer() : status(404)),
    );
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    const npm = out.social.find((s: Out) => s.platform === "npm");
    expect(npm.available).toBeNull();
    expect(out.unavailable_sources).toEqual(["npm registry"]);
    expect(out.available.map((a: Out) => a.type)).not.toContain("npm");
    expect(out.taken.map((t: Out) => t.type)).not.toContain("npm");
  });

  it("the unchecked X handle is not listed as taken", async () => {
    domains(() => Promise.reject(dnsError("ENOTFOUND")));
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    expect(out.taken).toEqual([]);
    expect(out.taken_count).toBe(0);
  });
});

describe("startup-domain-check negative: answers that were given keep their output", () => {
  it("NXDOMAIN everywhere and 404 on every platform is all available, billed", async () => {
    domains(() => Promise.reject(dnsError("ENOTFOUND")));
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    expect(out.best_available_domain).toBe("acme.com");
    expect(out.domains.every((d: Out) => d.available === true && d.current_owner === null)).toBe(true);
    expect(out.social.filter((s: Out) => s.platform !== "Twitter/X").every((s: Out) => s.available === true)).toBe(true);
    expect(out.available_count).toBe(8);
    expect(out).not.toHaveProperty("unavailable_sources");
  });

  it("a resolving domain and a 200 handle are taken", async () => {
    domains(async () => ["93.184.216.34"], () => status(200));
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    expect(out.domains.every((d: Out) => d.available === false)).toBe(true);
    expect(out.taken.map((t: Out) => t.type)).toEqual(expect.arrayContaining(["github", "npm", "pypi"]));
  });
});

// ─── Review fixes on PR #1015 ───────────────────────────────────────────────
//
// Tagged "review fix:". Each failure case fails against the wave 2b head
// before these fixes (ae5488ae) and passes after.

describe("review fix: github-repo-analyze 403s classify as transient, not auth_expired", () => {
  it("a rate-limited 403 is retryable and transient for the breaker", async () => {
    github((u) => (u.includes("/commits") ? rateLimited : undefined));
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.retryable).toBe(true);
    expect(err.message).not.toMatch(/\b40[13]\b/);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });

  it("a 403 on the repository record that is not a rate limit is retryable and transient", async () => {
    github((u) => (u.endsWith("/repos/o/r") ? () => status(403, '{"message":"You have exceeded a secondary rate limit."}') : undefined));
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.retryable).toBe(true);
    expect(err.message).not.toMatch(/\b40[13]\b/);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });

  it("a contributors 403 whose body does not say 'too large' throws, retryable and transient", async () => {
    github((u) => (u.includes("/contributors") ? () => status(403, '{"message":"You have exceeded a secondary rate limit."}') : undefined));
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.retryable).toBe(true);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });

  it("GitHub's real 'too large to list contributors' 403 still nulls the contributors", async () => {
    github((u) =>
      u.includes("/contributors")
        ? () => status(403, '{"message":"The history or contributor list is too large to list contributors for this repository via the API."}')
        : undefined,
    );
    const out = await billed("github-repo-analyze", exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(out.top_contributors).toBeNull();
    expect(out.unavailable_sources).toEqual(["GitHub contributors list"]);
  });
});

describe("review fix: cookie-scan failures of the caller's own site do not open the breaker", () => {
  it.each(transient.filter(([label]) => label !== "HTTP 429"))(
    "the site's %s stays unbilled and reads as the target's failure",
    async (_label, answer) => {
      site(answer);
      const err = await expectUnbilledUpstreamFailure(exec("cookie-scan")({ url: "https://shop.test" }));
      expect(err.retryable).toBe(true);
      expect(isUserInputError(err.message)).toBe(true);
    },
  );
});

describe("review fix: startup-domain-check keeps the report when one extension's DNS fails", () => {
  const failOnly = (failing: string, code: string) =>
    (async (name: string) => {
      throw dnsError(name === failing ? code : "ENOTFOUND");
    }) as unknown as () => Promise<string[]>;

  it.each(["ESERVFAIL", "ETIMEOUT"])("DNS %s for acme.io only nulls acme.io and names it", async (code) => {
    domains(failOnly("acme.io", code));
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    const io = out.domains.find((d: Out) => d.domain === "acme.io");
    expect(io).toMatchObject({ available: null, current_owner: null });
    expect(out.unavailable_sources).toEqual(["DNS for acme.io"]);
    expect(out.available.map((a: Out) => a.name)).not.toContain("acme.io");
    expect(out.taken.map((t: Out) => t.name)).not.toContain("acme.io");
    expect(out.best_available_domain).toBe("acme.com");
  });

  it("a failed .com lookup is never the best available domain", async () => {
    domains(failOnly("acme.com", "ESERVFAIL"));
    const out = await billed("startup-domain-check", exec("startup-domain-check")({ company_name: "Acme" }));
    expect(out.best_available_domain).toBe("acme.io");
  });
});

describe("review fix: seo-audit treats any non-refusal robots.txt error as unavailable", () => {
  it.each([
    ["too many redirects", () => new Error("Too many redirects (>3) — refusing to follow further. Starting URL: https://site.test/robots.txt.")],
    ["a redirect to a restricted address", () => Object.assign(new Error("This URL resolves to a restricted address."), { name: "UrlValidationError" })],
  ])("robots.txt %s nulls the two checks and names robots.txt", async (_l, makeErr) => {
    seo(async () => { throw makeErr(); });
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.checks.robots_txt).toEqual({ present: null });
    expect(out.unavailable_sources).toEqual(["robots.txt"]);
    expect(out.overall_score).toBe(39);
  });

  it("a refusal on the page URL itself still refuses", async () => {
    const refusal = new CapabilityRefusalError("'url' must be a page whose HTML is 16.0MB or less.", { field: "url", fix: "Send a smaller page." });
    fetchRenderedHtml.mockRejectedValue(refusal);
    safeFetchMock.mockImplementation(async () => status(404));
    await expect(exec("seo-audit")({ url: "https://site.test" })).rejects.toBe(refusal);
  });
});

describe("review fix: a retryable combined failure never quotes another leg's 401/403", () => {
  it("barcode-lookup: Open Food Facts 503 and UPCitemdb 403 is retryable for the breaker too", async () => {
    barcode(() => status(503), () => status(403));
    const err = await expectUnbilledUpstreamFailure(exec("barcode-lookup")({ barcode: CODE }));
    expect(err.retryable).toBe(true);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });
});

describe("review fix: cookie-scan reads an unstated consent banner as unknown", () => {
  it("a missing consent_banner_detected is null and adds no 'no banner' issue", async () => {
    site(async () => status(200, "", { "set-cookie": "_ga=GA1.1.1; Path=/" }));
    const { consent_banner_detected: _omitted, ...withoutBanner } = NO_TRACKING;
    llmCreate.mockResolvedValue(llmReply(JSON.stringify(withoutBanner)));
    const out = await billed("cookie-scan", exec("cookie-scan")({ url: "https://shop.test" }));
    expect(out.consent_banner_detected).toBeNull();
    expect(out.potential_issues).toEqual([]);
    expect(out.tracking_scripts).toEqual([]);
  });

  it('a consent_banner_detected of the string "true" reads as true', async () => {
    site(async () => status(200, "", { "set-cookie": "_ga=GA1.1.1; Path=/" }));
    llmCreate.mockResolvedValue(llmReply(JSON.stringify({ ...NO_TRACKING, consent_banner_detected: "true" })));
    const out = await billed("cookie-scan", exec("cookie-scan")({ url: "https://shop.test" }));
    expect(out.consent_banner_detected).toBe(true);
    expect(out.potential_issues).toEqual([]);
  });
});

// ─── Delta-review tail on PR #1015 ──────────────────────────────────────────
//
// Tagged "tail:". Each failure case fails against the executors at d090ea9c
// (#1015 merged) and passes after.

describe("tail: startup-domain-check keeps the caller's name out of error messages", () => {
  it.each(["ETIMEOUT", "ESERVFAIL"])("'studio403' with every lookup failing (%s) is retryable for the breaker", async (code) => {
    domains(() => Promise.reject(dnsError(code)));
    const err = await expectUnbilledUpstreamFailure(exec("startup-domain-check")({ company_name: "studio403" }));
    expect(err.message).not.toContain("studio403");
    expect(err.message).toContain(code);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });
});

describe("tail: seo-audit robots.txt errors are logged, and our own defects are not hidden", () => {
  it.each([
    ["fetch failed", () => networkError()],
    ["terminated", () => new TypeError("terminated")],
  ])("a fetch transport TypeError (%s) is still unavailable, not a defect", async (_l, makeErr) => {
    seo(async () => { throw makeErr(); });
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.unavailable_sources).toEqual(["robots.txt"]);
  });

  it("logs the error's name and class, never its message or the URL", async () => {
    seo(async () => {
      throw new Error("Too many redirects (>3) — refusing to follow further. Starting URL: https://site.test/robots.txt?token=secret.");
    });
    await billed("seo-audit", exec("seo-audit")({ url: "https://site.test/?q=private" }));
    const call = logWarnMock.mock.calls.find(([label]) => String(label).includes("robots"));
    expect(call).toBeDefined();
    expect(call![2]).toMatchObject({ error_name: "Error", error_class: "Error" });
    const logged = JSON.stringify(call);
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("private");
    expect(logged).not.toContain("Too many redirects");
  });
});

describe("tail: cookie-scan reads a redirect loop on the caller's site as the target's failure", () => {
  it("safe-fetch's 'Too many redirects' stays unbilled and breaker-exempt", async () => {
    site(async () => {
      throw new Error("Too many redirects (>3) — refusing to follow further. Starting URL: https://shop.test.");
    });
    const err = await expectUnbilledUpstreamFailure(exec("cookie-scan")({ url: "https://shop.test" }));
    expect(err.message).toContain("URL did not answer");
    expect(isUserInputError(err.message)).toBe(true);
  });
});

describe("tail: github-repo-analyze names a 403 only as what its body says", () => {
  it.each([
    ["the repository record", (u: string) => u.endsWith("/repos/o/r")],
    ["the contributor list", (u: string) => u.includes("/contributors")],
    ["the README host", (u: string) => u.endsWith("/README.md")],
  ])("a 403 on %s with no rate-limit or abuse wording reads 'declined the request', retryable", async (_l, match) => {
    github((u) => (match(u) ? () => status(403, '{"message":"Resource not accessible by integration"}') : undefined));
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("declined the request");
    expect(err.message).not.toMatch(/rate limit|abuse/i);
    expect(err.message).not.toMatch(/\b40[13]\b/);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });

  it("a 403 whose body names abuse detection says so", async () => {
    github((u) => (u.endsWith("/repos/o/r") ? () => status(403, '{"message":"You have triggered an abuse detection mechanism."}') : undefined));
    const err = await expectUnbilledUpstreamFailure(exec("github-repo-analyze")({ url: "https://github.com/o/r" }));
    expect(err.message).toMatch(/abuse detection/);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });
});

// ─── Fix round on PR #1017 ──────────────────────────────────────────────────
//
// Tagged "tail2:" (the backlink-check blocks above carry the same tag). Each
// failure case fails against the executors at 8ce8e177 and passes after.

describe("tail2: seo-audit degrades on any error from the robots.txt fetch itself", () => {
  it("a robots.txt redirect to an unparseable Location ('http://exa mple.com/') is unavailable, not a throw", async () => {
    fetchRenderedHtml.mockResolvedValue(SEO_PAGE);
    // What safe-fetch's followRedirects throws for that Location: the real
    // TypeError from new URL(), code ERR_INVALID_URL.
    safeFetchMock.mockImplementation(async (url: string) => {
      new URL("http://exa mple.com/", url);
      return status(200);
    });
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.checks.robots_txt).toEqual({ present: null });
    expect(out.unavailable_sources).toEqual(["robots.txt"]);
  });

  it("any TypeError the fetch call throws is the site's, not ours", async () => {
    seo(async () => { throw new TypeError("Cannot read properties of undefined (reading 'headers')"); });
    const out = await billed("seo-audit", exec("seo-audit")({ url: "https://site.test" }));
    expect(out.unavailable_sources).toEqual(["robots.txt"]);
  });

  it("a defect while reading the body is still rethrown", async () => {
    const bug = new ReferenceError("robotsTxt is not defined");
    const res = status(200, "User-agent: *");
    Object.defineProperty(res, "body", { get() { throw bug; } });
    Object.defineProperty(res, "text", { value: () => { throw bug; } });
    Object.defineProperty(res, "arrayBuffer", { value: () => { throw bug; } });
    seo(async () => res);
    await expect(exec("seo-audit")({ url: "https://site.test" })).rejects.toBe(bug);
  });
});
