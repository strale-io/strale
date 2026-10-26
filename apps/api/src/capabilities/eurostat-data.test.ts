import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEurostatMetadata, EUROSTAT_ALLOWED_GEOS, EUROSTAT_ALLOWED_COUNTRIES, EUROSTAT_ALLOWED_AGGREGATES, EUROSTAT_COUNTRY_DIMENSIONS, EUROSTAT_REFUSED_DATASET_PREFIXES, EUROSTAT_LICENCE_NOTE, EurostatError, executeEurostat, flattenEurostat, type JsonStat, validateEurostatInput } from "./eurostat-data.js";
import { VENDOR_TERMS_RECORDS } from "../lib/vendor-terms.js";

function recorded(name: string) { return JSON.parse(readFileSync(new URL(`./__fixtures__/eurostat/${name}.json`, import.meta.url), "utf8")); }

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
    expect(EUROSTAT_ALLOWED_GEOS).toEqual([...EUROSTAT_ALLOWED_COUNTRIES, ...EUROSTAT_ALLOWED_AGGREGATES]);
    expect(new Set(EUROSTAT_ALLOWED_GEOS).size).toBe(EUROSTAT_ALLOWED_GEOS.length);
    for (const geo of EUROSTAT_ALLOWED_GEOS) expect(() => validateEurostatInput({ dataset: "une_rt_m", filters: { geo } })).not.toThrow();
  });
  it.each(["US", "JP", "CN", "UK", "XK", "WORLD"])("refuses commercial reuse for %s before any fetch", async geo => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, filters: { geo } })).rejects.toMatchObject({ code: "commercial_reuse_restricted", details: { geo } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["ext_lt_intertrd", "DS-045409", "ds-045409", "comext_data", "trade_goods", "itgs_m", "cult_trd_prd", "cult_trd_prt", "sprt_trd_prd", "sprt_trd_prt", "for_trop", "enpe_ext_bal", "bop_its6_tot", "bop_its_tot", "tet00038", "teiet001", "tipsex001", "ei_etea_m", ...EUROSTAT_REFUSED_DATASET_PREFIXES.map(p => `${p}test`)])("refuses trade prefix %s before fetching", async dataset => {
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
    expect(result.output).toMatchObject({ dataset: "nama_10_gdp", source: "Eurostat", licence_note: EUROSTAT_LICENCE_NOTE, dataset_doi: "10.2908/NAMA_10_GDP", accessed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), unit: "CP_MEUR", observation_count: 4, dropped_observation_count: 0, updated: "2026-10-22T21:00:00.000Z" });
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
  it("handles error JSON naming an unknown dataset", async () => { mock(recorded("unknown-dataset"), 404); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "not_found" }); });
  it("passes sanitised upstream dimension errors", async () => { mock(recorded("unknown-dimension"), 400); await expect(executeEurostat(input)).rejects.toThrow('INVALID_QUERY_DIMENSION: Query is invalid as per its structure'); });
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


