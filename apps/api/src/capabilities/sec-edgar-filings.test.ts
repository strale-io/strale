import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { resetTickerCacheForTests } from "./sec-edgar-filings.js";

const exec = getDirectExecutor("sec-edgar-filings")!;

const TICKERS = { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, "1": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" } };
const SUBMISSIONS = {
  cik: "0000320193", name: "Apple Inc.", tickers: ["AAPL"], exchanges: ["Nasdaq"], sic: "3571", sicDescription: "Electronic Computers",
  stateOfIncorporation: "CA", fiscalYearEnd: "0926", entityType: "operating", category: "Large accelerated filer",
  addresses: { business: { street1: "ONE APPLE PARK WAY", city: "CUPERTINO", stateOrCountry: "CA", zipCode: "95014" } },
  filings: { recent: {
    accessionNumber: ["0000320193-25-000079", "0000320193-25-000070", "0000320193-25-000060"],
    filingDate: ["2025-10-31", "2025-08-01", "2025-07-15"],
    reportDate: ["2025-09-27", "2025-06-28", ""],
    form: ["10-K", "10-Q", "8-K"],
    primaryDocument: ["aapl-20250927.htm", "aapl-20250628.htm", "aapl-8k.htm"],
    primaryDocDescription: ["10-K", "10-Q", "8-K"],
    items: ["", "", "2.02,9.01"],
  } },
};

describe("sec-edgar-filings", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); resetTickerCacheForTests(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("refuses when neither ticker nor cik is given, before any upstream call", async () => {
    await expect(exec({})).rejects.toThrow(/'ticker' or 'cik' is required/);
    await expect(exec({ cik: "12a" })).rejects.toThrow(/'cik' must be a number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a ticker through the SEC index, sends the fair-access User-Agent, filters by form and builds document URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(TICKERS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SUBMISSIONS), { status: 200 }));
    const r = await exec({ ticker: "aapl", form_type: "10-k", limit: 5 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://www.sec.gov/files/company_tickers.json");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://data.sec.gov/submissions/CIK0000320193.json");
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Strale\/1\.0 \(support@strale\.io\)/);
    expect(r.output.cik).toBe(320193);
    expect(r.output.ticker).toBe("AAPL");
    expect(r.output.returned).toBe(1);
    const f = (r.output.filings as Array<Record<string, unknown>>)[0];
    expect(f.form).toBe("10-K");
    expect(f.url).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm");
    expect(f.report_date).toBe("2025-09-27");
  });

  it("fetches the ticker index once and reuses it on a second call in the same process; unfiltered returns all forms", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(TICKERS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SUBMISSIONS), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SUBMISSIONS), { status: 200 }));
    await exec({ ticker: "AAPL", limit: 1 });
    const r = await exec({ ticker: "NVDA", limit: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // index + submissions, then submissions only
    expect(String(fetchMock.mock.calls[2][0])).toBe("https://data.sec.gov/submissions/CIK0001045810.json");
    expect(r.output.returned).toBe(2);
    expect((r.output.filings as Array<Record<string, unknown>>).map((f) => f.form)).toEqual(["10-K", "10-Q"]);
  });

  it("names an unknown ticker and suggests the CIK route", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(TICKERS), { status: 200 }));
    await expect(exec({ ticker: "ZZZQ" })).rejects.toThrow(/Ticker 'ZZZQ' is not in the SEC's company ticker index/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a CIK that EDGAR does not know is a clear not-found, and 8-K items are surfaced", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(exec({ cik: 1 })).rejects.toThrow(/No EDGAR filer found for CIK 1/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(SUBMISSIONS), { status: 200 }));
    const r = await exec({ cik: "320193", form_type: "8-K" });
    expect((r.output.filings as Array<Record<string, unknown>>)[0].items).toBe("2.02,9.01");
    expect((r.output.filings as Array<Record<string, unknown>>)[0].report_date).toBeNull();
  });
});
