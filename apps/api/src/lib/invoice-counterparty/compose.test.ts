import { describe, expect, it, vi } from "vitest";
import type { CapabilityInput, CapabilityResult } from "../../capabilities/index.js";
import type { ComposeDeps } from "../company-status/compose.js";
import { runInvoiceCounterpartyCheck } from "./compose.js";
import { InvoiceCheckError, parseInvoiceInput, registryIdFromTaxId } from "./input.js";
import { compareCompanyNames, normaliseCompanyName, decodeViesText } from "./name.js";
import { DILISENSE_SANCTIONS_LISTS_QUERIED } from "../../capabilities/lib/dilisense-sources.js";

const AT = "2026-10-26T12:00:00.000Z";
const input = { tax_id: "FI01120389", company_name: "Nokia Oyj" };
const ok = (output: Record<string, unknown>, source = "official", extra = {}): CapabilityResult => ({ output,
  provenance: { source, fetched_at: AT, acquisition_method: "direct_api", data_access_lane: "preferred", ...extra } });
const tax = () => ok({ valid: true, company_name: "Nokia Oyj", company_address: "Karakaari 7, Espoo", request_date: "2026-10-26+02:00" }, "VIES");
const registry = () => ok({ status: "active", registry_status_raw: "registered", company_name: "Nokia Oyj",
  registry: { name: "PRH", slug: "finnish-company-data" }, identifier: "0112038-9", country: "FI",
  insolvency: { checked: false, reason: "No official insolvency source connected for FI." }, as_of: AT }, "PRH");
// Recorded executor output shape: sanctions-check.ts return block and
// manifests/sanctions-check.yaml example; it exposes NO match scores.
const sanctions = () => ok({ query: "Nokia Oyj", schema: "Company", country_filter: "FI", birth_date_filter: null,
  is_sanctioned: false, match_count: 0, total_results: 0, matches: [],
  lists_queried: DILISENSE_SANCTIONS_LISTS_QUERIED, source: "dilisense", queried_at: AT }, "dilisense.com",
  { acquisition_method: "vendor_api", data_access_lane: "allowed_with_checks", data_access_checks: "pending", upstream_vendor: "dilisense" });
function harness() {
  const table = {
    "vat-validate": vi.fn(async (_i: CapabilityInput) => tax()),
    "tax-id-validate": vi.fn(async (_i: CapabilityInput) => ok({ valid: true, checksum_valid: null }, "strale-tax-validator")),
    "company-status-check": vi.fn(async (_i: CapabilityInput) => registry()),
    "sanctions-check": vi.fn(async (_i: CapabilityInput) => sanctions()),
  };
  const getExecutor = vi.fn((slug: string) => table[slug as keyof typeof table]);
  const isCircuitOpen = vi.fn(async (_s: string) => false);
  const deps: ComposeDeps = { getExecutor, isCircuitOpen, now: () => new Date(AT) };
  return { table, getExecutor, isCircuitOpen, run: (i = input as CapabilityInput) => runInvoiceCounterpartyCheck(i, deps) };
}

