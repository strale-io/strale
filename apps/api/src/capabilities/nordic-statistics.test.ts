import { afterEach, describe, expect, it, vi } from "vitest";
import { executeNordicStatistics, flattenNordic, NordicStatisticsError, type JsonStat2 } from "./nordic-statistics.js";

const baseInput = { office: "SSB", table: "07459", filters: { Region: "0", ContentsCode: "Population", Tid: ["2023", "2024"] } };
const metadata = { title: "Population", variables: [{ code: "Region", values: ["0"] }, { code: "ContentsCode", values: ["Population"] }, { code: "Tid", time: true, values: ["2023", "2024"] }] };
const dataset = (): JsonStat2 => ({ version: "2.0", class: "dataset", label: "Population", updated: "2026-01-02T00:00:00Z", id: ["Region", "ContentsCode", "Tid"], size: [1, 1, 2], value: [0, null], dimension: {
  Region: { label: "Region", category: { index: ["0"], label: { "0": "Norway" } } },
  ContentsCode: { label: "Contents", category: { index: ["Population"], label: { Population: "Persons" } } },
  Tid: { label: "Year", category: { index: { "2024": 1, "2023": 0 } } },
} });

afterEach(() => vi.restoreAllMocks());
function mockSequence(second: unknown = dataset(), status = 200) {
  return vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
    .mockResolvedValueOnce(new Response(typeof second === "string" ? second : JSON.stringify(second), { status, headers: { "retry-after": "30" } }));
}

describe("Nordic statistics JSON-stat flattening", () => {
  it("flattens dense values and preserves zero and null cells", () => {
    const rows = flattenNordic(dataset()).observations;
    expect(rows).toEqual([
      { Region: "0", ContentsCode: "Population", Tid: "2023", period: "2023", value: 0 },
      { Region: "0", ContentsCode: "Population", Tid: "2024", period: "2024", value: null },
    ]);
  });
  it("flattens sparse values without converting zero to missing", () => {
    const value = dataset(); value.value = { "0": 0 };
    expect(flattenNordic(value).observations.map(row => row.value)).toEqual([0, null]);
  });
});

describe("Nordic statistics validation", () => {
  it.each([
    [{ ...baseInput, office: "DK" }, "invalid_office"],
    [{ ...baseInput, table: "not-curated" }, "table_not_supported"],
    [{ ...baseInput, filters: { Tid: "" } }, "invalid_input"],
    [{ ...baseInput, filters: { Tid: Array.from({ length: 51 }, (_, i) => String(i)) } }, "invalid_input"],
    [{ ...baseInput, filters: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`dim${i}`, ["a", "b"]])) }, "cell_limit_exceeded"],
  ])("rejects invalid input before fetch: %j", async (input, code) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(executeNordicStatistics(input as typeof baseInput)).rejects.toMatchObject({ code });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses an oversized upstream Cartesian selection", () => {
    const data = dataset(); data.id = ["x", "Tid"]; data.size = [100, 51]; data.dimension = { x: { category: { index: Array.from({ length: 100 }, (_, i) => String(i)) } }, Tid: { category: { index: Array.from({ length: 51 }, (_, i) => String(i)) } } };
    expect(() => flattenNordic(data)).toThrowError(expect.objectContaining({ code: "cell_limit_exceeded" }));
  });
});

describe("Nordic statistics executor", () => {
  it("builds a non-constant request and emits attribution fields", async () => {
    const fetch = mockSequence(); const result = await executeNordicStatistics(baseInput);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({ query: expect.arrayContaining([{ code: "Tid", selection: { filter: "item", values: ["2023", "2024"] } }]), response: { format: "json-stat2" } });
    expect(result.output).toMatchObject({ office: "SSB", table: "07459", observation_count: 2, licence_note: expect.stringContaining("CC BY 4.0"), source_url: "https://data.ssb.no/api/v0/en/table/07459", accessed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(result.output).not.toHaveProperty("unit");
  });
  it.each([
    ["SCB", "BE0101N1"], ["SSB", "07459"], ["STATFIN", "vaerak_12af"],
  ])("carries licence, source URL and access date for %s", async (office, table) => {
    mockSequence();
    const output = (await executeNordicStatistics({ office, table, filters: { Region: "0" } })).output;
    expect(output).toMatchObject({ office, table, licence_note: expect.any(String), source_url: expect.stringMatching(/^https:\/\//), accessed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
  it.each([429, 503])("returns a retryable %s error without retrying", async status => {
    const fetch = mockSequence("<html>private upstream detail</html>", status);
    await expect(executeNordicStatistics(baseInput)).rejects.toMatchObject({ retryable: true, code: status === 429 ? "rate_limited" : "upstream_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("honours an exhausted rate-limit header before posting data", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(metadata), { headers: { "x-ratelimit-remaining": "0", "retry-after": "20" } }));
    await expect(executeNordicStatistics(baseInput)).rejects.toMatchObject({ code: "rate_limited", retryable: true, details: { retry_after: "20" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not echo an upstream HTML error", async () => {
    mockSequence("<html>secret diagnostic</html>", 500);
    try { await executeNordicStatistics(baseInput); throw new Error("expected error"); } catch (error) {
      expect(error).toBeInstanceOf(NordicStatisticsError);
      expect(JSON.stringify(error)).not.toContain("secret diagnostic");
    }
  });
});
