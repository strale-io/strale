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

const { safeFetchMock, fetchRenderedHtml, meteredFetchMock, resolve4, llmCreate, extractJsonWithLlm } = vi.hoisted(() => ({
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
vi.mock("node:dns/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:dns/promises")>();
  return { ...original, resolve4, default: { ...original, resolve4 } };
});

import { getDirectExecutor } from "./index.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { outcomeFromError, assertBillableOutput } from "../lib/execution-outcome.js";
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

const CC_RECORD = JSON.stringify({ url: "https://blog.example/post", timestamp: "20240301000000" });

function backlinks(cc: () => Promise<Response> | Response, serper?: () => Promise<Response> | Response) {
  safeFetchMock.mockImplementation(async () => cc());
  meteredFetchMock.mockImplementation(async () => {
    if (!serper) throw new Error("Serper was not expected");
    return serper();
  });
}

describe("backlink-check failure: no answering source is never 'no backlinks' (row 16)", () => {
  it.each(transient)("throws, unbilled and retryable, when Common Crawl fails with %s and Serper is not set up", async (_l, answer) => {
    backlinks(answer);
    const err = await expectUnbilledUpstreamFailure(exec("backlink-check")({ domain: "mysite.example" }));
    expect(err.message).toContain("Common Crawl index API");
    expect(err.retryable).toBe(true);
  });

  it.each(transient)("throws, unbilled and retryable, when both sources fail (Serper %s)", async (_l, answer) => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => status(503), answer);
    const err = await expectUnbilledUpstreamFailure(exec("backlink-check")({ domain: "mysite.example" }));
    expect(err.message).toContain("Common Crawl index API and Serper Google search API");
    expect(err.retryable).toBe(true);
  });

  it("names Serper when it fails after Common Crawl answered", async () => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => status(200, CC_RECORD), () => status(429));
    const out = await billed("backlink-check", exec("backlink-check")({ domain: "mysite.example" }));
    expect(out.backlinks.map((b: Out) => b.source_domain)).toEqual(["blog.example"]);
    expect(out.unavailable_sources).toEqual(["Serper Google search API"]);
  });

  it("names Common Crawl when Serper answers in its place", async () => {
    process.env.SERPER_API_KEY = "test";
    backlinks(() => status(502), () => json({ organic: [{ title: "A post", link: "https://news.example/a" }] }));
    const out = await billed("backlink-check", exec("backlink-check")({ domain: "mysite.example" }));
    expect(out.backlinks.map((b: Out) => b.source_domain)).toEqual(["news.example"]);
    expect(out.unavailable_sources).toEqual(["Common Crawl index API"]);
  });

  it("rethrows Strale's own Serper account state unchanged when Common Crawl is down too", async () => {
    process.env.SERPER_API_KEY = "test";
    const down = vendorDown();
    backlinks(() => status(503), () => { throw down; });
    await expect(exec("backlink-check")({ domain: "mysite.example" })).rejects.toBe(down);
  });
});

describe("backlink-check negative: a domain Common Crawl holds nothing for keeps its exact output", () => {
  it.each([
    ["HTTP 404", () => status(404)],
    ["an empty 200", () => status(200, "")],
  ])("Common Crawl %s answers an empty list, billed", async (_l, cc) => {
    backlinks(cc);
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
