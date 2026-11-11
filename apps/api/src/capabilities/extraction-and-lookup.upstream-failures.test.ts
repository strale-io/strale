/**
 * Swallowed-upstream-failure fixes, wave 2c: pricing-page-extract (audit
 * row 5), gdpr-fine-lookup (6), company-fundamentals (20), country-trade-data
 * (26), whois-lookup (28) and page-exists (29);
 * archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md.
 *
 * Each billed a normal-looking answer when the page or source that decides it
 * had not answered: `plans: []` for a cookie wall, `fines: []` for an empty
 * shell, a metric "not reported" when the SEC failed, embedded estimates when
 * the World Bank failed, a rate-limit notice (or IANA's record for the TLD)
 * as the domain's WHOIS record, and `exists: null` for a blocked or broken
 * page. Each now throws, unbilled. The real negatives keep their output and
 * stay billed.
 *
 * Describe blocks are tagged: "failure:" tests fail against the pre-fix
 * executors; "negative:" and "passthrough:" tests pass against both.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, fetchRenderedHtml, extractJsonWithLlm, netConnect } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  fetchRenderedHtml: vi.fn(),
  extractJsonWithLlm: vi.fn(),
  netConnect: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRenderedHtml,
}));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm }));
vi.mock("../lib/anthropic-client.js", () => ({
  createAnthropicClient: () => ({ messages: { create: vi.fn() } }),
}));
vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("node:net", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:net")>();
  return { ...original, createConnection: netConnect, default: { ...original, createConnection: netConnect } };
});

import { getDirectExecutor } from "./index.js";
import { outcomeFromError, assertBillableOutput } from "../lib/execution-outcome.js";
import { categorizeFailureReason, isRetryableFailure } from "../lib/trust-helpers.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import "./pricing-page-extract.js";
import "./gdpr-fine-lookup.js";
import "./company-fundamentals.js";
import "./country-trade-data.js";
import "./whois-lookup.js";
import "./page-exists.js";

type Out = Record<string, any>;

function exec(slug: string) {
  const fn = getDirectExecutor(slug);
  if (!fn) throw new Error(`${slug} is not registered`);
  return fn;
}

async function thrown(promise: Promise<unknown>): Promise<Error & { retryable?: boolean; code?: string | null }> {
  return promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e as Error & { retryable?: boolean; code?: string | null },
  );
}

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>) {
  const err = await thrown(promise);
  expect(err.name).toBe("UpstreamUnavailableError");
  expect(err.message).not.toMatch(/not found|invalid|missing|required/i);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err;
}

async function expectRefusal(promise: Promise<unknown>) {
  const err = await thrown(promise);
  expect(isCapabilityRefusal(err)).toBe(true);
  expect(outcomeFromError(err)).toMatchObject({
    billable: false,
    failure_class: "capability_refused",
    counts_against_capability: false,
  });
  return err;
}

async function billed(slug: string, promise: Promise<unknown>): Promise<Out> {
  const { output } = (await promise) as { output: Out };
  expect(() => assertBillableOutput(slug, output)).not.toThrow();
  return output;
}

const status = (code: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status: code, headers });
const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
const html = (body: string, code = 200) => new Response(body, { status: code, headers: { "content-type": "text/html" } });
const networkError = (code = "ECONNRESET") => Object.assign(new TypeError("fetch failed"), { cause: { code } });
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

/** A rendered page with enough visible text to pass the shell floor. */
const fullPage = (words: string) => `<html><body><main><p>${`${words} `.repeat(40)}</p></main></body></html>`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  safeFetchMock.mockReset();
  fetchRenderedHtml.mockReset();
  extractJsonWithLlm.mockReset();
  netConnect.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ─── pricing-page-extract (row 5) ──────────────────────────────────────────

const PRICING_URL = "https://saas.test/pricing";

