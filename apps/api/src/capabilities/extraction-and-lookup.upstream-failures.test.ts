/**
 * Swallowed-upstream-failure fixes, wave 2c: pricing-page-extract (audit
 * row 5), company-fundamentals (20), country-trade-data (26), whois-lookup
 * (28) and page-exists (29);
 * archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md. Row 6,
 * gdpr-fine-lookup, left this batch: the capability is being withheld in a
 * separate PR.
 *
 * Each billed a normal-looking answer when the page or source that decides it
 * had not answered: `plans: []` for a cookie wall, a metric "not reported"
 * when the SEC failed, embedded estimates when the World Bank failed, a rate-limit notice (or IANA's record for the TLD)
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
import { withRetry } from "../lib/retry.js";
import "./pricing-page-extract.js";
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

  it("counts the model's page_error against the capability: it is a judgement, not the target's fault (review round 2, S-b)", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("We use cookies. Accept all cookies to continue."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "page_error", plans: [], enterprise_cta: false });
    const err = await expectUnbilledUpstreamFailure(exec("pricing-page-extract")({ url: PRICING_URL }));
    expect((err as { targetFault?: boolean }).targetFault).toBe(false);
    expect(outcomeFromError(err)).toMatchObject({ fault: "provider", counts_against_capability: true });
  });

  it("throws on an empty app shell without asking the model", async () => {
    fetchRenderedHtml.mockResolvedValue('<html><body><div id="root"></div><script>app()</script></body></html>');
    extractJsonWithLlm.mockResolvedValue({ plans: [], enterprise_cta: false });
    const err = await expectUnbilledUpstreamFailure(exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(err.code).toBe("empty");
    expect(isUserInputError(err.message)).toBe(true);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("counts an empty render against the capability: a degraded renderer produces the same shell (review round 4, B2)", async () => {
    fetchRenderedHtml.mockResolvedValue('<html><body><div id="root"></div><script>app()</script></body></html>');
    const err = await expectUnbilledUpstreamFailure(exec("pricing-page-extract")({ url: PRICING_URL }));
    expect((err as { targetFault?: boolean }).targetFault).toBe(false);
    expect(outcomeFromError(err)).toMatchObject({ fault: "provider", counts_against_capability: true });
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

  it.each([
    ["an invented status, with plans", "partial", [{ name: "Starter", price: "$29/mo" }], "pricing"],
    ["an invented status, without plans", "unknown", [], "no_pricing"],
    ["no status, with plans", undefined, [{ name: "Starter", price: "$29/mo" }], "pricing"],
    ["no status, without plans", undefined, [], "no_pricing"],
  ])("bills %s as page_status by its plans (review round 4, T8)", async (_label, pageStatus, plans, expected) => {
    fetchRenderedHtml.mockResolvedValue(fullPage("Starter $29/mo. Pro $99/mo."));
    extractJsonWithLlm.mockResolvedValue({ page_status: pageStatus, plans, enterprise_cta: false });
    const out = await billed("pricing-page-extract", exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(out.page_status).toBe(expected);
  });

  it("bills that page as page_status 'pricing', never 'page_error' (review round 2, S-b)", async () => {
    fetchRenderedHtml.mockResolvedValue(fullPage("We use cookies. Accept? Starter $29/mo. Pro $99/mo."));
    extractJsonWithLlm.mockResolvedValue({ page_status: "page_error", plans: [{ name: "Starter", price: "$29/mo" }] });
    const out = await billed("pricing-page-extract", exec("pricing-page-extract")({ url: PRICING_URL }));
    expect(out.page_status).toBe("pricing");
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
    ["HTTP 403 (the SEC's rate-threshold page)", async () => html("<html>Request Rate Threshold Exceeded</html>", 403), false],
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

  it("files an SEC 403 as throttling, not as expired credentials (review S2)", async () => {
    secRoutes("NetIncomeLoss", async () => html("<html>Request Rate Threshold Exceeded</html>", 403));
    const err = await expectUnbilledUpstreamFailure(exec("company-fundamentals")({ cik: CIK }));
    expect(err.code).toBe("HTTP 403");
    expect(err.message).not.toContain("403");
    expect(err.message).toContain("the SEC is blocking or rate-limiting requests");
    // The breaker reads the message: a 403 in it would be auth_expired, opening it for 30 minutes.
    expect(categorizeFailureReason(err.message)).not.toBe("auth_expired");
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  }, 20_000);

  it("does not resend into an SEC block: a 403 is not retryable, and tells the caller when to retry (review round 4, B3)", async () => {
    secRoutes("NetIncomeLoss", async () => html("<html>Request Rate Threshold Exceeded</html>", 403));
    await thrown(exec("company-fundamentals")({ cik: CIK }));
    const oneRun = fetchMock.mock.calls.length;
    fetchMock.mockClear();
    const err = await thrown(withRetry(() => exec("company-fundamentals")({ cik: CIK }), { baseDelayMs: 1, maxDelayMs: 1 }));
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("retry in about ten minutes");
    expect(fetchMock.mock.calls.length).toBe(oneRun);
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

  it("treats the 'Invalid value' rejection (message 120) as no figure, and answers from the embedded estimates", async () => {
    fetchMock.mockImplementation(async () =>
      json([{ message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] }]),
    );
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2023 }));
    expect(out.data_source).toBe("embedded-trade-data");
  });

  it("returns the World Bank's one figure beside a null when nothing is embedded for the country", async () => {
    fetchMock.mockImplementation(async (url: string) => wbValue(url.includes("NE.EXP") ? 9_000_000_000 : null));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "ZW", year: 2023 }));
    expect(out).toMatchObject({
      data_source: "World Bank API + embedded product data",
      total_exports_usd: 9_000_000_000,
      total_imports_usd: null,
      trade_balance_usd: null,
    });
  });
});

describe("failure: country-trade-data never mixes a live total with an embedded one (review round 2)", () => {
  it("answers both totals from the embedded estimates when the World Bank has only one figure", async () => {
    fetchMock.mockImplementation(async () => wbValue(null));
    const embedded = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2023 }));
    fetchMock.mockImplementation(async (url: string) => wbValue(url.includes("NE.EXP") ? 123_000_000_000 : null));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2023 }));
    expect(out.data_source).toBe("embedded-trade-data");
    expect(out.total_exports_usd).toBe(embedded.total_exports_usd);
    expect(out.total_imports_usd).toBe(embedded.total_imports_usd);
    expect(out.total_exports_usd).not.toBe(123_000_000_000);
  });

  it("throws on a World Bank rejection other than 'Invalid value', unbilled and not retryable", async () => {
    fetchMock.mockImplementation(async () =>
      json([{ message: [{ id: "175", key: "Invalid format", value: "The indicator was not found" }] }]),
    );
    const err = await expectUnbilledUpstreamFailure(exec("country-trade-data")({ country_code: "SE", year: 2023 }));
    expect(err.message).toContain("rejected (message 175)");
    expect(err.retryable).toBe(false);
  });
});

describe("failure: country-trade-data says which year its totals are for (review round 4, T3)", () => {
  it("labels embedded totals as 2023 when another year was requested", async () => {
    fetchMock.mockImplementation(async () => wbValue(null));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2025 }));
    expect(out).toMatchObject({ year: 2025, totals_year: 2023, data_source: "embedded-trade-data" });
  });

  it("labels live totals with the requested year", async () => {
    fetchMock.mockImplementation(async (url: string) => wbValue(url.includes("NE.EXP") ? 300_000_000_000 : 280_000_000_000));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "SE", year: 2020 }));
    expect(out).toMatchObject({ year: 2020, totals_year: 2020, data_source: "World Bank API + embedded product data" });
  });
});

describe("failure: country-trade-data does not read a two-letter code as part of a country name (review round 4, T3)", () => {
  it("asks the World Bank for KE, not Turkey", async () => {
    fetchMock.mockImplementation(async (url: string) => wbValue(url.includes("NE.EXP") ? 15_000_000_000 : 25_000_000_000));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country_code: "KE", year: 2023 }));
    expect(out.country_code).toBe("KE");
    expect(out.country_name).toBe("KE");
    expect(out.top_exports).toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual(
      expect.arrayContaining([expect.stringContaining("/country/KE/indicator/")]),
    );
    expect(fetchMock.mock.calls.some(([url]) => (url as string).includes("/country/TR/"))).toBe(false);
  });

  it("says there is no trade data for an unknown code with nothing embedded and no World Bank figure", async () => {
    fetchMock.mockImplementation(async () => wbValue(null));
    const err = await thrown(exec("country-trade-data")({ country_code: "KE", year: 2023 }));
    expect(err.message).toContain('No trade data available for country code "KE"');
  });

  it("still resolves a partial country name longer than two letters", async () => {
    fetchMock.mockImplementation(async () => wbValue(null));
    const out = await billed("country-trade-data", exec("country-trade-data")({ country: "swed", year: 2023 }));
    expect(out.country_code).toBe("SE");
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

/** The order Verisign answers in: "Registrar WHOIS Server" before "Registrar". */
const VERISIGN_GOOGLE =
  "   Domain Name: GOOGLE.COM\r\n   Registry Domain ID: 2138514_DOMAIN_COM-VRSN\r\n   Registrar WHOIS Server: whois.markmonitor.com\r\n" +
  "   Registrar URL: http://www.markmonitor.com\r\n   Updated Date: 2019-09-09T15:39:04Z\r\n   Creation Date: 1997-09-15T04:00:00Z\r\n" +
  "   Registry Expiry Date: 2028-09-14T04:00:00Z\r\n   Registrar: MarkMonitor Inc.\r\n   Registrar IANA ID: 292\r\n" +
  "   Registrar Abuse Contact Email: abusecomplaints@markmonitor.com\r\n   Registrar Abuse Contact Phone: +1.2086851750\r\n" +
  "   Name Server: NS1.GOOGLE.COM\r\n";

