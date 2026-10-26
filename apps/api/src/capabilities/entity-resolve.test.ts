import { afterEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { EntityResolveError, parseIdentifier, validLei, validIsin, validBic, validVat } from "./lib/entity-identifier.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { resolveEntity } from "./entity-resolve.js";
import "./lei-lookup.js";

vi.mock("./index.js", async importOriginal => {
  const original = await importOriginal<typeof import("./index.js")>();
  return { ...original, getDirectExecutor: vi.fn(original.getDirectExecutor) };
});
const lei = "HWUPKR0MPOU8FGXBT394";
const record = { id: lei, attributes: { lei, entity: {
  legalName: { name: "Example Company" }, legalAddress: { country: "GB", addressLines: ["1 Example Road"] },
  headquartersAddress: { country: "GB" }, jurisdiction: "GB", registeredAt: { id: "RA000585" },
  registeredAs: "00048839", status: "ACTIVE", legalForm: { id: "B6ES" },
}, registration: { status: "ISSUED" }, bic: ["EXAMGB2LXXX"] } };
const list = (data: unknown[], total = data.length) => ({ data, meta: { pagination: { total }, goldenCopy: { publishDate: "2026-10-26T00:00:00Z" } } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function mockFetch(primary = list([record])) {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/isins?")
    ? response(list([], 42)) : url.includes("/registration-authorities/")
      ? response({ data: { attributes: { jurisdictions: [{ countryCode: "GB" }] } } })
      : response(primary)));
}
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(getDirectExecutor).mockReset(); });

