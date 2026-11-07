/**
 * customs-duty-lookup and container-track read only robots-permitted pages
 * (weekly-drift robots sweep, issue #747; DEC-20261023-A).
 *
 * REGRESSION tests fail against main at 9743a243:
 *   - customs-duty-lookup fetched ec.europa.eu/taxation_customs/dds2/taric/
 *     first (disallowed for every agent), and its Access2Markets fallback sent
 *     destination=EU with an optional origin, which Access2Markets answers with
 *     an HTTP 400 page that the LLM was then asked to read.
 *   - container-track fetched maersk.com/tracking/<number> (disallowed), and
 *     sent every other carrier to SeaRates, whose URL now redirects to DP
 *     World's homepage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRenderedHtml, extractJsonWithLlm } = vi.hoisted(() => ({
  fetchRenderedHtml: vi.fn(),
  extractJsonWithLlm: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRenderedHtml,
}));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm }));

import { getDirectExecutor } from "./index.js";
import { resultsSection, a2mResultsUrl, pickerCodes } from "./customs-duty-lookup.js";
import "./container-track.js";

/** The text Access2Markets renders for 8471.30 from China to Sweden (2026-11-07), trimmed. */
const A2M_RESULTS = `<html><body>
<p>Access2Markets My Trade Assistant Showing search results for 8471.30 from China to Sweden</p>
<p>Results for product code 8471.30 from China to Sweden</p>
<p>Tariffs Taxes Import requirements Trade flow statistics latest update: 31 October 2026</p>
<p>ERGA OMNES Third country duty Tariff 0% EU law:R2204/99 ERGA OMNES Low-value consignment customs duty Tariff 3.00 EUR</p>
<p>${"Footnote text about the low-value consignment duty. ".repeat(10)}</p>
<p>Sources and copyright</p><p>Mendel Verlag rows would be described here.</p>
</body></html>`;

/**
 * Access2Markets' picker for a code split further, in its real markup: each
 * two-digit group sits in its own span (610910 from Viet Nam and 87120030 from
 * China, 2026-11-07, trimmed). A fixture typed as "610910 00 10" passed while
 * production never matched (review of PR #974, round 2).
 */
const node = (desc: string, groups: string[]) =>
  `<li><span class="product-desc">${desc}</span><div class="prod">${groups.map((g) => `<span>${g}</span>`).join("")}</div></li>`;
const A2M_PICKER = `<html><body><h2>Product search</h2>
<div class="resultshelp"> For your search criteria, a match was identified with an HS code. Please continue browsing in the proposed branch of the list of goods and select your product. </div>
<ul>${node("T-shirts, singlets and other vests", ["61", "09"])}${node("Of cotton", ["61", "09", "10"])}
${node("T-shirts", ["61", "09", "10", "00", "10"])}${node("Other", ["61", "09", "10", "00", "90"])}</ul>
<p>Quick links</p><p>News 2026 11 07 12 00</p></body></html>`;
const A2M_PICKER_8 = `<html><body><div> a match was identified with an HS code. </div>
<ul>${node("Bicycles with ball bearings", ["87", "12", "00", "30"])}${node("Consigned from Indonesia", ["87", "12", "00", "30", "10"])}
${node("Other", ["87", "12", "00", "30", "90"])}</ul><p>Quick links</p></body></html>`;

const A2M_400 = `<html><body><p>Bad Request Something went wrong</p>
<p>Wrong parameters, country from and country to are mandatory and must be valid.</p><p>Error 400</p></body></html>`;

beforeEach(() => {
  fetchRenderedHtml.mockReset();
  extractJsonWithLlm.mockReset();
  extractJsonWithLlm.mockResolvedValue({ duty_rate: "0%", duty_type: "ad_valorem", vat_rate: "25%" });
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});

