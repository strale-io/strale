import { beforeEach, describe, expect, it, vi } from "vitest";

const { vendorFetch } = vi.hoisted(() => ({ vendorFetch: vi.fn() }));
vi.mock("../metered-vendor-fetch.js", () => ({ meteredVendorFetch: vendorFetch }));
vi.mock("../log.js", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
import "../../capabilities/sanctions-check.js";
import { getDirectExecutor } from "../../capabilities/index.js";
import { runInvoiceCounterpartyCheck } from "./compose.js";
import { DILISENSE_SANCTIONS_LISTS_QUERIED } from "../../capabilities/lib/dilisense-sources.js";

describe("actual sanctions-check adapter contract (network mocked)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DILISENSE_API_KEY", "test-only-dilisense-key"); });
  it.each([
    ["Potential Company Ltd", "Potential Company Ltd"],
    ["شرکت\u200cآزمایشی", "شرکتآزمایشی"],
    ["A &amp; B &#214;y", "A & B Öy"],
  ])("composes the actual executor's SANCTION records and source attribution: %s", async (rawName, cleanedName) => {
    vendorFetch.mockResolvedValue(new Response(JSON.stringify({ found_records: [
      { name: rawName, source_id: "us_ofac_sdn", source_type: "SANCTION", citizenship: ["fi"], sanction_details: ["Recorded source entry"], last_updated: "2026-10-25" },
      { name: "Unrelated Company Ltd", source_id: "pep_source", source_type: "PEP" },
    ] }), { status: 200 }));
    const execute = getDirectExecutor("sanctions-check")!;
    const r = await runInvoiceCounterpartyCheck({ tax_id: "12-3456789", country: "US", company_name: "Invoice Company Ltd" }, {
      getExecutor: slug => slug === "sanctions-check" ? execute : slug === "tax-id-validate"
        ? async () => ({ output: { valid: true, checksum_valid: null }, provenance: { source: "strale-tax-validator", fetched_at: "2026-10-26T12:00:00Z" } }) : undefined,
      isCircuitOpen: async () => false, now: () => new Date("2026-10-26T12:00:00Z"),
    });
    expect(r.output.sanctions).toMatchObject({ status: "completed", potential_match_count: 1, screened_name: "Invoice Company Ltd", name_source: "company_name",
      matches: [{ name: cleanedName, entity_id: "us_ofac_sdn", datasets: ["us_ofac_sdn"], countries: ["fi"], sanction_details: ["Recorded source entry"], last_updated_at: "2026-10-25" }],
      lists_queried: DILISENSE_SANCTIONS_LISTS_QUERIED, source: "dilisense.com" });
    expect(r.output.findings).toContain("Sanctions screening checks found 1 potential matches.");
    expect(vendorFetch).toHaveBeenCalledTimes(1);
    expect(vendorFetch.mock.calls[0][1]).toContain("/v1/checkEntity?names=Invoice+Company+Ltd");
    expect(r.output.sanctions).not.toHaveProperty("score");
    expect(r.output.sanctions).not.toHaveProperty("is_sanctioned");
  });
});
