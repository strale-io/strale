import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEurostatMetadata, EUROSTAT_ALLOWED_GEOS, EUROSTAT_ALLOWED_COUNTRIES, EUROSTAT_ALLOWED_AGGREGATES, EUROSTAT_WORLD_COUNTRIES, EUROSTAT_COUNTRY_LABELS, eurostatCategoryIsCountry, EUROSTAT_ALLOWED_DATASETS, EUROSTAT_REFUSED_DATASET_PREFIXES, EUROSTAT_LICENCE_NOTE, EurostatError, executeEurostat, flattenEurostat, type JsonStat, validateEurostatInput } from "./eurostat-data.js";
import { VENDOR_TERMS_RECORDS } from "../lib/vendor-terms.js";
import { EUROSTAT_ALLOWED_REGIONS } from "./lib/eurostat-regions.js";

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
    const data = fixture(); data.dimension.geo.category.index = ["SE", "US"]; data.dimension.geo.category.label = { SE: "Sweden", US: "United States" };
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
    for (const geo of EUROSTAT_ALLOWED_GEOS) expect(() => validateEurostatInput({ dataset: "une_rt_a", filters: { geo } })).not.toThrow();
  });
  it.each(["US", "JP", "CN", "UK", "XK", "WORLD"])("refuses commercial reuse for %s before any fetch", async geo => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, filters: { geo } })).rejects.toMatchObject({ code: "commercial_reuse_restricted", details: { geo } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["ext_lt_intertrd", "DS-045409", "ds-045409", "comext_data", "trade_goods", "itgs_m", "cult_trd_prd", "cult_trd_prt", "sprt_trd_prd", "sprt_trd_prt", "for_trop", "enpe_ext_bal", "bop_its6_tot", "bop_its_tot", "tet00038", "teiet001", "tipsex001", "ei_etea_m", ...EUROSTAT_REFUSED_DATASET_PREFIXES.map(p => `${p}test`)])("refuses trade prefix %s before fetching", async dataset => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, dataset })).rejects.toMatchObject({ code: "dataset_not_supported" });
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
  it.each(["nama_10_gdp", "une_rt_a"])("permits non-trade dataset %s", async dataset => {
    mock(); expect((await executeEurostat({ ...input, dataset })).output.observation_count).toBe(4);
  });
  it("accepts recorded derived-table metadata without confusing lineage with ownership", async () => {
    const data = recorded("tec00013");
    expect(checkEurostatMetadata(data, "tec00013")).toBe(true);
    mock(data); await expect(executeEurostat({ dataset: "tec00013", filters: { geo: "SE" } })).rejects.toMatchObject({ code: "dataset_not_supported" });
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
  it("keeps regional and aggregate geo rules before and after fetch", () => {
    for (const geo of ["se", "SE1", "SE11", "SE110", ...EUROSTAT_ALLOWED_AGGREGATES]) {
      expect(() => validateEurostatInput({ ...input, filters: { geo } })).not.toThrow();
    }
    for (const geo of ["US1", "UK123", "XK1", "SE1234", "TOTAL", "WORLD", "CIS", "NIC_ASI", "EXT_FOR_HDI_HI"]) {
      expect(() => validateEurostatInput({ ...input, filters: { geo } })).toThrow();
      const data = fixture(); data.dimension.geo.category.index = ["SE110", geo];
      const flat = flattenEurostat(data);
      expect(flat.dropped_observation_count).toBe(2);
      expect(flat.dropped_observation_count_by_dimension).toEqual({ geo: 2 });
      expect(flat.dimensions[0].categories.map(c => c.code)).toEqual(["SE110"]);
    }
  });
  it.each([{}, { "0": null }, []])("refuses an empty extraction without returning billable output %j", async value => {
    mock({ ...fixture(), value });
    await expect(executeEurostat(input)).rejects.toMatchObject({ code: "no_observations", message: expect.stringMatching(/No observations for these filters/) });
  });
  it("refuses when every returned country is excluded", async () => {
    const data = fixture(); data.dimension.geo.category.index = ["US", "JP"]; data.dimension.geo.category.label = { US: "United States", JP: "Japan" }; mock(data);
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

describe("Eurostat label-aware country restrictions", () => {
  it("allows unit NR labelled Number before and after fetch", async () => {
    const data = fixture(); data.dimension.unit.category = { index: ["NR"], label: { NR: "Number" } };
    const fetch = mock(data);
    const result = await executeEurostat({ ...input, filters: { geo: "SE", unit: "NR" } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.output.observation_count).toBe(4);
    expect(result.output.dropped_observation_count).toBe(0);
    expect(result.output.unit).toBe("NR");
  });
  it.each([
    ["CN", "  CHINA (People’s Republic of China) ", true],
    ["US", "UNITED---STATES, of America", true],
    ["NR", "Nauru", true], ["NR", "Number", false],
    ["CN", "Chinatown", false], ["CN", undefined, false],
    ["ZZ", "China", false], ["US", "", false],
  ] as const)("identifies %s labelled %s as country=%s", (code, label, expected) => {
    expect(eurostatCategoryIsCountry(code, label)).toBe(expected);
  });

  it("embeds the complete ISO country set and the GEO aliases/variant snapshot", () => {
    expect(EUROSTAT_WORLD_COUNTRIES.size).toBe(257);
    for (const code of ["US", "CN", "JP", "RU", "CN_X_HK", "XK", "UK", "EL", "AQ", "GB", "GR"]) expect(EUROSTAT_WORLD_COUNTRIES.has(code)).toBe(true);
  });
  it.each(["rail_go_intgong", "migr_imm1ctz", "cens_01nsres", "future_table", "tour_occ_ninraw"])("refuses non-listed %s before fetching", async dataset => {
    const fetch = mock();
    await expect(executeEurostat({ ...input, dataset })).rejects.toMatchObject({ code: "dataset_not_supported", message: expect.stringMatching(/Request an addition.*dataset code.*filters/), details: { dataset, allowed_datasets: EUROSTAT_ALLOWED_DATASETS } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([["unit", "EUR"], ["quantile", "MED"], ["class", "G20"], ["indicator", "POL"], ["unit", "NR"]])("preserves non-geographic %s=%s without country detection", async (dimension, code) => {
    const data = fixture(); data.id[1] = dimension;
    data.dimension[dimension] = { category: { index: [code], label: { [code]: code } } };
    mock(data);
    const result = await executeEurostat({ ...input, filters: { geo: "SE", [dimension]: code } });
    expect(result.output.observation_count).toBe(4);
    expect(result.output.dropped_observation_count).toBe(0);
    expect(result.output.observations.every(row => row[dimension] === code)).toBe(true);
    expect(validateEurostatInput({ ...input, filters: { geo: "se", [dimension]: code.toLowerCase() } }).searchParams.get(dimension)).toBe(code.toLowerCase());
  });
  it("permits recorded sbs_na_2c_own metadata and still checks dataset-level ownership", () => {
    const data = recorded("sbs_na_2c_own-metadata");
    expect(data.dimension.owner.label).toBe("Type of ownership");
    expect(checkEurostatMetadata(data, "sbs_na_2c_own")).toBe(true);
    expect(() => checkEurostatMetadata({ ...data, extension: { owner: "OECD" } }, "sbs_na_2c_own")).toThrow(/source other than Eurostat/);
  });
  it.each([
    ["sts_trtu_m", "Retail trade volume"], ["ei_isrt_q", "Wholesale trade indicators"],
    ["ei_bsrt_m_r2", "Retail trade confidence indicator"], ["sbs_sc_dt_r2", "Distributive trade by size class"],
    ["example", "Employment in the trade sector"],
  ])("permits domestic activity title in %s", async (dataset, label) => {
    expect(() => checkEurostatMetadata({ ...fixture(), label }, dataset)).not.toThrow();
  });
  it.each(["International retail trade", "Foreign wholesale trade", "Extra-EU distributive trade", "Intra-EU trade sector", "Retail trade and exports", "Retail trade and international trade", "Retail trade - foreign", "Imports and wholesale trade"])("still refuses international or mixed trade title %s", label => {
    expect(() => checkEurostatMetadata({ label }, "example")).toThrow(/exception \(c\)/);
  });
});


describe("Eurostat recorded dataset allowlist", () => {
  const audit = recorded("dataset-audit-2026-10-26");
  const isoCountries = new Set(audit.iso_3166_alpha2);
  it("matches every included audit row exactly and stays within the curated size bound", () => {
    expect(audit.checked_at).toBe("2026-10-26");
    expect(isoCountries.size).toBe(249);
    expect(audit.iso_3166_alpha2).toEqual([...EUROSTAT_WORLD_COUNTRIES].filter(code => !["AN", "CP", "CQ", "EL", "FX", "UK", "XK", "CN_X_HK"].includes(code)).sort());
    expect(EUROSTAT_ALLOWED_DATASETS).toEqual(audit.datasets.filter((row: {result: string}) => row.result === "included").map((row: {dataset: string}) => row.dataset));
    expect(new Set(EUROSTAT_ALLOWED_DATASETS).size).toBe(EUROSTAT_ALLOWED_DATASETS.length);
    expect(EUROSTAT_ALLOWED_DATASETS.length).toBeGreaterThanOrEqual(30);
    expect(EUROSTAT_ALLOWED_DATASETS.length).toBeLessThanOrEqual(120);
    for (const dataset of ["demo_pjan", "demo_gind", "namq_10_gdp", "prc_hicp_manr", "gov_10dd_edpt1", "sts_inpr_m", "nrg_pc_204", "une_rt_m"]) expect(EUROSTAT_ALLOWED_DATASETS).toContain(dataset);
  });
  // The audit rule, restated independently of the script that wrote the fixture.
  const GEOGRAPHIC_ID = /^(?:partner|citizen|counterp|natvessr|reporter|resid|origin|destination|control|residence|country.*|c_.*)$/i;
  function dimensionFindings(metadata: JsonStat): string[] {
    const findings: string[] = [];
    for (const id of metadata.id.filter(id => id !== "geo" && id !== "time")) {
      if (GEOGRAPHIC_ID.test(id)) findings.push(`${id}: geographic id`);
      const category = metadata.dimension[id].category;
      const codes = Array.isArray(category.index) ? category.index : Object.keys(category.index);
      const labels = (category.label ?? {}) as Record<string, string>;
      for (const code of codes) if (eurostatCategoryIsCountry(code, labels[code])) findings.push(`${id}=${code} (${labels[code]})`);
      if (codes.filter(code => isoCountries.has(code)).length >= 5) findings.push(`${id}: five or more ISO codes`);
    }
    return findings;
  }
  const synthetic = (id: string, labels: Record<string, string>): JsonStat => ({ id: [id, "geo", "time"], size: [], dimension: { [id]: { category: { index: Object.keys(labels), label: labels } } } } as unknown as JsonStat);
  it("screen refuses a renamed country dimension, a country-dense one, and passes look-alike codes", () => {
    expect(dimensionFindings(synthetic("flow_x", { DE: "Germany", TOTAL: "Total" }))).not.toEqual([]);
    expect(dimensionFindings(synthetic("flow_x", { DE: "x", FR: "x", IT: "x", ES: "x", PL: "x" }))).not.toEqual([]);
    expect(dimensionFindings(synthetic("partner", { TOTAL: "Total" }))).not.toEqual([]);
    expect(dimensionFindings(synthetic("unit", { NR: "Number", KM2: "Square kilometre" }))).toEqual([]);
    expect(dimensionFindings(synthetic("s_adj", { SA: "Seasonally adjusted data, not calendar adjusted data", CA: "Calendar adjusted data, not seasonally adjusted data", TC: "Trend cycle data", NSA: "Unadjusted data" }))).toEqual([]);
  });
  it.each(audit.datasets)("$dataset verdict matches the restated rule", ({ dataset, metadata, findings, result, url }: { dataset: string; metadata: JsonStat; findings: string[]; result: string; url: string }) => {
    expect(url).toBe(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?lang=EN&lastTimePeriod=1`);
    let sourceOk = true;
    try { checkEurostatMetadata(metadata, dataset); } catch { sourceOk = false; }
    const passes = sourceOk && dimensionFindings(metadata).length === 0;
    expect(result).toBe(passes ? "included" : "excluded");
    expect(findings.length === 0).toBe(passes);
    if (passes) { expect(metadata.id).toContain("geo"); expect(metadata.id).toContain("time"); }
  });
  it("keeps excluded candidates out of the runtime list", () => {
    for (const row of audit.datasets.filter((row: {result: string}) => row.result === "excluded")) {
      expect(row.findings.length).toBeGreaterThan(0);
      expect(EUROSTAT_ALLOWED_DATASETS).not.toContain(row.dataset);
    }
  });
});


describe("Eurostat regional geo codes", () => {
  const audit = recorded("dataset-audit-2026-10-26");
  const included = audit.datasets.filter((row: { result: string }) => row.result === "included");
  const geoCodes = (metadata: JsonStat) => {
    const index = metadata.dimension.geo.category.index;
    return Array.isArray(index) ? index : Object.keys(index);
  };
  it("lists exactly the region-shaped codes of allowed countries seen in the included datasets", () => {
    const derived = new Set<string>();
    for (const row of included) for (const code of geoCodes(row.metadata)) {
      if (EUROSTAT_ALLOWED_COUNTRIES.includes(code) || EUROSTAT_ALLOWED_AGGREGATES.includes(code)) continue;
      if (/^[A-Z]{2}[0-9A-Z]{1,3}$/.test(code) && EUROSTAT_ALLOWED_COUNTRIES.includes(code.slice(0, 2))) derived.add(code);
    }
    expect([...EUROSTAT_ALLOWED_REGIONS].sort()).toEqual([...derived].sort());
  });
  it("lets every geo category of an included dataset through only as a country, an aggregate or a listed region", () => {
    for (const row of included) for (const code of geoCodes(row.metadata)) {
      const passes = EUROSTAT_ALLOWED_GEOS.includes(code) || EUROSTAT_ALLOWED_REGIONS.has(code);
      let refused = false;
      try { validateEurostatInput({ dataset: row.dataset, filters: { geo: code } }); } catch { refused = true; }
      expect(refused, `${row.dataset}/${code}`).toBe(!passes);
      if (passes && !EUROSTAT_ALLOWED_GEOS.includes(code)) expect(EUROSTAT_ALLOWED_COUNTRIES).toContain(code.slice(0, 2));
    }
  });
  it.each(["SE1", "SE11", "SE110", "FRB", "ITC", "DEA", "EL30", "ALX"])("accepts region %s", geo => {
    expect(() => validateEurostatInput({ dataset: "demo_r_d3dens", filters: { geo } })).not.toThrow();
  });
  it.each(["MEL", "MED", "ALA", "NOECD", "PLR", "TRS", "ESA", "ESM", "ESTAT", "EESC", "BAL", "UKC1", "XK1"])("refuses region-shaped non-territory %s before fetching", geo => {
    expect(() => validateEurostatInput({ dataset: "demo_r_d3dens", filters: { geo } })).toThrow(expect.objectContaining({ code: "commercial_reuse_restricted" }));
  });
  it("drops a region-shaped non-territory after fetch", () => {
    const data = { class: "dataset", version: "2.0", id: ["geo", "time"], size: [2, 1], value: [1, 2], dimension: { geo: { category: { index: ["SE", "MEL"], label: { SE: "Sweden", MEL: "Melanesia" } } }, time: { category: { index: ["2024"] } } } } as unknown as JsonStat;
    const result = flattenEurostat(data);
    expect(result.observations.map((o: Record<string, unknown>) => o.geo)).toEqual(["SE"]);
    expect(result.dropped_observation_count).toBe(1);
  });
  it("hints that Eurostat codes Greece EL", () => {
    expect(() => validateEurostatInput({ dataset: "une_rt_a", filters: { geo: "GR" } })).toThrow(/codes Greece as EL/);
    expect(() => validateEurostatInput({ dataset: "une_rt_a", filters: { geo: "EL" } })).not.toThrow();
  });
  it("accepts half-year periods and orders them", () => {
    expect(validateEurostatInput({ dataset: "nrg_pc_204", filters: { geo: "SE" }, since_period: "2024-S1", until_period: "2024-S2" }).searchParams.get("sinceTimePeriod")).toBe("2024-S1");
    expect(() => validateEurostatInput({ dataset: "nrg_pc_204", filters: { geo: "SE" }, since_period: "2024-S2", until_period: "2024-S1" })).toThrow(/must not follow/);
    expect(() => validateEurostatInput({ dataset: "nrg_pc_204", filters: { geo: "SE" }, since_period: "2024-S3" })).toThrow(/Periods must be/);
  });
  it.each(EUROSTAT_REFUSED_DATASET_PREFIXES.map(p => `${p}x`))("refuses trade prefix %s in the post-fetch metadata check", dataset => {
    expect(() => checkEurostatMetadata({}, dataset)).toThrow(/exception \(c\)/);
  });
});