describe("Eurostat round-two restrictions", () => {
  it.each(["nama_10_gdp", "une_rt_m"])("permits non-trade dataset %s", async dataset => {
    mock(); expect((await executeEurostat({ ...input, dataset })).output.observation_count).toBe(4);
  });
  it("accepts recorded derived-table metadata without confusing lineage with ownership", async () => {
    const data = recorded("tec00013");
    expect(checkEurostatMetadata(data, "tec00013")).toBe(true);
    mock(data); expect((await executeEurostat({ dataset: "tec00013", filters: { geo: "SE" } })).output.observation_count).toBeGreaterThan(0);
  });
  it("refuses a non-Eurostat source on an otherwise permitted derived table", async () => {
    const data = recorded("tec00013");
    data.extension.annotation.find((a: {type: string}) => a.type === "SOURCE_INSTITUTIONS").text = "OECD";
    mock(data); await expect(executeEurostat(input)).rejects.toMatchObject({ code: "commercial_reuse_restricted" });
  });
  it.each(["ext_trade", "DS-123", "CoMeXt_table"])("refuses trade lineage %s", async title => {
    mock({ ...fixture(), extension: { annotation: [{ type: "DISSEMINATION_SOURCE_DATASET", title }] } });
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "commercial_reuse_restricted" });
  });
  it.each(["Trade balance", "IMPORT prices", "Exports of products"])("refuses trade title/theme/category %s", label => {
    for (const data of [{ title: label }, { extension: { theme: label } }]) {
      expect(() => checkEurostatMetadata(data, "example")).toThrow(/exception \(c\)/);
    }
    // Dimension category labels describe values, not the dataset.
    expect(() => checkEurostatMetadata({ dimension: { category: { label: { X: label } } } }, "example")).not.toThrow();
  });
  it("refuses a dataset with a stk_flow (imports/exports) dimension", () => {
    expect(() => checkEurostatMetadata({ title: "Energy flows", dimension: { stk_flow: {}, geo: {} } } as never, "example")).toThrow(/exception \(c\)/);
  });
  it("uses word boundaries in trade labels", () => {
    expect(() => checkEurostatMetadata({ label: "Important economic indicators" }, "example")).not.toThrow();
  });
  it.each(["GEO", "Geo", "geo"])("normalises %s and lowercase countries", key => {
    const url = validateEurostatInput({ ...input, filters: { [key]: "se" } });
    expect(url.searchParams.get("geo")).toBe("SE");
  });
  it.each(["LANG", "Format", "SinceTimePeriod", "UNTILTIMEPERIOD", "LastTimePeriod"])("rejects reserved option %s", key => {
    expect(() => validateEurostatInput({ ...input, filters: { geo: "SE", [key]: "x" } })).toThrow(/Invalid filter dimension/);
  });
  it.each([{ geo: "SE", GEO: "SE" }, { geo: "SE", unit: "X", UNIT: "Y" }])("rejects duplicate normalised keys %j", filters => {
    expect(() => validateEurostatInput({ ...input, filters })).toThrow(/Duplicate/);
  });
  it.each(EUROSTAT_COUNTRY_DIMENSIONS)("enforces %s before and after fetch, including regions and aggregates", async dimension => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, filters: { ...(dimension === "geo" ? {} : { geo: "SE" }), [dimension.toUpperCase()]: "US" } })).rejects.toMatchObject({ code: "commercial_reuse_restricted" });
    expect(fetch).not.toHaveBeenCalled();
    for (const value of ["se", "SE1", "SE11", "SE110", ...EUROSTAT_ALLOWED_AGGREGATES]) {
      expect(() => validateEurostatInput({ ...input, filters: { geo: "SE", [dimension]: value } })).not.toThrow();
    }
    for (const value of ["US1", "UK123", "XK1", "SE1234", "TOTAL", "WORLD"]) {
      expect(() => validateEurostatInput({ ...input, filters: { geo: "SE", [dimension]: value } })).toThrow();
    }
    const data = fixture();
    if (dimension !== "geo") {
      data.id[0] = dimension; data.id.splice(1, 0, "geo"); data.size.splice(1, 0, 1);
      data.dimension[dimension] = data.dimension.geo;
      data.dimension.geo = { category: { index: ["SE"] } };
    }
    data.dimension[dimension].category.index = ["SE110", "US"];
    const flat = flattenEurostat(data);
    expect(flat.dropped_observation_count).toBe(2);
    expect(flat.observations).toHaveLength(2);
    expect(JSON.stringify(flat.dimensions)).not.toContain('"US"');
  });
  it.each([{}, { "0": null }, []])("refuses an empty extraction without returning billable output %j", async value => {
    mock({ ...fixture(), value });
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "no_observations", message: expect.stringMatching(/No observations for these filters/) });
  });
  it("refuses when every returned country is excluded", async () => {
    const data = fixture(); data.dimension.geo.category.index = ["US", "JP"]; mock(data);
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "no_observations", details: { dropped_observation_count: 4 } });
  });
  it.each([200, 400, 413])("maps the recorded size error at HTTP %s", async status => {
    mock(recorded("extraction-too-big"), status);
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "observation_limit_exceeded", message: expect.stringMatching(/EXTRACTION_TOO_BIG.*Narrow filters/) });
  });
  it("maps a bare HTTP 413", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("too big", { status: 413 }));
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "observation_limit_exceeded" });
  });
  it("maps HTTP 413 even with an unexpected JSON body", async () => {
    mock("too big", 413);
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "observation_limit_exceeded" });
  });
  it("maps an asynchronous response to a narrowing refusal", async () => {
    mock(recorded("asynchronous-response"), 202);
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "observation_limit_exceeded", message: expect.stringMatching(/Narrow filters/) });
  });
  it("sanitises real error label fields", async () => {
    const data = recorded("unknown-dimension"); data.error[0].label += "<b>hidden markup</b>\n";
    mock(data, 400);
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "upstream_error", message: expect.not.stringMatching(/<b>|\n/) });
  });
});

describe("trade-word rule scope", () => {
  it("does not refuse a dataset because a dimension category is labelled European Free Trade Association", () => {
    const metadata = { title: "Immigration by citizenship", dimension: { citizen: { label: "Country of citizenship", category: { label: { EFTA: "European Free Trade Association", DE: "Germany" } } } } };
    expect(() => checkEurostatMetadata(metadata as never, "migr_imm1ctz")).not.toThrow();
  });
  it("still refuses a dataset whose own title is about trade", () => {
    expect(() => checkEurostatMetadata({ title: "Intra and extra-EU trade in cultural goods" } as never, "x_cultural")).toThrow();
  });
});
