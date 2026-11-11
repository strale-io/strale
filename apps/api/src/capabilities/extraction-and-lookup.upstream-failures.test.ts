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

  it("files a walled page as the target's fault, not counted against the capability (review S1)", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("We use cookies. Accept all cookies to continue."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "page_error", plans: [], enterprise_cta: false });
    const err = await expectUnbilledUpstreamFailure(exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
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

  it("bills the plans it read even when the model also reports page_error (a banner over prices, review S4)", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("We use cookies. Accept? Starter $29/mo. Pro $99/mo."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "page_error", plans: [{ name: "Starter", price: "$29/mo" }] });
    const out = await billed("pricing-page-extract", exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(out.plans).toHaveLength(1);
  });

  it("tells the model that visible prices under a banner or overlay are a pricing page (review S4)", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Starter $29/mo. Pro $99/mo."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "pricing", plans: [{ name: "Starter", price: "$29/mo" }] });
    await exec("pricing-page-extract")({ url: PRICING_URL });
    const { prompt } = extractJsonWithLlm.mock.calls[0][0] as { prompt: string };
    expect(prompt).toMatch(/cookie banner, consent overlay or popup \(visible prices always mean "pricing"\)/);
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

const TRACKER_ROOT = "https://www.enforcementtracker.com/";

type TrackerCase = { e: number; c: string; a: string; d: string; f: number | null; p: string; s: string; r: string; t: string };
const trackerCase = (e: number, p: string, c = "SPAIN"): TrackerCase => ({
  e,
  c,
  a: `${c} data protection authority`,
  d: "2025-01-01",
  f: 1000 * e,
  p,
  s: "Industry and Commerce",
  r: "Art. 6 GDPR",
  t: "Insufficient legal basis for data processing",
});
/** 120 cases, newest last by ETid; Acme AB (Sweden) is ETid 3, far outside the 50 newest the page renders. */
const TRACKER_CASES: TrackerCase[] = [
  trackerCase(1, "Old Corp", "ITALY"),
  trackerCase(2, "Nordic Retail AB", "SWEDEN"),
  trackerCase(3, "Acme AB", "SWEDEN"),
  ...Array.from({ length: 117 }, (_, i) => trackerCase(i + 4, `Filler Company ${i + 4}`)),
];
/** The tracker's front page as rendered: the 50 newest rows as text, every case embedded as JSON. */
const trackerPage = (cases: TrackerCase[] = TRACKER_CASES) =>
  `<html><body><main><table>${[...cases].reverse().slice(0, 50).map((c) => `<tr><td>${c.p}</td><td>${c.c}</td></tr>`).join("")}</table>` +
  `<script type="application/json" id="et-cases" data-purpose="filter-bootstrap">${JSON.stringify(cases)}</script></main></body></html>`;
const llmPrompt = () => (extractJsonWithLlm.mock.calls[0][0] as { prompt: string }).prompt;

describe("failure: gdpr-fine-lookup does not bill a tracker page without its case data", () => {
  it("throws, counted against the source, on a page that carries no case data", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Service temporarily down for maintenance. Please come back later."));
    const err = await expectUnbilledUpstreamFailure(exec("gdpr-fine-lookup")({ company: "Acme" }));
    expect(err.code).toBe("no_case_data");
    expect(err.message).toContain("enforcementtracker.com");
    // Strale chose this source, so its failure counts against the capability.
    expect(isUserInputError(err.message)).toBe(false);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ fault: "provider", counts_against_capability: true });
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("throws UpstreamUnavailableError, not a plain error, on a near-empty render", async () => {
    fetchRenderedHtml.mockResolvedValue("<html><body>Loading…</body></html>");
    const err = await expectUnbilledUpstreamFailure(exec("gdpr-fine-lookup")({ country_code: "SE" }));
    expect(err.code).toBe("no_case_data");
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("throws on case data that does not parse", async () => {
    fetchRenderedHtml.mockResolvedValue('<html><body><script type="application/json" id="et-cases">[{"e":1,</script></body></html>');
    const err = await expectUnbilledUpstreamFailure(exec("gdpr-fine-lookup")({ company: "Acme" }));
    expect(err.code).toBe("unparseable");
  });
});

describe("failure: gdpr-fine-lookup searches the tracker's whole case list (review S4)", () => {
  it("finds a company outside the 50 newest cases the page renders, from the tracker's front page", async () => {
    fetchRenderedHtml.mockResolvedValue(trackerPage());
    extractJsonWithLlm.mockResolvedValue({ page_status: "results", fines: [{ company: "Acme AB", amount_eur: 3000 }], total_fines: 1 });
    const out = await billed("gdpr-fine-lookup", exec("gdpr-fine-lookup")({ company: "Acme" }));
    expect(out.fines).toHaveLength(1);
    // The tracker ignores ?query=, so the executor reads the front page and filters itself.
    expect(fetchRenderedHtml.mock.calls[0][0]).toBe(TRACKER_ROOT);
    expect(llmPrompt()).toContain("controller: Acme AB");
    expect(llmPrompt()).not.toContain("Filler Company");
  });

  it("filters a country search to that country's cases (statistics.html?C= answers 404)", async () => {
    fetchRenderedHtml.mockResolvedValue(trackerPage());
    extractJsonWithLlm.mockResolvedValue({ page_status: "results", fines: [{ company: "Acme AB" }, { company: "Nordic Retail AB" }], total_fines: 2 });
    await billed("gdpr-fine-lookup", exec("gdpr-fine-lookup")({ country_code: "se" }));
    expect(fetchRenderedHtml.mock.calls[0][0]).toBe(TRACKER_ROOT);
    const prompt = llmPrompt();
    expect(prompt).toContain("The tracker has 2 matching case(s)");
    // Newest first, as the tracker lists them.
    expect(prompt.indexOf("controller: Acme AB")).toBeLessThan(prompt.indexOf("controller: Nordic Retail AB"));
    expect(prompt).not.toContain("Old Corp");
  });

  it("hands the model at most the 15 newest matches", async () => {
    fetchRenderedHtml.mockResolvedValue(trackerPage());
    extractJsonWithLlm.mockResolvedValue({ page_status: "results", fines: [{ company: "Filler Company 120" }], total_fines: 1 });
    await exec("gdpr-fine-lookup")({ company: "Filler Company" });
    const prompt = llmPrompt();
    expect(prompt).toContain("The tracker has 117 matching case(s); the 15 newest are below");
    expect(prompt).toContain("controller: Filler Company 120 ");
    expect(prompt).not.toContain("controller: Filler Company 105 ");
  });

  it("refuses a country code the tracker does not cover, without fetching", async () => {
    const err = await expectRefusal(exec("gdpr-fine-lookup")({ country_code: "US" }));
    expect(err.message).toMatch(/^'country_code' must be/);
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });
});

describe("negative: gdpr-fine-lookup bills the tracker's answers", () => {
  it("bills a search with no matching case, without asking the model", async () => {
    fetchRenderedHtml.mockResolvedValue(trackerPage());
    const out = await billed("gdpr-fine-lookup", exec("gdpr-fine-lookup")({ company: "Nobody Holdings" }));
    expect(out).toEqual({ page_status: "no_results", fines: [], total_fines: 0, total_amount_eur: 0 });
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("bills listed fines", async () => {
    fetchRenderedHtml.mockResolvedValue(trackerPage());
    extractJsonWithLlm.mockResolvedValue({ page_status: "results", fines: [{ company: "Acme AB", amount_eur: 3000 }], total_fines: 1 });
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
    // The SEC's throttle page ("Request Rate Threshold Exceeded") is served as a 403.
    ["HTTP 403 (the SEC's rate-threshold page)", async () => html("<html>Request Rate Threshold Exceeded</html>", 403), true],
    ["a network error", async () => { throw networkError(); }, true],
    ["a timeout", async () => { throw timeout(); }, true],
    ["an unparseable 200 body", async () => html("<html>Service notice</html>"), false],
  ];

  for (const [label, failing, retryable] of failures) {
    it(`throws when one concept request fails with ${label}`, async () => {
      secRoutes("NetIncomeLoss", failing);
      const err = await expectUnbilledUpstreamFailure(exec("company-fundamentals")({ cik: CIK }));
      expect(err.message).toContain("SEC XBRL company-concept API");
      expect(err.retryable).toBe(retryable);
    }, 20_000);
  }

  it("files an SEC 403 as retryable throttling, not as expired credentials (review S2)", async () => {
    secRoutes("NetIncomeLoss", async () => html("<html>Request Rate Threshold Exceeded</html>", 403));
    const err = await expectUnbilledUpstreamFailure(exec("company-fundamentals")({ cik: CIK }));
    expect(err.code).toBe("HTTP 403");
    expect(err.message).not.toContain("403");
    expect(err.message).toContain("the SEC is blocking or rate-limiting requests");
    // The breaker reads the message: a 403 in it would be auth_expired, opening it for 30 minutes.
    expect(categorizeFailureReason(err.message)).not.toBe("auth_expired");
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  }, 20_000);

  it("lets every sibling request in the batch finish before failing", async () => {
    let inFlight = 0;
    let settledAfterThrow = 0;
    let thrownAt = 0;
    fetchMock.mockImplementation(async (url: string) => {
      inFlight++;
      if (url.includes("/NetIncomeLoss.json")) {
        inFlight--;
        thrownAt = Date.now();
        throw networkError();
      }
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      if (thrownAt) settledAfterThrow++;
      return concept();
    });
    await expectUnbilledUpstreamFailure(exec("company-fundamentals")({ cik: CIK }));
    expect(inFlight).toBe(0);
    expect(settledAfterThrow).toBeGreaterThan(0);
  }, 20_000);

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

describe("failure: country-trade-data checks 'year' before it reaches the World Bank URL (review S3)", () => {
  it.each([
    ["before 1960", 1959],
    ["in the future", new Date().getUTCFullYear() + 1],
    ["not a whole year", 2023.5],
    ["a query-string injection", "2023&format=xml"],
    ["text", "last year"],
    ["an object", { gte: 2020 }],
  ])("refuses a year %s, without a request", async (_label, year) => {
    const err = await expectRefusal(exec("country-trade-data")({ country_code: "SE", year }));
    expect(err.message).toMatch(/^'year' must be a whole year from 1960 to \d{4}/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a year sent as a string of digits, and sends it encoded", async () => {
    fetchMock.mockImplementation(async (url: string) => wbValue(url.includes("NE.EXP") ? 300_000_000_000 : 280_000_000_000));
    await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: "2023" }));
    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\/country\/SE\/indicator\/NE\.EXP\.GNFS\.CD\?date=2023&format=json$/)]),
    );
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

describe("failure: whois-lookup reads a fully qualified domain's TLD (review nit)", () => {
  it("strips the trailing dot of 'example.com.' and asks the .com registry", async () => {
    const hosts = whoisServers({ data: VERISIGN_RECORD });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "example.com." }));
    expect(hosts).toEqual(["whois.verisign-grs.com"]);
    expect(out.domain).toBe("example.com");
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
    ["a resolver failure that is not NXDOMAIN", () => networkError("EAI_AGAIN"), "EAI_AGAIN", true],
    ["a refused connection, as a bare errno Error", () => Object.assign(new Error("connect ECONNREFUSED 192.0.2.1:443"), { code: "ECONNREFUSED" }), "ECONNREFUSED", true],
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
      // The caller's target, not this capability: out of its quality floor (review S1).
      expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
    });
  }

  it("throws on a 3xx it could not follow, with the status on code and not in the message (review nit)", async () => {
    safeFetchMock.mockResolvedValue(status(301, ""));
    const err = await expectUnbilledUpstreamFailure(exec("page-exists")({ url: PAGE }));
    expect(err.code).toBe("HTTP 301");
    expect(err.message).not.toMatch(/\b30[18]\b/);
    expect(categorizeFailureReason(err.message)).not.toBe("permanent_move");
    expect(isUserInputError(err.message)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
  });

  it("names no other status in a 4xx message (review nit)", async () => {
    safeFetchMock.mockResolvedValue(status(400, "bad request"));
    const err = await thrown(exec("page-exists")({ url: PAGE }));
    expect(err.message).not.toMatch(/\b40[14]\b|\b410\b|gone/i);
    expect(categorizeFailureReason(err.message)).not.toBe("endpoint_gone");
  });
});

describe("failure: page-exists answers a host that does not exist (review B1)", () => {
  it.each([
    ["undici's wrapper (code on the cause)", () => networkError("ENOTFOUND")],
    ["the resolver's own Error (code on the error, as the robots.txt pre-check rethrows it)", () =>
      Object.assign(new Error("getaddrinfo ENOTFOUND no-such-host.test"), { code: "ENOTFOUND", syscall: "getaddrinfo" })],
  ])("bills exists:false, reason dns_nxdomain, for %s", async (_label, make) => {
    safeFetchMock.mockRejectedValue(make());
    const out = await billed("page-exists", exec("page-exists")({ url: PAGE }));
    expect(out).toMatchObject({ exists: false, confidence: "high", reason: "dns_nxdomain", status_code: null });
  });
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
