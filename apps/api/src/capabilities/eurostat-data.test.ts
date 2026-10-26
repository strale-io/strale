import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEurostatMetadata, EUROSTAT_ALLOWED_GEOS, EUROSTAT_LICENCE_NOTE, EurostatError, executeEurostat, flattenEurostat, type JsonStat, validateEurostatInput } from "./eurostat-data.js";
import { VENDOR_TERMS_RECORDS } from "../lib/vendor-terms.js";

const input = { dataset: "nama_10_gdp", filters: { geo: ["SE", "DE"], unit: "CP_MEUR", na_item: "B1GQ" }, since_period: "2020" };
function fixture(): JsonStat {
  return { version: "2.0", class: "dataset", label: "GDP", source: "ESTAT", updated: "2026-10-22T23:00:00+0200",
    id: ["geo", "unit", "time"], size: [2, 1, 2], value: [10, 11, 20, 21],
    dimension: {
      geo: { label: "Country", category: { index: { DE: 1, SE: 0 }, label: { SE: "Sweden", DE: "Germany" } } },
      unit: { label: "Unit", category: { index: ["CP_MEUR"] } },
      time: { label: "Time", category: { index: { "2020": 0, "2021": 1 } } },
    }, extension: { annotation: [{ type: "SOURCE_INSTITUTIONS", text: "Eurostat" }] },
  };
}
afterEach(() => vi.restoreAllMocks());
function mock(body: unknown = fixture(), status = 200) { return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status })); }

describe("Eurostat JSON-stat flattening", () => {
  it("decodes dense values with the last dimension varying fastest, using category positions", () => {
    const result = flattenEurostat(fixture());
    expect(result.observations).toEqual([
      { geo: "SE", unit: "CP_MEUR", time: "2020", period: "2020", value: 10 },
      { geo: "SE", unit: "CP_MEUR", time: "2021", period: "2021", value: 11 },
      { geo: "DE", unit: "CP_MEUR", time: "2020", period: "2020", value: 20 },
      { geo: "DE", unit: "CP_MEUR", time: "2021", period: "2021", value: 21 },
    ]);
    expect(result.dimensions[0].categories[0]).toEqual({ code: "SE", label: "Sweden" });
  });
  it("preserves sparse positions, null missing cells, zero and sparse status flags", () => {
    const data = fixture(); data.value = { "1": 0, "3": 42 }; data.status = { "0": ":", "3": "p" };
    expect(flattenEurostat(data).observations.map(r => [r.value, r.status])).toEqual([[null, ":"], [0, undefined], [null, undefined], [42, "p"]]);
  });
  it("preserves dense status arrays", () => {
    const data = fixture(); data.status = ["p", "e", "", "b"];
    expect(flattenEurostat(data).observations.map(r => r.status)).toEqual(["p", "e", "", "b"]);
  });
  it("drops disallowed geos and their labels even if upstream ignores the filter", () => {
    const data = fixture(); data.dimension.geo.category.index = ["SE", "US"];
    const result = flattenEurostat(data);
    expect(result.dropped_observation_count).toBe(2);
    expect(result.observations).toHaveLength(2);
    expect(JSON.stringify(result.dimensions)).not.toContain('"US"');
  });
  it("caps the Cartesian product even for sparse or empty values", () => {
    const data = fixture(); data.size = [2, 1, 3000]; data.value = {};
    expect(() => flattenEurostat(data)).toThrow(/Narrow filters/);
  });
  it("rejects an oversized value map and malformed category indices", () => {
    const data = fixture(); data.value = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [i, 1]));
    expect(() => flattenEurostat(data)).toThrow(/5,000/);
    data.value = []; data.dimension.geo.category.index = { SE: 0, DE: 2 };
    expect(() => flattenEurostat(data)).toThrow(/inconsistent category/);
  });
});

