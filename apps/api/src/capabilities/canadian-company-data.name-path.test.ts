/**
 * canadian-company-data name path, end to end, with the registry and the
 * Claude extraction step stubbed.
 *
 * 2026-11-02: a structured `company_name` now goes straight to the free
 * Corporations Canada search; the paid Claude extraction runs only for free
 * text (`task`) or when the direct search has no confident match. This keeps
 * the Gate 5 (DEC-20260411-B) "Shopify" name-path test live and free under
 * the paid-call guard. These tests pin which inputs reach the paid step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOPIFY_RESULTS_HTML } from "./__fixtures__/canadian-shopify-search-results.js";

const extractCompanyName = vi.fn(async (text: string) => text.replace(/^.*?(shopify).*$/i, "$1"));
vi.mock("./lib/browserless-extract.js", () => ({
  extractCompanyName: (text: string, country: string) => extractCompanyName(text, country),
}));

let searchHtml = SHOPIFY_RESULTS_HTML;
const searchQueries: string[] = [];
vi.mock("../lib/safe-fetch.js", () => ({
  safeFetch: async (_url: string, init: { body: string }) => {
    searchQueries.push(new URLSearchParams(init.body).get("corpName") ?? "");
    return new Response(searchHtml, { status: 200, headers: { "content-type": "text/html" } });
  },
  discardBody: async () => {},
}));

const CORP_RECORD = [{
  corporationId: "4261607",
  status: "Active",
  act: "Canada Business Corporations Act",
  corporationNames: [{ CorporationName: { name: "SHOPIFY INC.", current: true, effectiveDate: "2004-09-28" } }],
  adresses: [{ address: { addressLine: ["151 O'Connor Street"], city: "Ottawa", provinceCode: "ON", postalCode: "K2P 2L8", countryCode: "CA", current: true } }],
}];

const EMPTY_RESULTS_HTML = `<section><ol class="list-unstyled"></ol></section>`;

let getExecutor: typeof import("./index.js").getExecutor;

beforeEach(async () => {
  extractCompanyName.mockClear();
  searchQueries.length = 0;
  searchHtml = SHOPIFY_RESULTS_HTML;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(CORP_RECORD), {
    status: 200,
    headers: { "content-type": "application/json" },
  })));
  ({ getExecutor } = await import("./index.js"));
  await import("./canadian-company-data.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function run(input: Record<string, unknown>) {
  const executor = getExecutor("canadian-company-data");
  expect(executor).toBeDefined();
  return executor!(input);
}

describe("canadian-company-data name path", () => {
  it("a plain company_name resolves through the free registry search, with no Claude call", async () => {
    const result = await run({ company_name: "Shopify" });
    expect(extractCompanyName).not.toHaveBeenCalled();
    expect(searchQueries).toEqual(["Shopify"]);
    expect(result.output).toMatchObject({
      company_name: "SHOPIFY INC.",
      corporation_number: "4261607",
      status: "Active",
      match_confidence: "exact",
    });
  });

  it("free text in task still goes through the Claude extraction step first", async () => {
    await run({ task: "look up Shopify in Canada" });
    expect(extractCompanyName).toHaveBeenCalledTimes(1);
    expect(searchQueries).toEqual(["Shopify"]);
  });

  it("a company_name the direct search cannot match falls back to extraction (the previous behaviour)", async () => {
    searchHtml = EMPTY_RESULTS_HTML;
    await expect(run({ company_name: "the e-commerce company Shopify" })).rejects.toThrow();
    expect(extractCompanyName).toHaveBeenCalledTimes(1);
    // Direct search on the raw text, then a search on the extracted name.
    expect(searchQueries).toEqual(["the e-commerce company Shopify", "Shopify"]);
  });

  // Review of PR #888: a fuzzy (`high`) match on raw caller text could name a
  // different corporation, so the direct path accepts exact matches only.
  it("a fuzzy direct match is not accepted: it falls back to extraction", async () => {
    // "Shopify Commerce Services" is a `high` match for "Shopify Commerce Inc."
    // (dissolved) and only a partial for SHOPIFY INC.
    const result = await run({ company_name: "Shopify Commerce Services" });
    expect(extractCompanyName).toHaveBeenCalledTimes(1);
    expect(searchQueries).toEqual(["Shopify Commerce Services", "Shopify"]);
    expect(result.output).toMatchObject({ corporation_number: "4261607", match_confidence: "exact" });
  });

  it("candidates that pickByName refuses on the raw text fall back to extraction", async () => {
    const result = await run({ company_name: "Shopify Ottawa" });
    expect(extractCompanyName).toHaveBeenCalledTimes(1);
    expect(searchQueries).toEqual(["Shopify Ottawa", "Shopify"]);
    expect(result.output).toMatchObject({ corporation_number: "4261607" });
  });

  it("when extraction returns the text unchanged, the direct candidates are reused (no second search)", async () => {
    extractCompanyName.mockImplementationOnce(async (text: string) => text);
    const result = await run({ company_name: "Shopify Commerce Services" });
    expect(searchQueries).toEqual(["Shopify Commerce Services"]);
    // Same answer the pre-change path gave for this input: the fuzzy match.
    expect(result.output).toMatchObject({ match_confidence: "high" });
  });

  it("a non-numeric corporation_number is not treated as a structured name", async () => {
    await run({ corporation_number: "shopify", company_name: "Shopify" }).catch(() => undefined);
    expect(extractCompanyName).toHaveBeenCalledTimes(1);
  });

  it("a corporation number never reaches either the search or Claude", async () => {
    const result = await run({ corporation_number: "4261607" });
    expect(extractCompanyName).not.toHaveBeenCalled();
    expect(searchQueries).toEqual([]);
    expect(result.output).toMatchObject({ corporation_number: "4261607" });
  });
});