describe("customs-duty-lookup", () => {
  const exec = () => getDirectExecutor("customs-duty-lookup")!;

  it("REGRESSION: reads only the Access2Markets results page, never TARIC's disallowed pages", async () => {
    fetchRenderedHtml.mockResolvedValue(A2M_RESULTS);
    const r = await exec()({ hs_code: "8471.30", origin_country: "cn", destination_country: "se" });
    expect(fetchRenderedHtml).toHaveBeenCalledTimes(1);
    const url = String(fetchRenderedHtml.mock.calls[0][0]);
    expect(url).toBe("https://trade.ec.europa.eu/access-to-markets/en/results?product=847130&origin=CN&destination=SE");
    expect(url).not.toMatch(/taxation_customs/);
    expect(r.output).toMatchObject({ hs_code: "847130", resolved_hs_code: "847130", origin_country: "CN", destination: "SE" });
    // The page carries no VAT rate, so one from the model is never passed on.
    expect(r.output.vat_rate).toBeNull();
    expect(r.provenance).toMatchObject({ license: "CC BY 4.0", source_url: url });
    expect(String(r.provenance.attribution)).toMatch(/European Union/);
  });

  it("asks for a member state when the caller says EU", async () => {
    fetchRenderedHtml.mockResolvedValue(A2M_RESULTS);
    const r = await exec()({ hs_code: "847130", origin_country: "CN" });
    expect(String(fetchRenderedHtml.mock.calls[0][0])).toMatch(/destination=DE$/);
    expect(r.output.destination).toBe("EU");
    expect(r.output.vat_rate).toBeNull();
    expect(r.provenance.queried_member_state).toBe("DE");
  });

  it("REGRESSION: an Access2Markets error page throws instead of reaching the LLM", async () => {
    fetchRenderedHtml.mockResolvedValue(A2M_400);
    await expect(exec()({ hs_code: "847130", origin_country: "CN", destination_country: "SE" })).rejects.toThrow(
      /no tariff results/,
    );
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("a code split further is refused with the codes to use, before the LLM", async () => {
    fetchRenderedHtml.mockResolvedValue(A2M_PICKER);
    await expect(exec()({ hs_code: "610910", origin_country: "VN", destination_country: "DE" })).rejects.toThrow(
      /split further.*6109100010, 6109100090/,
    );
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
    expect(pickerCodes("no picker here")).toBeNull();
  });

  it("a picker that repeats the caller's 8-digit code lists only the longer ones", async () => {
    fetchRenderedHtml.mockResolvedValue(A2M_PICKER_8);
    const err = await exec()({ hs_code: "87120030", origin_country: "CN", destination_country: "DE" }).catch((e: Error) => e);
    expect(String(err)).toMatch(/codes: 8712003010, 8712003090\.$/);
  });

  it.each([
    [{ hs_code: "847130" }, /origin_country' is required/],
    [{ hs_code: "847130", origin_country: "DE" }, /is an EU member state/],
    [{ hs_code: "847130", origin_country: "CN", destination_country: "US" }, /must be an EU member state/],
    [{ hs_code: "8471", origin_country: "CN" }, /6 to 10 digits/],
    [{ origin_country: "CN" }, /'hs_code' is required/],
  ])("refuses %j before any fetch", async (input, message) => {
    await expect(exec()(input)).rejects.toThrow(message);
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("resultsSection cuts the page at the results and stops before the copyright section", () => {
    const s = resultsSection("nav Results for product code 8471.30 from China to Sweden Tariffs 0% Sources and copyright Mendel");
    expect(s?.resolvedCode).toBe("847130");
    expect(s?.text).not.toMatch(/Mendel/);
    expect(resultsSection("Wrong parameters, country from and country to are mandatory")).toBeNull();
    expect(a2mResultsUrl("847130", "CN", "SE")).toMatch(/^https:\/\/trade\.ec\.europa\.eu\/access-to-markets\/en\/results\?/);
  });
});

describe("container-track", () => {
  const exec = () => getDirectExecutor("container-track")!;
  // Valid ISO 6346 numbers (check digit computed by the executor's own rule).
  const MAERSK = "MAEU1234565";
  const EVERGREEN = "EGLV1234567";

  it("REGRESSION: never fetches maersk.com for a Maersk container", async () => {
    const r = await exec()({ container_number: MAERSK, carrier: "Maersk" });
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
    expect(r.output.status).toBe("tracking_unavailable");
    expect(String(r.output.note)).toMatch(/only for MSC, CMA CGM \(including APL\) and Hapag-Lloyd/);
    // The link is the tracking form robots.txt allows, not the per-container page.
    expect((r.output.tracking_urls as Record<string, string>).maersk).toBe("https://www.maersk.com/tracking/");
  });

  it("REGRESSION: no longer sends other carriers to SeaRates", async () => {
    const r = await exec()({ container_number: EVERGREEN, carrier: "Evergreen" });
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
    expect(r.output.tracking_urls).not.toHaveProperty("searates");
    expect(r.output.tracking_urls).toHaveProperty("track_trace");
  });

  it("still reads live status from a permitted carrier page", async () => {
    fetchRenderedHtml.mockResolvedValue(`<html><body><p>${"Container status Loaded on vessel. ".repeat(20)}</p></body></html>`);
    extractJsonWithLlm.mockResolvedValue({ status: "Loaded on Vessel", events: [] });
    const r = await exec()({ container_number: "MSCU1234565", carrier: "MSC" });
    expect(String(fetchRenderedHtml.mock.calls[0][0])).toMatch(/^https:\/\/www\.msc\.com\/track-a-shipment\?/);
    expect(r.output.status).toBe("Loaded on Vessel");
    expect(r.provenance.source).toBe("carrier-website");
  });
});
