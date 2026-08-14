/**
 * Regression coverage for the "unscored first result" wrong-company class
 * (see feedback_registry_name_search_never_ranks.md / #161) applied to
 * uk-filing-events.ts's name-search path. Before this fix, `searchCompany`
 * took `items_per_page=1` -> `items[0]` unconditionally, so a generic or
 * ambiguous query could silently return filing history for the wrong company.
 *
 * Post-fix: pulls a page of candidates (items_per_page=20) and scores every
 * one with the shared `pickByName` helper (apps/api/src/lib/company-name-match.ts),
 * refusing on ambiguity or on no confident match instead of guessing.
 *
 * All fetches are mocked — no live network calls, no COMPANIES_HOUSE_API_KEY
 * required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDirectExecutor } from "./index.js";
// Side-effect import: registerCapability("uk-filing-events", ...) runs at
// module load time. Without this, getDirectExecutor("uk-filing-events") below
// returns undefined because nothing has caused the module to be evaluated.
import "./uk-filing-events.js";

function chJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("uk-filing-events — UK Companies House name resolution", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.COMPANIES_HOUSE_API_KEY;
    process.env.COMPANIES_HOUSE_API_KEY = "test-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.COMPANIES_HOUSE_API_KEY;
    else process.env.COMPANIES_HOUSE_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  const exec = () => getDirectExecutor("uk-filing-events")!;

  it("refuses an ambiguous name search rather than silently picking the first result", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/search/companies")) {
        return Promise.resolve(
          chJson({
            items: [
              { title: "Acme Consulting Ltd", company_number: "11111111" },
              { title: "Acme Consulting Ltd", company_number: "22222222" },
            ],
          }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(exec()({ company_name: "Acme Consulting" })).rejects.toThrow(
      /Ambiguous UK Companies House name "Acme Consulting": 2 distinct/,
    );
  });

  it("refuses when nothing in the page confidently matches, naming the disambiguator", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/search/companies")) {
        return Promise.resolve(
          chJson({ items: [{ title: "Totally Unrelated Ltd", company_number: "33333333" }] }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(exec()({ company_name: "Nokia" })).rejects.toThrow(
      /No confident UK Companies House match for "Nokia".*Companies House number \(8 digits\)/s,
    );
  });

  it("selects an unambiguous exact match and proceeds to fetch filing history", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/search/companies")) {
        return Promise.resolve(
          chJson({ items: [{ title: "Rolls-Royce Holdings plc", company_number: "07524813" }] }),
        );
      }
      if (url.includes("/filing-history")) {
        return Promise.resolve(
          chJson({
            total_count: 1,
            items: [{ date: "2026-01-01", type: "AA", category: "accounts", description: "Annual accounts" }],
          }),
        );
      }
      if (url.includes("/company/07524813")) {
        return Promise.resolve(chJson({ company_name: "ROLLS-ROYCE HOLDINGS PLC", company_status: "active" }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const result = await exec()({ company_name: "Rolls-Royce Holdings" });
    const output = result.output as Record<string, unknown>;
    expect(output.company_name).toBe("ROLLS-ROYCE HOLDINGS PLC");
    expect(output.company_number).toBe("07524813");
    expect(output.events_returned).toBe(1);
  });

  it("leaves the company_number identifier path completely unaffected — never calls /search/companies", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/filing-history")) {
        return Promise.resolve(chJson({ total_count: 0, items: [] }));
      }
      if (url.includes("/company/00445790")) {
        return Promise.resolve(chJson({ company_name: "ROLLS-ROYCE HOLDINGS PLC", company_status: "active" }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const result = await exec()({ company_number: "00445790" });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/search/companies"))).toBe(false);
    expect((result.output as Record<string, unknown>).company_number).toBe("00445790");
  });
});
