import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getExecutor } from "../capabilities/index.js";
import "../capabilities/aml-risk-score.js";

// The API CI job does not install Astro. Load this dependency-free content
// module without resolving the website's Astro-based tsconfig.
const source = readFileSync(new URL("../../../web/src/content/tool-pages.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const content = { exports: {} as { toolPages: Record<string, { example: { input: Record<string, unknown>; output: Record<string, unknown> } }> } };
runInNewContext(compiled.outputText, content);
const { toolPages } = content.exports;

vi.mock("./metered-vendor-fetch.js", () => ({ meteredVendorFetch: vi.fn(async () => new Response(JSON.stringify({ found_records: [] }), { status: 200 })) }));
import "../capabilities/sanctions-check.js";
import "../capabilities/belgian-company-data.js";
import { resetTickerCacheForTests } from "../capabilities/sec-edgar-filings.js";
import "../capabilities/vat-validate.js";
import "../capabilities/singapore-company-data.js";
import "../capabilities/http-to-curl.js";
vi.mock("./robots-txt.js", () => ({ assertRobotsAllowed: vi.fn(async () => {}) }));
import "../capabilities/page-speed-test.js";

it("the Singapore example maps the source record and does not promise missing details", async () => {
  const records = [{ uen: "197200078R", entity_name: "SINGAPORE AIRLINES LIMITED", entity_type_desc: "Local Company", uen_status_desc: "Registered", reg_street_name: "AIRLINE ROAD", reg_postal_code: "819829" }];
  const fetcher = vi.fn(async (_url: unknown) => new Response(JSON.stringify({ success: true, result: { records } })));
  vi.stubGlobal("fetch", fetcher);
  try {
    const example = toolPages["singapore-company-data"]!.example;
    const result = await getExecutor("singapore-company-data")!(example.input);
    const request = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(JSON.parse(request.searchParams.get("filters")!)).toEqual({ uen: "197200078R" });
    expect(result.output).toMatchObject(example.output);
    expect(result.output).not.toHaveProperty("company_name");
    expect(result.output).not.toHaveProperty("vat_number");
    expect(result.output.uen_issue_date).toBeNull();
    records[0]!.reg_street_name = ""; records[0]!.reg_postal_code = "";
    const missing = await getExecutor("singapore-company-data")!(example.input);
    expect(missing.output.registered_address).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});

it("the page-speed illustration matches lab-score mapping and units from the executor", async () => {
  const audits: Record<string, { numericValue?: number }> = {
    "largest-contentful-paint": { numericValue: 2400 }, "first-contentful-paint": { numericValue: 1400 },
    "cumulative-layout-shift": { numericValue: 0.04 }, "total-blocking-time": { numericValue: 180 },
    "server-response-time": { numericValue: 200 }, "speed-index": { numericValue: 2100 },
  };
  const fetcher = vi.fn(async (_url: unknown) => new Response(JSON.stringify({ lighthouseResult: { categories: { performance: { score: 0.82 } }, audits } })));
  vi.stubGlobal("fetch", fetcher);
  try {
    const example = toolPages["page-speed-test"]!.example;
    const result = await getExecutor("page-speed-test")!(example.input);
    const request = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(request.hostname).toBe("www.googleapis.com");
    expect(request.searchParams.get("url")).toBe(example.input.url);
    expect(request.searchParams.get("strategy")).toBe("mobile");
    expect(result.output).toMatchObject(example.output);
    expect(result.output).not.toHaveProperty("loadingExperience");
    delete audits["largest-contentful-paint"];
    const missing = await getExecutor("page-speed-test")!(example.input);
    expect((missing.output.metrics as Record<string, unknown>).lcp_ms).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});

it("the documented Singapore name example uses name search and explains identifier-like names", async () => {
  const guide = readFileSync(new URL("../../../web/src/data/guides/singapore-company-lookup-api.md", import.meta.url), "utf8");
  const nameInput = JSON.parse(guide.match(/`(\{"company_name":[^`]+\})`/)![1]!);
  const fetcher = vi.fn(async (_url: unknown) => new Response(JSON.stringify({ success: true, result: { records: [
    { uen: "000000001A", entity_name: "UNRELATED BANK", uen_status_desc: "Registered" },
    { uen: "000000002B", entity_name: "DBS BANK OLD", uen_status_desc: "Deregistered" },
    { uen: "196800306E", entity_name: "DBS BANK LTD.", uen_status_desc: "Registered" },
  ] } })));
  vi.stubGlobal("fetch", fetcher);
  try {
    const result = await getExecutor("singapore-company-data")!(nameInput);
    const request = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(request.searchParams.get("q")).toBe("DBS BANK");
    expect(request.searchParams.has("filters")).toBe(false);
    expect(result.output.uen).toBe("196800306E");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { records: [] } })));
    await expect(getExecutor("singapore-company-data")!({ company_name: "SINGAPORE AIRLINES LIMITED" })).rejects.toThrow("UEN SINGAPORE");
    expect(guide).toContain("interpreted as the identifier `SINGAPORE`");
  } finally { vi.unstubAllGlobals(); }
});

it("the HTTP example generates equivalent bodyless GET requests without contacting the target", async () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  try {
    const example = toolPages["http-to-curl"]!.example;
    const result = await getExecutor("http-to-curl")!(structuredClone(example.input));
    expect(network).not.toHaveBeenCalled();
    expect(result.output).toMatchObject(example.output);
    expect(String(result.output.curl_command)).not.toMatch(/ -d |--data|-X POST/);
    const fetchStub = vi.fn(async () => ({}));
    const axiosGet = vi.fn(async () => ({}));
    await runInNewContext(`(async () => { ${result.output.equivalent_fetch} })()`, { fetch: fetchStub });
    await runInNewContext(`(async () => { ${result.output.equivalent_axios} })()`, { axios: { get: axiosGet } });
    for (const generated of [fetchStub, axiosGet]) {
      expect(generated).toHaveBeenCalledWith(example.input.url, { headers: { Accept: "application/json" } });
    }
  } finally { vi.unstubAllGlobals(); }
});

it("the Belgian example preserves the enterprise number and derives the displayed VAT number", async () => {
  vi.stubEnv("CBEAPI_KEY", "unit-test-placeholder");
  const fetcher = vi.fn(async (_url: unknown) => new Response(JSON.stringify({ data: {
    cbe_number: "0417497106", denomination: "ANHEUSER-BUSCH INBEV",
  } }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const example = toolPages["belgian-company-data"]!.example;
    const result = await getExecutor("belgian-company-data")!(example.input);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://cbeapi.be/api/v1/company/0417497106");
    expect(result.output).toMatchObject(example.output);
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});

it("the SEC example filters for the requested form and builds the documented filing link", async () => {
  resetTickerCacheForTests();
  const fetcher = vi.fn(async (url: unknown) => new Response(JSON.stringify(
    String(url).endsWith("company_tickers.json") ? { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } } : {
      name: "Apple Inc.", tickers: ["AAPL"], filings: { recent: {
        accessionNumber: ["0000320193-26-000001", "0000320193-25-000079"],
        form: ["10-Q", "10-K"], filingDate: ["2026-02-01", "2025-10-31"],
        reportDate: ["2025-12-31", "2025-09-27"], primaryDocument: ["quarter.htm", "aapl-20250927.htm"],
      } },
    }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const example = toolPages["sec-edgar-filings"]!.example;
    const result = await getExecutor("sec-edgar-filings")!(example.input);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://www.sec.gov/files/company_tickers.json", "https://data.sec.gov/submissions/CIK0000320193.json",
    ]);
    expect(result.output).toMatchObject(example.output);
  } finally { vi.unstubAllGlobals(); resetTickerCacheForTests(); }
});

it("the VAT example agrees with the VIES adapter and missing details are empty strings", async () => {
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
    const swedish = String(options?.body).includes("<urn:countryCode>SE</urn:countryCode>");
    return new Response(`<checkVatResponse><valid>true</valid><name>${swedish ? "Spotify AB" : "---"}</name><address>${swedish ? "REGERINGSGATAN 19\n111 53 STOCKHOLM" : "---"}</address><requestDate>2026-11-10</requestDate></checkVatResponse>`, { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const example = toolPages["vat-validate"]!.example;
    const result = await getExecutor("vat-validate")!(example.input);
    expect(result.output).toMatchObject(example.output);
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain("<urn:vatNumber>556703748501</urn:vatNumber>");
    const missing = await getExecutor("vat-validate")!({ vat_number: "DE811128135" });
    expect(missing.output).toMatchObject({ valid: true, vat_number: "DE811128135", company_name: "", company_address: "" });
  } finally { vi.unstubAllGlobals(); }
});

it("the AML landing-page example is computed by the real scoring rules", async () => {
  const example = toolPages["aml-risk-score"]!.example;
  const result = await getExecutor("aml-risk-score")!(example.input);
  expect(result.output).toMatchObject(example.output);
});

it("the labelled sanctions illustration matches the executor's no-match response", async () => {
  vi.stubEnv("DILISENSE_API_KEY", "unit-test-placeholder");
  try {
    const example = toolPages["sanctions-check"]!.example;
    const result = await getExecutor("sanctions-check")!(example.input);
    expect(result.output).toMatchObject(example.output);
  } finally { vi.unstubAllEnvs(); }
});