describe("failure: pricing-page-extract does not bill a page that is not a pricing page", () => {
  it("throws when the model reports a cookie or login wall (page_error)", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("We use cookies. Accept all cookies to continue."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "page_error", plans: [], enterprise_cta: false });
    const err = await expectUnbilledUpstreamFailure(exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(err.code).toBe("page_error");
    expect(err.retryable).toBe(false);
    // The caller's own site: the breaker must leave the capability's health alone.
    expect(isUserInputError(err.message)).toBe(true);
  });

  it("throws on an empty app shell without asking the model", async () => {
    fetchRenderedHtml.mockResolvedValue('<html><body><div id="root"></div><script>app()</script></body></html>');
    extractJsonWithLlm.mockResolvedValue({ plans: [], enterprise_cta: false });
    const err = await expectUnbilledUpstreamFailure(exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(err.code).toBe("empty");
    expect(isUserInputError(err.message)).toBe(true);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });
});

describe("negative: pricing-page-extract bills a real page", () => {
  it("bills a real product page that publishes no prices", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Enterprise platform. Talk to our sales team for a quote."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "no_pricing", plans: [], enterprise_cta: true });
    const out = await billed("pricing-page-extract", exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(out).toMatchObject({ page_status: "no_pricing", plans: [], enterprise_cta: true, url: PRICING_URL });
  });

  it("bills extracted plans", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Starter $29/mo. Pro $99/mo."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "pricing", plans: [{ name: "Starter", price: "$29/mo" }] });
    const out = await billed("pricing-page-extract", exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(out.plans).toHaveLength(1);
  });
});

describe("passthrough: pricing-page-extract keeps the fetch layer's own errors", () => {
  it("rethrows a fetch error unchanged", async () => {
    const blocked = new Error("URL returned HTTP 503. The site returned a server error.");
    fetchRenderedHtml.mockRejectedValue(blocked);
    await expect(exec("pricing-page-extract")({ url: PRICING_URL })).rejects.toBe(blocked);
  });
});

// ─── gdpr-fine-lookup (row 6) ──────────────────────────────────────────────

describe("failure: gdpr-fine-lookup does not bill a tracker page without its fine table", () => {
  it("throws, counted against the source, when the model reports page_error", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Service temporarily down for maintenance. Please come back later."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "page_error", fines: [], total_fines: 0, total_amount_eur: 0 });
    const err = await expectUnbilledUpstreamFailure(exec("gdpr-fine-lookup")({ company: "Acme" }));
    expect(err.code).toBe("page_error");
    expect(err.message).toContain("enforcementtracker.com");
    // Strale chose this source, so its failure counts against the capability.
    expect(isUserInputError(err.message)).toBe(false);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });

  it("throws UpstreamUnavailableError, not a plain error, on a near-empty render", async () => {
    fetchRenderedHtml.mockResolvedValue("<html><body>Loading…</body></html>");
    const err = await expectUnbilledUpstreamFailure(exec("gdpr-fine-lookup")({ country_code: "SE" }));
    expect(err.code).toBe("empty");
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });
});

describe("negative: gdpr-fine-lookup bills the tracker's answers", () => {
  it("bills a search with no matching fine", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("GDPR Enforcement Tracker. Showing 0 of 2,400 entries."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "no_results", fines: [], total_fines: 0, total_amount_eur: 0 });
    const out = await billed("gdpr-fine-lookup", exec("gdpr-fine-lookup")({ company: "Nobody AB" }));
    expect(out).toMatchObject({ page_status: "no_results", fines: [] });
  });

  it("bills listed fines", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Acme fined EUR 50,000 by the IMY under Art. 6."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "results", fines: [{ company: "Acme", amount_eur: 50000 }], total_fines: 1 });
    const out = await billed("gdpr-fine-lookup", exec("gdpr-fine-lookup")({ company: "Acme" }));
    expect(out.fines).toHaveLength(1);
  });
});

// ─── company-fundamentals (row 20) ─────────────────────────────────────────

const CIK = "320193";
const concept = () =>
  json({
    cik: 320193,
    entityName: "Apple Inc.",
    units: {
      USD: [{ val: 1_000_000, form: "10-K", fp: "FY", fy: 2025, start: "2024-09-29", end: "2025-09-27", filed: "2025-10-31", accn: "0000320193-25-000079" }],
    },
  });

/** Every concept answers, except the tags named, which `failing` answers. */
function secRoutes(failingTag: string | null, failing: () => Promise<Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (failingTag && url.includes(`/${failingTag}.json`)) return failing();
    return concept();
  });
}