describe("failure: whois-lookup reads the registrar from the Registrar line (review round 4, T4)", () => {
  it("returns the registrar's name, not its WHOIS server, for a .com record", async () => {
    whoisServers({ data: VERISIGN_GOOGLE });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "google.com" }));
    expect(out.registrar).toBe("MarkMonitor Inc.");
  });

  it("takes a sponsoring-registrar line when the record has no plain Registrar line", async () => {
    whoisServers({ data: "Domain Name: EXAMPLE.BIZ\r\nRegistrar WHOIS Server: whois.example-registrar.test\r\nSponsoring Registrar: Example Registrar LLC\r\n" });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "example.biz" }));
    expect(out.registrar).toBe("Example Registrar LLC");
  });

  it("does not take a registrar detail as the registrar when no line names it", async () => {
    whoisServers({ data: "Domain Name: EXAMPLE.ORG\r\nRegistrar WHOIS Server: whois.example-registrar.test\r\nRegistrar IANA ID: 9999\r\nCreation Date: 2001-01-01T00:00:00Z\r\n" });
    const out = await billed("whois-lookup", exec("whois-lookup")({ domain: "example.org" }));
    expect(out.registrar).toBeUndefined();
    expect(out.created).toBe("2001-01-01T00:00:00Z");
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

/** The resolver's ENOTFOUND for `hostname`, as node:dns raises it. */
const resolverNotFound = (hostname?: string) =>
  Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname ?? ""}`.trim()), {
    code: "ENOTFOUND",
    syscall: "getaddrinfo",
    ...(hostname === undefined ? {} : { hostname }),
  });
/** The same, wrapped by undici ("fetch failed", the errno on the cause). */
const wrappedNotFound = (hostname?: string) => Object.assign(new TypeError("fetch failed"), { cause: resolverNotFound(hostname) });

describe("failure: page-exists answers a host that does not exist (review B1)", () => {
  it.each([
    ["undici's wrapper (code on the cause)", () => wrappedNotFound("shop.test")],
    ["the resolver's own Error (code on the error, as the robots.txt pre-check rethrows it)", () => resolverNotFound("shop.test")],
    ["a host name in other case and fully qualified", () => wrappedNotFound("SHOP.test.")],
  ])("bills exists:false, reason dns_nxdomain, for %s", async (_label, make) => {
    safeFetchMock.mockRejectedValue(make());
    const out = await billed("page-exists", exec("page-exists")({ url: PAGE }));
    expect(out).toMatchObject({ exists: false, confidence: "high", reason: "dns_nxdomain", status_code: null });
  });
});

describe("failure: page-exists bills dns_nxdomain only for the requested host (review round 2, S-a)", () => {
  it.each([
    ["a redirect hop to another host", () => wrappedNotFound("gone.test")],
    ["a robots.txt redirect to another host, as the pre-check rethrows it", () => resolverNotFound("cdn.gone.test")],
    ["an ENOTFOUND that names no host", () => wrappedNotFound()],
  ])("does not bill exists:false on %s", async (_label, make) => {
    safeFetchMock.mockRejectedValue(make());
    const err = await expectUnbilledUpstreamFailure(exec("page-exists")({ url: PAGE }));
    expect(err.code).toBe("ENOTFOUND");
    // An unresolvable name does not start resolving on a retry (review round 2 nit).
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("URL did not answer");
    expect(isUserInputError(err.message)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
  });
});

describe("failure: page-exists review round 2 nits", () => {
  it("throws a retryable target failure on HTTP 408, not a 4xx verdict", async () => {
    safeFetchMock.mockResolvedValue(status(408, "request timeout"));
    const err = await expectUnbilledUpstreamFailure(exec("page-exists")({ url: PAGE }));
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("URL returned HTTP 408, the site timed out the request");
    expect(isUserInputError(err.message)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
  });

  it("rethrows a connect-time SSRF refusal carried on undici's cause, never as 'retry later'", async () => {
    const ssrf = Object.assign(new Error("Resolved host targets a restricted address."), { code: "ESSRFBLOCKED" });
    safeFetchMock.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: ssrf }));
    const err = await thrown(exec("page-exists")({ url: PAGE }));
    expect(err).toBe(ssrf);
    expect(err.message).not.toMatch(/retry/i);
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