describe("invoice counterparty evidence and charging", () => {
  it("completes all checks, passes registry/insolvency evidence, and keeps weakest provenance", async () => {
    const h = harness();
    const r = await h.run();
    expect(h.table["vat-validate"]).toHaveBeenCalledWith({ vat_number: "FI01120389" });
    expect(h.table["company-status-check"]).toHaveBeenCalledWith({ country: "FI", identifier: "0112038-9" });
    expect(h.table["sanctions-check"]).toHaveBeenCalledWith({ name: "Nokia Oyj", country: "FI", entity_type: "company" });
    expect(r.output).toMatchObject({
      tax_id: { status: "completed", valid: true, verification: "vies", source: "VIES", registered_name: "Nokia Oyj", registered_address: "Karakaari 7, Espoo", checked_at: AT },
      registry_status: { status: "completed", company_status: "active", registry_status_raw: "registered", source: "PRH", insolvency: registry().output.insolvency, identifier_source: "tax_id_mapping" },
      sanctions: { status: "completed", potential_match_count: 0, name_source: "registry_status", screened_name: "Nokia Oyj", checked_at: AT, lists_queried: DILISENSE_SANCTIONS_LISTS_QUERIED },
      name_match: { status: "completed", match: "exact", invoice_name: "Nokia Oyj", registered_name: "Nokia Oyj" },
      checks_completed: ["tax_id", "registry_status", "sanctions", "name_match"], checks_not_available: [],
    });
    expect(r.output.findings).toEqual(["VIES reports the VAT number as valid.", "The registry reports the company status as active.", "Sanctions screening checks found 0 potential matches."]);
    expect(r.provenance).toMatchObject({ fetched_at: AT, data_access_lane: "allowed_with_checks", data_access_checks: "pending", acquisition_method: "vendor_api", upstream_vendor: "dilisense" });
    expect(r.provenance.signals).toHaveLength(3);
    expect(h.isCircuitOpen.mock.calls.map(([slug]) => slug)).toEqual(["vat-validate", "company-status-check", "sanctions-check"]);
  });

  it("invalid VAT is a completed, billable check; its name is not used", async () => {
    const h = harness();
    h.table["vat-validate"].mockResolvedValue(ok({ valid: false, company_name: "Ignored invalid name" }));
    const r = await h.run();
    expect(r.output.tax_id).toMatchObject({ status: "completed", valid: false });
    expect(r.output.tax_id).not.toHaveProperty("registered_name");
    expect(r.output.findings).toContain("VIES reports the VAT number as not valid.");
    expect(h.table["sanctions-check"]).toHaveBeenCalledWith(expect.objectContaining({ name: "Nokia Oyj" }));
  });

  it.each(["vat-validate", "sanctions-check"] as const)("throws structured unbilled error when %s throws, sanitizing details", async slug => {
    const h = harness();
    h.table[slug].mockRejectedValue(new Error("<html>SECRET stack trace</html>"));
    const error = await h.run().catch(e => e);
    expect(error).toBeInstanceOf(InvoiceCheckError);
    expect(error.error_code).toBe("execution_failed");
    expect(error.details.checks[slug === "vat-validate" ? "tax_id" : "sanctions"]).toMatchObject({ status: "error", reason: expect.any(String), source: slug });
    expect(JSON.stringify(error)).not.toMatch(/SECRET|<html>|stack trace/);
    if (slug === "vat-validate") expect(h.table["sanctions-check"]).not.toHaveBeenCalled();
  });

  it.each(["vat-validate", "sanctions-check"])("an open %s breaker refuses the required check without calling it", async slug => {
    const h = harness();
    h.isCircuitOpen.mockImplementation(async s => s === slug);
    const e = await h.run().catch(e => e);
    expect(e.error_code).toBe("execution_failed");
    expect(e.details.checks[slug === "vat-validate" ? "tax_id" : "sanctions"]).toMatchObject({ status: "not_available", reason: expect.stringContaining("breaker") });
    expect(h.table[slug as keyof typeof h.table]).not.toHaveBeenCalled();
  });

  it.each(["vat-validate", "sanctions-check"])("missing %s executor is not_available and unbilled", async slug => {
    const h = harness();
    const original = h.getExecutor.getMockImplementation()!;
    h.getExecutor.mockImplementation(s => s === slug ? undefined! : original(s));
    const e = await h.run().catch(e => e);
    expect(e).toBeInstanceOf(InvoiceCheckError);
    expect(e.details.checks[slug === "vat-validate" ? "tax_id" : "sanctions"].status).toBe("not_available");
  });

  it.each([{}, { valid: "false" }, { valid: true, stale: true }, { valid: false, error: "Country unsupported" }])("rejects malformed/stale tax evidence %j before screening", async output => {
    const h = harness(); h.table["vat-validate"].mockResolvedValue(ok(output));
    const e = await h.run().catch(e => e);
    expect(e.details.checks.tax_id.status).toBe("error");
    expect(h.table["sanctions-check"]).not.toHaveBeenCalled();
  });

  it.each([{}, { match_count: -1, matches: [] }, { match_count: 1, matches: [] }, { match_count: 0, matches: undefined },
    { match_count: 1, matches: [{ name: "Company", datasets: [] }] }])("rejects missing/inconsistent screening evidence %j", async output => {
    const h = harness(); h.table["sanctions-check"].mockResolvedValue(ok({ ...sanctions().output, ...output, ...(Object.keys(output).length ? {} : { lists_queried: undefined }) }));
    const e = await h.run().catch(e => e);
    expect(e).toBeInstanceOf(InvoiceCheckError);
    expect(e.details.checks.sanctions.status).toBe("error");
  });

  it("retains potential-match names and lists without asserting sanction status or fabricating scores", async () => {
    const h = harness();
    const m = { name: "Potential Company", entity_id: "us_ofac_sdn", datasets: ["us_ofac_sdn"], countries: ["fi"], sanction_details: ["Source entry"], last_updated_at: null };
    h.table["sanctions-check"].mockResolvedValue(ok({ ...sanctions().output, is_sanctioned: true, match_count: 2, matches: [m, { ...m, entity_id: "eu_fsf", datasets: ["eu_fsf"] }] }));
    const r = await h.run();
    expect(r.output.sanctions).toMatchObject({ potential_match_count: 2, matches: [m, { ...m, entity_id: "eu_fsf", datasets: ["eu_fsf"] }], matches_truncated: false });
    expect(r.output.findings).toContain("Sanctions screening checks found 2 potential matches.");
    expect(JSON.stringify(r.output)).not.toMatch(/is_sanctioned|score/);
  });

  it("discloses the sanctions executor's ten-match cap", async () => {
    const h = harness();
    h.table["sanctions-check"].mockResolvedValue(ok({ ...sanctions().output, match_count: 14,
      matches: Array.from({ length: 10 }, () => ({ name: "Potential Company", datasets: ["us_ofac_sdn"] })) }));
    expect((await h.run()).output.sanctions).toMatchObject({ potential_match_count: 14, matches_truncated: true });
  });

  it.each(["not_available", "error", "malformed", "missing"])("registry %s still permits success with a reason", async state => {
    const h = harness();
    if (state === "not_available") h.isCircuitOpen.mockImplementation(async s => s === "company-status-check");
    if (state === "error") h.table["company-status-check"].mockRejectedValue(new Error("<html>down</html>"));
    if (state === "malformed") h.table["company-status-check"].mockResolvedValue(ok({}));
    if (state === "missing") { const original = h.getExecutor.getMockImplementation()!; h.getExecutor.mockImplementation(s => s === "company-status-check" ? undefined! : original(s)); }
    const r = await h.run();
    expect(r.output.registry_status).toMatchObject({ status: state === "error" || state === "malformed" ? "error" : "not_available", reason: expect.any(String), source: expect.any(String) });
    expect(r.output.checks_completed).toContain("sanctions");
    expect((r.output.sanctions as any).name_source).toBe("tax_id");
    if (state === "not_available") expect(h.table["company-status-check"]).not.toHaveBeenCalled();
  });

  it.each(["inactive", "dissolved", "in_liquidation", "in_insolvency", "struck_off", "unknown"])("passes through registry %s and insolvency notices", async status => {
    const h = harness();
    const insolvency = { checked: true, source: "Official register", notices_found: 1, notices: [{ type: "bankruptcy", date: "2026-01-01", source_url: "https://example.org/notice" }] };
    h.table["company-status-check"].mockResolvedValue(ok({ ...registry().output, status, insolvency }));
    const r = await h.run();
    expect(r.output.registry_status).toMatchObject({ company_status: status, insolvency });
    expect(r.output.findings).toContain(`The registry reports the company status as ${status.replace(/_/g, " ")}.`);
  });

  it("an explicit company_id takes precedence and is validated/normalized", async () => {
    const h = harness(); await h.run({ ...input, company_id: "1234567-1" });
    expect(h.table["company-status-check"]).toHaveBeenCalledWith({ country: "FI", identifier: "1234567-1" });
  });

  it.each(["NL859016943B01", "DK24256790", "BE0403199702", "DE129274202"])("does not guess registry or use name-based entity-resolve for %s", async tax_id => {
    const h = harness(); const r = await h.run({ tax_id });
    expect(r.output.registry_status).toMatchObject({ status: "not_available", reason: expect.any(String) });
    expect(r.output.checks_not_available).toContain("registry_status");
    expect(h.table["company-status-check"]).not.toHaveBeenCalled();
    expect(h.getExecutor).not.toHaveBeenCalledWith("entity-resolve");
  });

  it("non-EU tax checks are explicitly format-only and cannot provide a registered name", async () => {
    const h = harness();
    const r = await h.run({ tax_id: "12-3456789", country: "US", company_name: "Invoice Company Ltd" });
    expect(h.table["vat-validate"]).not.toHaveBeenCalled();
    expect(h.table["tax-id-validate"]).toHaveBeenCalledWith({ tax_id: "12-3456789", country_code: "US" });
    expect(r.output.tax_id).toMatchObject({ verification: "format_only", valid: true, source: "strale-tax-validator" });
    expect(r.output.name_match).toMatchObject({ status: "not_available", reason: expect.any(String) });
    expect(r.output.checks_not_available).toContain("name_match");
    expect(r.output.findings).toContain("The tax ID matches the supported format; this is a format-only check, not registry confirmation.");
  });

  it("format-only valid false remains a completed check", async () => {
    const h = harness(); h.table["tax-id-validate"].mockResolvedValue(ok({ valid: false }));
    expect((await h.run({ tax_id: "12-3456789", country: "US", company_name: "Invoice Ltd" })).output.tax_id).toMatchObject({ status: "completed", valid: false, verification: "format_only" });
  });

  it.each(["registry_status", "tax_id", "company_name"])("screens from %s in source priority order", async source => {
    const h = harness();
    h.table["company-status-check"].mockResolvedValue(ok({ ...registry().output, company_name: source === "registry_status" ? "Registry Name Oy" : null }));
    h.table["vat-validate"].mockResolvedValue(ok({ ...tax().output, company_name: source === "company_name" ? "---" : "VIES Name Oy" }));
    const r = await h.run({ ...input, company_name: "Invoice Name Oy" });
    const expected = { registry_status: "Registry Name Oy", tax_id: "VIES Name Oy", company_name: "Invoice Name Oy" }[source];
    expect(h.table["sanctions-check"]).toHaveBeenCalledWith({ name: expected, entity_type: "company", country: "FI" });
    expect(r.output.sanctions).toMatchObject({ screened_name: expected, name_source: source });
  });

  it("decodes the actual VIES XML encoding before screening and comparing names", async () => {
    const h = harness();
    h.table["company-status-check"].mockRejectedValue(new Error("registry down"));
    h.table["vat-validate"].mockResolvedValue(ok({ valid: true, company_name: "H &amp; M Hennes &amp; Mauritz AB", company_address: "A &amp; B" }));
    const r = await h.run({ tax_id: "SE556042722001", company_name: "H & M Hennes & Mauritz AB" });
    expect(r.output.name_match).toMatchObject({ match: "exact", registered_name: "H & M Hennes & Mauritz AB" });
    expect(r.output.tax_id).toMatchObject({ registered_address: "A & B" });
    expect(h.table["sanctions-check"]).toHaveBeenCalledWith(expect.objectContaining({ name: "H & M Hennes & Mauritz AB" }));
  });

  it("missing all usable names refuses sanctions without paying for a call", async () => {
    const h = harness(); h.table["company-status-check"].mockResolvedValue(ok({ ...registry().output, company_name: null }));
    h.table["vat-validate"].mockResolvedValue(ok({ valid: false, company_name: "---" }));
    const e = await h.run({ tax_id: input.tax_id }).catch(e => e);
    expect(e.details.checks.sanctions).toMatchObject({ status: "not_available", reason: expect.stringContaining("company_name") });
    expect(h.table["sanctions-check"]).not.toHaveBeenCalled();
  });

  it("name_match is omitted unless requested, and different produces a factual finding", async () => {
    const h = harness();
    expect((await h.run({ tax_id: input.tax_id })).output).not.toHaveProperty("name_match");
    const r = await h.run({ ...input, company_name: "Different Supplier" });
    expect(r.output.name_match).toMatchObject({ match: "different", invoice_name: "Different Supplier", registered_name: "Nokia Oyj" });
    expect(r.output.findings).toContain("The name on the invoice differs from the registered name.");
  });

  it("never emits verdict/recommendation/risk/score keys anywhere", async () => {
    const r = await harness().run();
    const forbidden = new Set(["verdict", "overall_verdict", "pass", "review", "fail", "risk", "risk_level", "risk_score", "score", "overall_score", "recommendation", "safe_to_pay", "is_sanctioned"]);
    function walk(v: unknown): void {
      if (v && typeof v === "object") for (const [key, value] of Object.entries(v)) { expect(forbidden.has(key), key).toBe(false); walk(value); }
    }
    walk(r);
  });
});