describe("failure: company-fundamentals does not report a metric the SEC did not answer for as unreported", () => {
  const failures: Array<[string, () => Promise<Response>, boolean]> = [
    ["HTTP 503", async () => status(503), true],
    ["HTTP 403", async () => status(403), false],
    ["a network error", async () => { throw networkError(); }, true],
    ["a timeout", async () => { throw timeout(); }, true],
    ["an unparseable body", async () => html("<html>Request Rate Threshold Exceeded</html>"), false],
  ];

  for (const [label, failing, retryable] of failures) {
    it(`throws when one concept request fails with ${label}`, async () => {
      secRoutes("NetIncomeLoss", failing);
      const err = await expectUnbilledUpstreamFailure(exec("company-fundamentals")({ cik: CIK }));
      expect(err.message).toContain("SEC XBRL company-concept API");
      expect(err.retryable).toBe(retryable);
    }, 20_000);
  }

  it("throws an outage, not the caller-input refusal, when every concept request fails", async () => {
    fetchMock.mockImplementation(async () => { throw networkError(); });
    const err = await expectUnbilledUpstreamFailure(exec("company-fundamentals")({ cik: CIK }));
    expect(err.message).not.toContain("'cik' must be");
  }, 20_000);
});

describe("negative: company-fundamentals keeps the SEC's real answers", () => {
  it("bills, naming the metric unreported, when the SEC has no such concept (404)", async () => {
    secRoutes("NetIncomeLoss", async () => status(404));
    const out = await billed("company-fundamentals", exec("company-fundamentals")({ cik: CIK }));
    expect(out.fundamentals.net_income).toBeNull();
    expect(out.metrics_unavailable).toEqual(["net_income"]);
    expect(out.fundamentals.revenue).toMatchObject({ value: 1_000_000 });
  }, 20_000);

  it("refuses the input when the registrant has no concept at all (every request 404)", async () => {
    fetchMock.mockImplementation(async () => status(404));
    const err = await thrown(exec("company-fundamentals")({ cik: CIK }));
    expect(err.message).toContain("'cik' must be a registrant with annual (10-K) XBRL data on file");
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  }, 20_000);
});

// ─── country-trade-data (row 26) ───────────────────────────────────────────

const wbValue = (value: number | null) =>
  json([{ page: 1, pages: 1, per_page: 50, total: value === null ? 0 : 1 }, value === null ? null : [{ value, date: "2023" }]]);

describe("failure: country-trade-data does not answer from embedded estimates when the World Bank fails", () => {
  const failures: Array<[string, () => Promise<Response>, boolean]> = [
    ["HTTP 503", async () => status(503), true],
    ["HTTP 429", async () => status(429), true],
    ["a network error", async () => { throw networkError(); }, true],
    ["a timeout", async () => { throw timeout(); }, true],
    ["an unparseable body", async () => html("<html>Service Unavailable</html>"), false],
  ];

  for (const [label, failing, retryable] of failures) {
    it(`throws on ${label} for a country with embedded data`, async () => {
      fetchMock.mockImplementation(failing);
      const err = await expectUnbilledUpstreamFailure(exec("country-trade-data")({ country_code: "SE", year: 2023 }));
      expect(err.message).toContain("World Bank API");
      expect(err.retryable).toBe(retryable);
    });
  }

  it("throws when only one of the two indicators fails", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes("NE.IMP") ? status(502) : wbValue(200_000_000_000)));
    await expectUnbilledUpstreamFailure(exec("country-trade-data")({ country_code: "SE", year: 2023 }));
  });

  it("throws an outage, not 'no trade data', for a country without embedded data", async () => {
    fetchMock.mockImplementation(async () => status(503));
    const err = await expectUnbilledUpstreamFailure(exec("country-trade-data")({ country_code: "ZW", year: 2023 }));
    expect(err.message).not.toContain("No trade data");
  });
});

describe("negative: country-trade-data keeps the World Bank's answers", () => {
  it("bills the embedded estimates when the World Bank has no figure for the year", async () => {
    fetchMock.mockImplementation(async () => wbValue(null));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2025 }));
    expect(out.data_source).toBe("embedded-trade-data");
    expect(out.top_exports.length).toBeGreaterThan(0);
  });

  it("bills live totals when the World Bank answers", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      wbValue(url.includes("NE.EXP") ? 300_000_000_000 : 280_000_000_000),
    );
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2023 }));
    expect(out).toMatchObject({
      data_source: "World Bank API + embedded product data",
      total_exports_usd: 300_000_000_000,
      total_imports_usd: 280_000_000_000,
    });
  });

  it("still says there is no trade data when the World Bank rejects the code and nothing is embedded", async () => {
    fetchMock.mockImplementation(async () =>
      json([{ message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] }]),
    );
    const err = await thrown(exec("country-trade-data")({ country_code: "ZW", year: 2023 }));
    expect(err.message).toContain('No trade data available for country code "ZW"');
  });
});

