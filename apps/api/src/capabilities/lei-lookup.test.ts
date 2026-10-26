import { afterEach, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./lei-lookup.js";
afterEach(() => vi.unstubAllGlobals());
const record = { id: "EXAMPLE", attributes: { entity: { legalName: { name: "Example Company" }, jurisdiction: "GB", status: "ACTIVE", legalAddress: { addressLines: ["1 Example Road"], country: "GB" } }, registration: { status: "ISSUED" } } };
it("preserves direct lookup output and request policy after transport factoring", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: record }))));
  const result = await getDirectExecutor("lei-lookup")!({ lei: "HWUPKR0MPOU8FGXBT394" });
  expect(result.output).toEqual({ lei: "EXAMPLE", legal_name: "Example Company", jurisdiction: "GB", category: null, legal_form: null, status: "ACTIVE", registration_status: "ISSUED", initial_registration_date: null, last_update_date: null,
    legal_address: { line1: "1 Example Road", city: null, country: "GB", postal_code: null }, headquarters_address: { line1: null, city: null, country: null, postal_code: null } });
  expect(result.provenance.source).toBe("gleif.org");
  expect(fetch).toHaveBeenCalledWith("https://api.gleif.org/api/v1/lei-records/HWUPKR0MPOU8FGXBT394", expect.objectContaining({ signal: expect.any(AbortSignal) }));
});
it("keeps name disambiguation and country search", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ ...record, id: "OTHER", attributes: { ...record.attributes, entity: { ...record.attributes.entity, legalName: { name: "Example Company Subsidiary" } } } }, record] }))));
  const result = await getDirectExecutor("lei-lookup")!({ company_name: "Example Company", jurisdiction: "GB" });
  expect(result.output.lei).toBe("EXAMPLE");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("filter[entity.legalAddress.country]=GB"), expect.any(Object));
});
it("keeps existing not-found behavior", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  await expect(getDirectExecutor("lei-lookup")!({ lei: "HWUPKR0MPOU8FGXBT394" })).rejects.toThrow(/not found in GLEIF database/);
});