describe("input validation before any executor", () => {
  it.each([{}, { tax_id: null }, { tax_id: 123 }, { tax_id: "" }, { tax_id: "x" }, { tax_id: "<html/>" },
    { tax_id: "01120389" }, { ...input, country: "SE" }, { ...input, country: "ZZ" }, { ...input, country: "UK" }, { ...input, country: "FIN" },
    { tax_id: "SE556703748502" }, { tax_id: "FI123" }, { ...input, company_id: "Nokia" }, { ...input, company_id: 123 },
    { ...input, company_name: "x" }, { ...input, company_name: null }, { ...input, company_name: "---" }, { ...input, company_name: "Hidden\nName" },
    { tax_id: "123456", country: "RU" }, { ...input, company_id: "123<script>" }])("rejects %j without looking up or calling executors", async bad => {
    const h = harness(); const e = await h.run(bad).catch(e => e);
    expect(e).toBeInstanceOf(InvoiceCheckError); expect(e.error_code).toBe("invalid_request");
    expect(e.details.field).toBeTypeOf("string"); expect(h.getExecutor).not.toHaveBeenCalled();
    expect(h.isCircuitOpen).not.toHaveBeenCalled();
  });
  it.each([
    [{ tax_id: "fi 01120389" }, "FI01120389", "FI", true],
    [{ tax_id: "0112038-9", country: "FI" }, "FI01120389", "FI", true],
    [{ tax_id: "DK24256790" }, "DK24256790", "DK", true],
    [{ tax_id: "24256790", country: "DK" }, "DK24256790", "DK", true],
    [{ tax_id: "EL094014201" }, "EL094014201", "GR", true],
    [{ tax_id: "FRAB123456789" }, "FRAB123456789", "FR", true],
    [{ tax_id: "CAU920101123", country: "MX" }, "CAU920101123", "MX", false],
    [{ tax_id: "NO923609016MVA" }, "NO923609016MVA", "NO", false],
    [{ tax_id: "CHE-116.281.710 MWST" }, "CHE-116.281.710MWST", "CH", false],
  ])("parses supported identifiers %j", (raw, taxId, country, euVat) => {
    expect(parseInvoiceInput(raw as CapabilityInput)).toMatchObject({ taxId, country, euVat });
  });
});