describe("identifier detection before upstream access", () => {
  it.each([lei, "549300MLUDYVRQOOXS22"])("accepts LEI checksum %s", value => expect(validLei(value)).toBe(true));
  it.each(["HWUPKR0MPOU8FGXBT395", "HWUPKR0MPOU8FGXBT39A", "123"])("rejects invalid LEI %s", value => expect(validLei(value)).toBe(false));
  it.each(["US0378331005", "GB0002634946"])("accepts ISIN checksum %s", value => expect(validIsin(value)).toBe(true));
  it.each(["US0378331006", "US037833100A"])("rejects invalid ISIN %s", value => expect(validIsin(value)).toBe(false));
  it.each(["DEUTDEFF", "DEUTDEFFXXX"])("accepts BIC shape %s", value => expect(validBic(value)).toBe(true));
  it.each(["DE1TDEFF", "DEUTD1FF", "DEUTDEFFXX"])("rejects BIC shape %s", value => expect(validBic(value)).toBe(false));
  it.each(["SE556703748501", "DE123456789", "FRAB123456789", "EL123456789", "NL123456789B01", "IE1234567AB"])("accepts national VAT shape %s", value => expect(validVat(value)).toBe(true));
  it.each(["SE556703748502", "DE123", "ZZ123456789", "GB123456789", "NL123456789C01"])("rejects unsupported/invalid VAT shape %s", value => expect(validVat(value)).toBe(false));
  it.each([[lei, "lei"], ["US0378331005", "isin"], ["DEUTDEFF", "bic"], ["DE123456789", "vat"]])("detects %s", (identifier, type) => expect(parseIdentifier({ identifier }).type).toBe(type));
  it.each([["hwup kr0m pou8 fgxb t394", lei, "lei"], ["us-037833-1005", "US0378331005", "isin"],
    ["deut-deff xxx", "DEUTDEFFXXX", "bic"], ["se 556703-748501", "SE556703748501", "vat"]])("normalizes %s before detection", (identifier, normalized, type) => {
    expect(parseIdentifier({ identifier })).toMatchObject({ identifier: normalized, type });
    expect(parseIdentifier({ identifier, type })).toMatchObject({ identifier: normalized, type });
  });
  it.each([undefined, "vat"])("refuses DE/ES VAT without fetching (hint %s)", async type => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const identifier of ["DE811128135", "ESA20072302"]) {
      const error = await resolveEntity({ identifier, ...(type ? { type } : {}) }).catch(error => error);
      expect(error).toMatchObject({ error_code: "invalid_request", message: expect.stringMatching(/^'identifier' must be.*registry number.*country/) });
      expect(isCapabilityRefusal(error.message)).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(getDirectExecutor).not.toHaveBeenCalled();
  });
  it("lists the actual ambiguous candidates in the flattened message", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const error = await resolveEntity({ identifier: "SK1000031676" }).catch(error => error);
    expect(error).toMatchObject({ error_code: "invalid_request", details: { candidates: ["isin", "vat"] } });
    expect(error.message).toContain("Candidates: isin, vat");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps detected identifiers when optional country is supplied", () => {
    expect(parseIdentifier({ identifier: lei, country: "US" }).type).toBe("lei");
    expect(parseIdentifier({ identifier: "DEUTDEFF", country: "DE" }).type).toBe("bic");
  });
  it("asks for type and country for an unprefixed ambiguous identifier", () => {
    expect(() => parseIdentifier({ identifier: "00048839" })).toThrow(/unambiguous.*type and country/);
  });
  it("recognizes caller errors as health refusals even after message flattening", async () => {
    const error = await resolveEntity({ identifier: "US0378331006" }).catch(error => error);
    expect(isCapabilityRefusal(error)).toBe(true);
    expect(isCapabilityRefusal((error as Error).message)).toBe(true);
    expect(isCapabilityRefusal(new EntityResolveError("execution_failed", "GLEIF is unavailable. Retry later."))).toBe(false);
  });
  it.each([{ identifier: "00048839", type: "registry" }, { identifier: 5 }, { identifier: lei, type: "constructor" }, { identifier: "DE123", type: "vat" }, { identifier: lei, country: "GBR" }, { identifier: "12", type: "registry", country: "ZZ" }, { identifier: "12", type: "registry", country: "UK" }])("rejects bad input without fetching: %j", async input => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(resolveEntity(input)).rejects.toMatchObject({ error_code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("resolution", () => {
  it("resolves direct LEI with canonical fields and a count, without returning ISIN lists", async () => {
    mockFetch(); vi.mocked(fetch).mockImplementationOnce(async () => response({ data: record }));
    const result = await resolveEntity({ identifier: lei });
    expect(result.output).toMatchObject({ resolved: true, match_method: "lei_direct", confidence: "exact",
      entity: { legal_name: "Example Company", lei_status: "ISSUED", registration_authority_id: "RA000585", entity_status: "ACTIVE" },
      identifiers: { lei, bic: ["EXAMGB2LXXX"], bic_count: 1, isin_count: 42 } });
    expect(result.output.identifiers).not.toHaveProperty("isin");
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { "User-Agent": "Strale/1.0 (+https://strale.dev)" }, signal: expect.any(AbortSignal) });
  });
  it.each([["US0378331005", "isin_mapping", "isin", "US0378331005"], ["DEUTDEFF", "bic_mapping", "bic", "DEUTDEFFXXX"]])("resolves mapped %s", async (identifier, match_method, filter, value) => {
    mockFetch();
    expect((await resolveEntity({ identifier })).output).toMatchObject({ resolved: true, match_method, confidence: "exact", as_of: "2026-10-26T00:00:00Z" });
    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams.get(`filter[${filter}]`)).toBe(value);
  });
  it("retries a missing branch BIC once with the main-office BIC and reports it", async () => {
    mockFetch(); vi.mocked(fetch).mockImplementationOnce(async () => response(list([])));
    const result = await resolveEntity({ identifier: "DEUTDEFF500" });
    expect(result.output).toMatchObject({ resolved: true, match_method: "bic_mapping", bic_matched: "DEUTDEFFXXX" });
    expect(vi.mocked(fetch).mock.calls.slice(0, 2).map(([url]) => new URL(url as string).searchParams.get("filter[bic]")))
      .toEqual(["DEUTDEFF500", "DEUTDEFFXXX"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("reports an exact branch BIC without retrying", async () => {
    mockFetch();
    expect((await resolveEntity({ identifier: "DEUTDEFF500" })).output).toMatchObject({ bic_matched: "DEUTDEFF500" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["DEUTDEFF", "DEUTDEFFXXX"])("does not repeat an empty XXX lookup for %s", async identifier => {
    mockFetch(list([]));
    expect((await resolveEntity({ identifier })).output).toMatchObject({ resolved: false, reason: "no_gleif_match" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not fall back from an ambiguous branch BIC", async () => {
    mockFetch(list([record], 2));
    expect((await resolveEntity({ identifier: "DEUTDEFF500" })).output).toMatchObject({ resolved: false, reason: "multiple_entities_matched" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds BIC output while retaining the full integer count", async () => {
    const bics = Array.from({ length: 30 }, (_, n) => `EXAMGB2L${String(n).padStart(3, "0")}`);
    mockFetch(list([{ ...record, attributes: { ...record.attributes, bic: bics } }]));
    const result = await resolveEntity({ identifier: "US0378331005" });
    expect(result.output.identifiers).toMatchObject({ bic: bics.slice(0, 25), bic_count: 30 });
  });
  it.each([null, undefined, []])("returns zero BICs and count for %j", async bic => {
    mockFetch(list([{ ...record, attributes: { ...record.attributes, bic } }]));
    expect((await resolveEntity({ identifier: "US0378331005" })).output.identifiers).toMatchObject({ bic: [], bic_count: 0 });
  });
  it("resolves registry using both authority and number", async () => {
    mockFetch();
    expect((await resolveEntity({ identifier: "00048839", type: "registry", country: "GB" })).output).toMatchObject({ resolved: true, match_method: "registry_id" });
    const query = new URL(vi.mocked(fetch).mock.calls[2][0] as string).searchParams;
    expect(query.get("filter[entity.registeredAt]")).toBe("RA000585");
    expect(query.get("filter[entity.registeredAs]")).toBe("00048839");
  });
  it("rejects a registry authority from another country", async () => {
    mockFetch();
    expect((await resolveEntity({ identifier: "00048839", type: "registry", country: "SE" })).output).toMatchObject({ resolved: false, reason: "registry_country_mismatch" });
  });
  function vat(output: Record<string, unknown> = {}) {
    vi.mocked(getDirectExecutor).mockReturnValue(vi.fn(async () => ({ output: { valid: true, company_name: "Example Company", country_code: "GB", ...output }, provenance: { source: "VIES", fetched_at: "2026-10-26T00:00:00Z" } })));
  }
  it("reuses VAT validator and marks even a matching name probable", async () => {
    mockFetch(); vat();
    const result = await resolveEntity({ identifier: "XI123456789" });
    expect(result.output).toMatchObject({ resolved: true, match_method: "name_country", confidence: "probable", identifiers: { vat: "XI123456789" } });
    expect(getDirectExecutor).toHaveBeenCalledWith("vat-validate");
    expect(getDirectExecutor("vat-validate")).toHaveBeenCalledWith({ vat_number: "XI123456789" });
    expect(result.provenance).toHaveProperty("vat_validation");
  });
  it.each([[{ valid: false }, "vat_not_valid"], [{ company_name: "---" }, "vat_legal_name_unavailable"], [{ company_name: "Example" }, "no_name_country_match"]])("does not invent a VAT match: %j", async (output, reason) => {
    mockFetch(); vat(output);
    expect((await resolveEntity({ identifier: "XI123456789" })).output).toMatchObject({ resolved: false, reason });
  });
  it("rejects stale VAT confirmation", async () => {
    mockFetch(); vat({ stale: true });
    await expect(resolveEntity({ identifier: "XI123456789" })).rejects.toMatchObject({ error_code: "execution_failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns unresolved for clean empty results", async () => {
    mockFetch(list([]));
    expect((await resolveEntity({ identifier: "US0378331005" })).output).toMatchObject({ resolved: false, reason: "no_gleif_match" });
  });
  it("returns unresolved for a direct 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, 404)));
    expect((await resolveEntity({ identifier: lei })).output.resolved).toBe(false);
  });
  it("does not choose the first of multiple matches, including truncated pages", async () => {
    mockFetch(list([record], 3));
    expect((await resolveEntity({ identifier: "US0378331005" })).output).toMatchObject({ resolved: false, reason: "multiple_entities_matched" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([response("<html>private stack</html>", 503), response({ errors: [{ detail: "private" }] }), new Response("bad JSON")])("sanitizes upstream HTTP/JSON failures", async res => {
    vi.stubGlobal("fetch", vi.fn(async () => res));
    await expect(resolveEntity({ identifier: lei })).rejects.toMatchObject({ error_code: "execution_failed", message: expect.not.stringMatching(/private|stack|JSON/) });
  });
  it("names GLEIF rate limiting and asks the caller to retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, 429)));
    await expect(resolveEntity({ identifier: lei })).rejects.toMatchObject({
      error_code: "execution_failed", message: "GLEIF rate-limited the request. Retry later.", details: { upstream_status: 429 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sanitizes network and validator failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));
    await expect(resolveEntity({ identifier: lei })).rejects.toBeInstanceOf(EntityResolveError);
    vi.mocked(getDirectExecutor).mockReturnValue(vi.fn().mockRejectedValue(new Error("private VIES detail")));
    await expect(resolveEntity({ identifier: "XI123456789" })).rejects.toMatchObject({ error_code: "execution_failed", message: "VIES VAT validation failed. Retry later." });
  });
});
