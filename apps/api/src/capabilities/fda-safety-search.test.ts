import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { formatFdaDate, buildSearch } from "./fda-safety-search.js";

const exec = getDirectExecutor("fda-safety-search")!;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("fda-safety-search", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("reformats openFDA's bare YYYYMMDD dates", () => {
    expect(formatFdaDate("20230322")).toBe("2023-03-22");
    expect(formatFdaDate("2023-03-22")).toBeNull();
    expect(formatFdaDate(undefined)).toBeNull();
  });

  // openFDA's boolean operators must survive encoding; percent-encoding the
  // whole expression would break +OR+ and return everything.
  it("encodes each clause but leaves the operators literal", () => {
    const s = buildSearch("aspirin", null);
    expect(s).toContain("+OR+");
    expect(s).toContain("product_description%3A%22aspirin%22");
    expect(s.startsWith("(")).toBe(true);
    const withClass = buildSearch("aspirin", "Class I");
    expect(withClass).toContain("+AND+");
    expect(withClass).toContain("classification%3A%22Class%20I%22");
  });

  it("refuses an unknown domain and an unknown classification before any call", async () => {
    await expect(exec({ query: "aspirin", domain: "vehicle" })).rejects.toThrow(/'domain' must be one of/);
    await expect(exec({ query: "aspirin", classification: "IV" })).rejects.toThrow(/'classification' must be one of/);
    await expect(exec({ query: "a" })).rejects.toThrow(/'query' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts numeric and roman classification spellings", async () => {
    // A Response body can only be consumed once, so build a fresh one per call.
    fetchMock.mockImplementation(async () => ok({ meta: { results: { total: 0 } }, results: [] }));
    await exec({ query: "aspirin", classification: "1" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("Class%20I");
    await exec({ query: "aspirin", classification: "class iii" });
    expect(String(fetchMock.mock.calls[1][0])).toContain("Class%20III");
  });

  it("projects a recall record with normalized dates", async () => {
    fetchMock.mockResolvedValue(ok({
      meta: { results: { total: 81 } },
      results: [{
        recall_number: "D-0508-2023",
        status: "Ongoing",
        classification: "Class II",
        product_description: "Alprazolam C-IV, 1 mg",
        reason_for_recall: "CGMP Deviations",
        recalling_firm: "Direct Rx",
        recall_initiation_date: "20230322",
        report_date: "20230412",
        city: "Dawsonville",
        state: "GA",
        country: "United States",
      }],
    }));
    const { output } = await exec({ query: "alprazolam", domain: "drug", limit: 1 });
    expect(output.total_results).toBe(81);
    expect(output.returned).toBe(1);
    const r = (output.recalls as Array<Record<string, unknown>>)[0];
    expect(r.recall_number).toBe("D-0508-2023");
    expect(r.recall_initiation_date).toBe("2023-03-22");
    expect(r.report_date).toBe("2023-04-12");
    expect(r.firm_state).toBe("GA");
  });

  // openFDA signals an empty result set with HTTP 404. Treating that as a
  // failure would bill a fault and trip the breaker on a valid query.
  it("returns a no-match 404 as an empty result, not an error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "No matches found!" } }), { status: 404 }));
    const { output } = await exec({ query: "zzzznonexistent", domain: "food" });
    expect(output.total_results).toBe(0);
    expect(output.returned).toBe(0);
    expect(output.recalls).toEqual([]);
    expect(output.domain).toBe("food");
  });
});