describe("documented VAT mappings, real company numbers", () => {
  it.each([
    ["SE556703748501", "556703-7485"], // Spotify AB
    ["SE556042722001", "556042-7220"], // H & M Hennes & Mauritz AB
    ["FI01120389", "0112038-9"], // Nokia Oyj
    ["NO923609016MVA", "923609016"], // Equinor ASA
    ["BE0403199702", "0403199702"], // BNP Paribas Fortis SA/NV
  ])("%s maps exactly to %s", (vat, identifier) => expect(registryIdFromTaxId(vat)).toBe(identifier));
  it.each(["NL859016943B01", "DK24256790", "SE900101000001", "SE556703748502", "DE129274202"])("%s has no supported deterministic company mapping", vat => {
    expect(registryIdFromTaxId(vat)).toBeUndefined();
  });
});

describe("deterministic name comparison", () => {
  it("decodes XML named/numeric entities without recursive HTML interpretation", () => {
    expect(decodeViesText("A &amp; B &quot;C&quot; &apos;D&apos; &#214; &#xD6; &lt;E&gt; &amp;amp; &#x110000;")).toBe('A & B "C" \'D\' Ö Ö <E> &amp; &#x110000;');
  });
  it.each([
    ["Nokia Oyj", "Nokia Oyj", "exact"], ["NÓKIA OYJ", "Nokia Oy", "equivalent"], ["Acme AB", "ACME GmbH", "equivalent"],
    ["Acme Ltd.", "Acme SA", "equivalent"], ["Acme B.V.", "Acme BV", "equivalent"], ["Acme A/S", "Acme ApS", "equivalent"],
    ["Acme, Oy", "Acme", "equivalent"], ["Straße AG", "STRASSE", "equivalent"], ["Øresund AB", "Oresund", "equivalent"],
    ["Different AB", "Acme AB", "different"], ["AB Acme", "Acme", "different"], ["SA", "AB", "different"],
  ])("%s versus %s is %s", (a, b, expected) => expect(compareCompanyNames(a, b)).toBe(expected));
  it("strips only suffixes, retaining internal names and digits", () => {
    expect(normaliseCompanyName("AB Acme 123 GmbH & Co Ltd.")).toBe("ab acme 123 gmbh co");
  });
});