// ─── whois-lookup (row 28) ─────────────────────────────────────────────────

type WhoisReply = { data: string } | { error: string } | "hang";

/** Each connection answers with the next reply; hosts are recorded. */
function whoisServers(...replies: WhoisReply[]) {
  const hosts: string[] = [];
  netConnect.mockImplementation((_port: number, host: string, onConnect?: () => void) => {
    hosts.push(host);
    const reply = replies.shift() ?? { data: "" };
    const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
    setImmediate(() => {
      onConnect?.();
      if (reply === "hang") return;
      if ("error" in reply) {
        socket.emit("error", Object.assign(new Error(`connect ${reply.error}`), { code: reply.error }));
        return;
      }
      if (reply.data) socket.emit("data", Buffer.from(reply.data));
      socket.emit("end");
    });
    return socket;
  });
  return hosts;
}

const IANA_COM = "% IANA WHOIS server\ndomain:       COM\norganisation: VeriSign Global Registry Services\ncreated:      1985-01-01\nchanged:      2023-12-07\n";
const VERISIGN_RECORD =
  "   Domain Name: EXAMPLE.COM\n   Registrar: RESERVED-Internet Assigned Numbers Authority\n   Creation Date: 1995-08-14T04:00:00Z\n   Registry Expiry Date: 2026-08-13T04:00:00Z\n   Name Server: A.IANA-SERVERS.NET\n";

describe("failure: whois-lookup bills only the registry's answer about the domain", () => {
  it("throws when the registry server fails, instead of billing IANA's record for the TLD", async () => {
    const hosts = whoisServers({ error: "ECONNREFUSED" }, { data: IANA_COM });
    const err = await expectUnbilledUpstreamFailure(exec("whois-lookup")({ domain: "example.com" }));
    expect(err.message).toContain("whois.verisign-grs.com");
    expect(err.retryable).toBe(true);
    expect(hosts).toEqual(["whois.verisign-grs.com"]);
  });

  it("throws on an empty reply from the registry server", async () => {
    whoisServers({ data: "" }, { data: IANA_COM });
    const err = await expectUnbilledUpstreamFailure(exec("whois-lookup")({ domain: "example.com" }));
    expect(err.code).toBe("empty");
  });

  it("throws on a rate-limit notice", async () => {
    whoisServers({ data: "WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS\n" });
    const err = await expectUnbilledUpstreamFailure(exec("whois-lookup")({ domain: "example.org" }));
    expect(err.code).toBe("rate_limited");
    expect(err.retryable).toBe(true);
  });

  it("throws on a refusal notice", async () => {
    whoisServers({ data: "Access denied. Your IP address has been blocked for excessive querying\n" });
    const err = await expectUnbilledUpstreamFailure(exec("whois-lookup")({ domain: "example.io" }));
    expect(err.code).toBe("refused");
  });

  it("refuses a TLD with no registry server here rather than billing IANA's TLD record", async () => {
    const hosts = whoisServers({ data: "domain:       XYZ\ncreated:      2014-03-20\nrefer:        whois.nic.xyz\n" });
    const err = await expectRefusal(exec("whois-lookup")({ domain: "example.xyz" }));
    expect(err.message).toContain(".xyz");
    expect(hosts).toEqual([]);
  });
});

describe("negative: whois-lookup keeps the registry's answers", () => {
  it("bills a parsed record", async () => {
    whoisServers({ data: VERISIGN_RECORD });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "example.com" }));
    expect(out).toMatchObject({ domain: "example.com", created: "1995-08-14T04:00:00Z" });
  });

  it("bills the not-registered negative", async () => {
    whoisServers({ data: 'No match for "NOPE-NOT-REGISTERED.COM".\n>>> Last update of whois database: 2026-11-11 <<<\n' });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "nope-not-registered.com" }));
    expect(out.raw_whois).toContain("No match");
  });

  it("bills a reply in a format the parser does not split (no rate-limit or refusal text)", async () => {
    whoisServers({ data: "[ JPRS database provides information on network administration. ]\n[Domain Name]  EXAMPLE.JP\n[Registrant]  Example\n" });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "example.jp" }));
    expect(out.raw_whois).toContain("EXAMPLE.JP");
  });
});

