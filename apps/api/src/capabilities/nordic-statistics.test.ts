import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeNordicStatistics, flattenNordic, NordicStatisticsError, type JsonStat2 } from "./nordic-statistics.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "nordic-statistics");
const fixture = <T = unknown>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const bodyOf = (name: string) => fixture<{ query: Array<{ code: string; selection: { values: string[] } }> }>(name);
// Real, recorded responses (2026-11-06) from the three offices; see __fixtures__/nordic-statistics/README.md.
const baseInput = { office: "SSB", table: "07459", filters: { ContentsCode: "Personer1", Region: "0", Tid: ["2024", "2025"] } };
const metadata = fixture("ssb-metadata.json");
const dataset = (): JsonStat2 => fixture<JsonStat2>("ssb-success.json");

afterEach(() => vi.restoreAllMocks());
function mockSequence(second: unknown = dataset(), status = 200) {
  return vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
    .mockResolvedValueOnce(new Response(typeof second === "string" ? second : JSON.stringify(second), { status, headers: { "retry-after": "30" } }));
}

describe("Nordic statistics JSON-stat flattening", () => {
  it("flattens a recorded SSB response into labelled observations", () => {
    expect(flattenNordic(dataset()).observations).toEqual([
      { Region: "0", ContentsCode: "Personer1", Tid: "2024", period: "2024", value: 5550203 },
      { Region: "0", ContentsCode: "Personer1", Tid: "2025", period: "2025", value: 5594340 },
    ]);
  });
  it("flattens recorded SCB and Statistics Finland responses", () => {
    expect(flattenNordic(fixture<JsonStat2>("scb-success.json")).observations.map(r => [r.period, r.value])).toEqual([["2023", 10551707], ["2024", 10587710]]);
    expect(flattenNordic(fixture<JsonStat2>("statfin-success.json")).observations.map(r => [r.period, r.value])).toEqual([["2024", 5635971], ["2025", 5652881]]);
  });
  it("preserves zero and null cells", () => {
    const value = dataset(); value.value = [0, null];
    expect(flattenNordic(value).observations.map(row => row.value)).toEqual([0, null]);
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

function mockOffice(prefix: "scb" | "ssb" | "statfin") {
  return vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(readFileSync(join(FIXTURES, `${prefix}-metadata.json`), "utf8")))
    .mockResolvedValueOnce(new Response(readFileSync(join(FIXTURES, `${prefix}-success.json`), "utf8")));
}

describe("Nordic statistics executor", () => {
  it("sends the recorded request shape, an honest user agent, and emits attribution fields", async () => {
    const fetch = mockSequence(); const result = await executeNordicStatistics(baseInput);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual(bodyOf("ssb-request-body.json"));
    for (const call of fetch.mock.calls) expect((call[1]?.headers as Record<string, string>)["User-Agent"]).toBe("Strale/1.0 (+https://strale.io)");
    expect(result.output).toMatchObject({ office: "SSB", table: "07459", observation_count: 2, licence_note: expect.stringContaining("CC BY 4.0"), source_url: "https://data.ssb.no/api/v0/en/table/07459", accessed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
  it.each([
    ["SCB", "BE0101N1", "scb" as const, "https://api.scb.se/OV0104/v1/doris/en/ssd/BE/BE0101/BE0101A/BefolkningNy", "scb-request-body.json"],
    ["STATFIN", "vaerak_11ra", "statfin" as const, "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/vaerak/11ra.px", "statfin-request-body.json"],
  ])("replays the recorded %s request and response", async (office, table, prefix, url, bodyFile) => {
    const fetch = mockOffice(prefix);
    const filters = Object.fromEntries(bodyOf(bodyFile).query.map(q => [q.code, q.selection.values]));
    const output = (await executeNordicStatistics({ office, table, filters })).output;
    expect(fetch.mock.calls[0][0]).toBe(url);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual(bodyOf(bodyFile));
    expect(output).toMatchObject({ office, table, observation_count: 2, licence_note: expect.any(String), source_url: url, accessed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
  it("expands since_period/until_period against upstream period codes", async () => {
    const meta = { variables: [{ code: "Tid", time: true, values: ["2023K4", "2024K1", "2024K2", "2024K3", "2025K1"] }] };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(meta))).mockResolvedValueOnce(new Response(JSON.stringify(dataset())));
    await executeNordicStatistics({ ...baseInput, filters: { Region: "0" }, since_period: "2024-Q1", until_period: "2024-Q3" });
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).query.find((q: { code: string }) => q.code === "Tid").selection.values).toEqual(["2024K1", "2024K2", "2024K3"]);
  });
  it("treats the recorded SSB 400 body as an upstream error without echoing it", async () => {
    mockSequence(readFileSync(join(FIXTURES, "ssb-http-400.json"), "utf8"), 400);
    const error = await executeNordicStatistics(baseInput).catch(e => e);
    expect(error).toMatchObject({ code: "upstream_unavailable", retryable: false });
    expect(JSON.stringify(error)).not.toContain("Parameter error");
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