describe("Eurostat input and reuse restrictions", () => {
  it("allows EU27, EFTA, nine candidates and explicit aggregates only", () => {
    expect(EUROSTAT_ALLOWED_GEOS).toHaveLength(45);
    for (const geo of EUROSTAT_ALLOWED_GEOS) expect(() => validateEurostatInput({ dataset: "une_rt_m", filters: { geo } })).not.toThrow();
  });
  it.each(["US", "JP", "CN", "UK", "XK", "WORLD"])("refuses commercial reuse for %s before any fetch", async geo => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, filters: { geo } })).rejects.toMatchObject({ code: "commercial_reuse_restricted", details: { geo } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["ext_lt_intertrd", "DS-045409", "ds-045409", "comext_data", "trade_goods", "itgs_m"])("refuses trade prefix %s before fetching", async dataset => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, dataset })).rejects.toThrow(/exception \(c\)/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { dataset: "../secret" }, { dataset: "ABC" }, { filters: {} }, { filters: [] }, { filters: { unit: "CP_MEUR" } },
    { filters: { geo: [] } }, { filters: { geo: null } }, { filters: { geo: 42 } }, { filters: { geo: "SE&geo=US" } },
    { filters: { geo: "SE", "bad key": "x" } }, { filters: { geo: "SE", lang: "DE" } },
    { filters: { geo: "SE", unit: Array(50).fill("X") } },
    { filters: Object.fromEntries([['geo', 'SE'], ...Array.from({ length: 10 }, (_, i) => [`dim${i}`, 'X'])]) },
    { since_period: "2020-13" }, { since_period: "2020-Q5" }, { since_period: 2020 }, { until_period: "x" },
    { since_period: "2021", until_period: "2020" },
  ])("rejects malformed input %j", async override => {
    const fetch = mock(); await expect(executeEurostat({ ...input, ...override })).rejects.toBeInstanceOf(EurostatError); expect(fetch).not.toHaveBeenCalled();
  });
  it("encodes repeated values and period bounds without query injection", () => {
    const url = validateEurostatInput({ ...input, until_period: "2025" });
    expect(url.searchParams.getAll("geo")).toEqual(["SE", "DE"]);
    expect(url.searchParams.get("sinceTimePeriod")).toBe("2020");
    expect(url.searchParams.get("untilTimePeriod")).toBe("2025");
    expect(() => validateEurostatInput({ ...input, since_period: "2020-Q1" })).not.toThrow();
    expect(() => validateEurostatInput({ ...input, since_period: "2020-01" })).not.toThrow();
    expect(() => validateEurostatInput({ ...input, since_period: "2020-Q4", until_period: "2020-12" })).not.toThrow();
    expect(() => validateEurostatInput({ ...input, since_period: "2020-12", until_period: "2020-Q1" })).toThrow(/must not follow/);
  });
  it.each([
    { source: "OECD" }, { extension: { source: "World Bank" } }, { extension: { copyright: "OECD" } },
    { extension: { annotation: [{ type: "SOURCE_INSTITUTIONS", text: "Eurostat; OECD" }] } },
    { annotations: [{ type: "COPYRIGHT", title: "Third party material" }] },
  ])("refuses third-party declarations %j", async metadata => {
    mock({ ...fixture(), ...metadata });
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "commercial_reuse_restricted" });
  });
  it("refuses trade datasets identified in metadata even without known prefixes", async () => {
    mock({ ...fixture(), extension: { theme: "International trade in goods" } });
    await expect(executeEurostat(input)).rejects.toThrow(/exception \(c\)/);
  });
  it("refuses trade theme annotations using text payloads", async () => {
    mock({ ...fixture(), extension: { annotation: [{ type: "THEME", text: "International trade" }] } });
    await expect(executeEurostat(input)).rejects.toThrow(/exception \(c\)/);
  });
  it("reports missing source metadata honestly and retains the explicit refusal rules", async () => {
    const data = fixture(); delete data.source; delete data.extension;
    expect(checkEurostatMetadata(data, "nama_10_gdp")).toBe(false);
    mock(data); expect((await executeEurostat(input)).output.metadata_limitations).toMatch(/No source declaration/);
  });
  it("records conditional commercial reuse and every exception in vendor terms", () => {
    const record = VENDOR_TERMS_RECORDS.find(r => r.vendor === "Eurostat")!;
    expect(record.resale).toBe("permitted");
    const findings = record.findings.join(" ");
    for (const word of ["third-party", "geo", "Liechtenstein", "Switzerland", "Austria", "logos", "non-responsibility"]) expect(findings).toContain(word);
  });
});

describe("Eurostat executor", () => {
  it("returns canonical fields, exact URL, attribution and modification disclaimer", async () => {
    const fetch = mock(); const result = await executeEurostat(input);
    expect(result.output).toMatchObject({ dataset: "nama_10_gdp", source: "Eurostat", licence_note: EUROSTAT_LICENCE_NOTE, unit: "CP_MEUR", observation_count: 4, dropped_observation_count: 0, updated: "2026-10-22T21:00:00.000Z" });
    expect(result.output.source_url).toBe(fetch.mock.calls[0][0]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { "User-Agent": "Strale/1.0 (+https://strale.dev)" }, signal: expect.any(AbortSignal), redirect: "error" });
    expect(result.provenance).toMatchObject({ source: "Eurostat", acquisition_method: "direct_api" });
    expect(Number.isNaN(Date.parse(result.output.as_of))).toBe(false);
  });
  it("omits single-unit field when multiple units are present", async () => {
    const data = fixture(); data.id = ["geo", "time"]; data.size = [2, 2]; delete data.dimension.unit; mock(data);
    expect((await executeEurostat(input)).output).not.toHaveProperty("unit");
  });
  it("normalises absent update to null", async () => { const data = fixture(); delete data.updated; mock(data); expect((await executeEurostat(input)).output.updated).toBeNull(); });
  it("handles unknown dataset HTTP 404 without reflecting HTML", async () => { mock("<html>secret</html>", 404); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "not_found", details: { dataset: "nama_10_gdp" } }); });
  it("handles error JSON naming an unknown dataset", async () => { mock({ error: { message: "Dataset does not exist" } }); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "not_found" }); });
  it("passes sanitised upstream dimension errors", async () => { mock({ error: { message: "<b>Unknown dimension</b>\nfoo" } }, 400); await expect(executeEurostat(input)).rejects.toThrow("Unknown dimension foo"); });
  it("rejects non-JSON and non-dataset responses", async () => { vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>secret</html>")); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "upstream_invalid_response" }); });
  it("returns a structured over-cap error", async () => { const data = fixture(); data.size = [2, 1, 3000]; mock(data); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "observation_limit_exceeded" }); });
  it("preserves timeout classification while reading the response body", async () => {
    const response = new Response("{}");
    vi.spyOn(response, "json").mockRejectedValue(new DOMException("body timeout", "AbortError"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "timeout_exceeded" });
  });
  it("turns timeouts into retryable structured errors", async () => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("timed out", "TimeoutError")); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "timeout_exceeded" }); });
  it("does not expose network errors and serialises attribution alongside an error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("private stack detail"));
    try { await executeEurostat(input); throw new Error("expected refusal"); } catch (error) {
      expect(error).toBeInstanceOf(EurostatError);
      expect(JSON.parse(JSON.stringify(error))).toMatchObject({ error_code: "upstream_unavailable", source: "Eurostat", licence_note: EUROSTAT_LICENCE_NOTE });
      expect(JSON.stringify(error)).not.toContain("private stack");
    }
  });
});