// ─── page-exists (row 29) ──────────────────────────────────────────────────

const PAGE = "https://shop.test/listing/123";

describe("failure: page-exists never bills exists:null", () => {
  for (const code of [401, 403, 429]) {
    it(`refuses on HTTP ${code} (the site blocks Strale)`, async () => {
      safeFetchMock.mockResolvedValue(status(code, "denied"));
      await expectRefusal(exec("page-exists")({ url: PAGE }));
    });
  }

  it("throws, breaker-exempt, on a 5xx from the caller's site", async () => {
    safeFetchMock.mockResolvedValue(status(503, "down"));
    const err = await expectUnbilledUpstreamFailure(exec("page-exists")({ url: PAGE }));
    expect(err.message).toContain("URL returned HTTP 503");
    expect(err.retryable).toBe(true);
    expect(isUserInputError(err.message)).toBe(true);
  });

  it("throws on any other 4xx, as the site's own answer about the URL", async () => {
    safeFetchMock.mockResolvedValue(status(400, "bad request"));
    const err = await thrown(exec("page-exists")({ url: PAGE }));
    expect(err.message).toMatch(/^URL returned HTTP 400\./);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, counts_against_capability: false });
    expect(isUserInputError(err.message)).toBe(true);
  });

  const transport: Array<[string, () => unknown, string, boolean]> = [
    ["a timeout", timeout, "timeout", true],
    ["a network error", () => networkError(), "ECONNRESET", true],
    ["a DNS failure", () => networkError("ENOTFOUND"), "ENOTFOUND", true],
    [
      "a redirect loop",
      () => new Error("Too many redirects (>3) — refusing to follow further. Starting URL: https://shop.test/listing/123."),
      "redirect loop",
      false,
    ],
  ];
  for (const [label, make, code, retryable] of transport) {
    it(`throws, breaker-exempt, on ${label}`, async () => {
      safeFetchMock.mockRejectedValue(make());
      const err = await expectUnbilledUpstreamFailure(exec("page-exists")({ url: PAGE }));
      expect(err.code).toBe(code);
      expect(err.retryable).toBe(retryable);
      expect(err.message).toContain("URL did not answer");
      expect(isUserInputError(err.message)).toBe(true);
    });
  }
});

describe("negative: page-exists bills its verdicts", () => {
  it("bills a hard 404 as exists:false", async () => {
    safeFetchMock.mockResolvedValue(status(404, "gone"));
    const out = await billed("page-exists", exec("page-exists")({ url: PAGE }));
    expect(out).toMatchObject({ exists: false, confidence: "high", reason: "hard_404" });
  });

  it("bills a live page as exists:true", async () => {
    safeFetchMock.mockResolvedValue(html(`<html><head><title>Listing 123</title></head><body>${"<p>Three bedroom house with garden.</p>".repeat(30)}</body></html>`));
    const out = await billed("page-exists", exec("page-exists")({ url: PAGE }));
    expect(out).toMatchObject({ exists: true, confidence: "medium", reason: "ok" });
  });

  it("bills a soft 404 as exists:false", async () => {
    safeFetchMock.mockResolvedValue(html(`<html><head><title>Page Not Found</title></head><body>${"<p>Sorry.</p>".repeat(100)}</body></html>`));
    const out = await billed("page-exists", exec("page-exists")({ url: PAGE }));
    expect(out).toMatchObject({ exists: false, reason: "soft_404_title" });
  });
});

describe("passthrough: page-exists keeps input-safety refusals", () => {
  it("rethrows a restricted-address error on a redirect hop unchanged", async () => {
    const restricted = new Error("URL resolves to a restricted address (10.0.0.1).");
    safeFetchMock.mockRejectedValue(restricted);
    await expect(exec("page-exists")({ url: PAGE })).rejects.toBe(restricted);
  });
});
