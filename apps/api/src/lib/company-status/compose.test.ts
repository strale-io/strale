import { describe, expect, it, vi } from "vitest";
import type { CapabilityExecutor, CapabilityResult } from "../../capabilities/index.js";
import { CapabilityRefusalError } from "../capability-refusal.js";
import { runCompanyStatusCheck, weakestSignal, type ComposeDeps } from "./compose.js";
import { COUNTRY_ROUTES, SUPPORTED_COUNTRIES } from "./routing.js";

const NOW = new Date("2026-10-26T10:00:00.000Z");

function ok(output: Record<string, unknown>, extra: Record<string, unknown> = {}): CapabilityResult {
  return {
    output,
    provenance: {
      source: "test-source",
      fetched_at: "2026-10-26T09:59:59.000Z",
      acquisition_method: "direct_api",
      data_access_lane: "preferred",
      ...extra,
    },
  };
}

function deps(table: Record<string, CapabilityExecutor>, open: string[] = []): ComposeDeps & { calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    getExecutor: (slug) => {
      const ex = table[slug];
      return ex ? (async (input) => { calls.push([slug, input]); return ex(input); }) : undefined;
    },
    isCircuitOpen: async (slug) => open.includes(slug),
    now: () => NOW,
  };
}

const run = (d: ComposeDeps, input: Record<string, unknown>) => runCompanyStatusCheck(input, d);

describe("success paths", () => {
  it("SE: an open konkurs sets in_insolvency, read from the same record (no second call)", async () => {
    const d = deps({
      "swedish-company-data": async () =>
        ok({
          company_name: "Spotify AB",
          status: "active",
          ongoing_procedures: [
            { code: "KK", description: "Konkurs", from_date: "2024-01-26" },
            { code: "KK", description: "Konkurs", from_date: "2024-01-26" },
          ],
        }),
    });
    const r = await run(d, { country: "se", identifier: "5567037485" });
    expect(d.calls).toEqual([["swedish-company-data", { org_number: "556703-7485" }]]);
    expect(r.output).toMatchObject({
      status: "in_insolvency", // an open Konkurs overrides verksam = JA ("active")
      registry_status_raw: "active",
      company_name: "Spotify AB",
      registry: { slug: "swedish-company-data" },
      identifier: "556703-7485",
      country: "SE",
      as_of: NOW.toISOString(),
    });
    expect((r.output.insolvency as any).checked).toBe(true);
    expect((r.output.insolvency as any).notices_found).toBe(1); // duplicate listing collapsed
    expect((r.output.insolvency as any).notices[0]).toMatchObject({ date: "2024-01-26", type: "Konkurs" });
  });

  it("GB: registry plus Companies House insolvency, called with the normalised number", async () => {
    const d = deps({
      "uk-company-data": async () => ok({ company_name: "TESCO PLC", status: "active" }),
      "insolvency-check": async () =>
        ok({
          found: undefined,
          has_insolvency_proceedings: true,
          proceedings: [{ type: "creditors-voluntary-liquidation", date_started: "2020-03-01", status: "open" }],
        }),
    });
    const r = await run(d, { country: "UK", identifier: "445790" });
    expect(d.calls[0]).toEqual(["uk-company-data", { company_number: "00445790" }]);
    expect(d.calls[1]).toEqual(["insolvency-check", { country_code: "GB", company_number: "00445790", company_name: "TESCO PLC" }]);
    expect(r.output.country).toBe("GB");
    expect(r.output.insolvency).toMatchObject({
      checked: true,
      notices_found: 1,
      notices: [{ date: "2020-03-01", type: "creditors-voluntary-liquidation", source_url: expect.stringContaining("/company/00445790/insolvency") }],
    });
  });

  it("FR: only collective-proceedings announcements count as notices", async () => {
    const d = deps({
      "french-company-data": async () => ok({ company_name: "TOTAL", status: "closed" }),
      "fr-bodacc-lookup": async () =>
        ok({
          total_announcements: 3,
          announcements: [
            { family: "collective", date: "2023-05-02", url: "https://bodacc/1", family_label: "Procédures collectives", judgment: { nature: "Jugement d'ouverture de liquidation judiciaire" } },
            { family: "modification", date: "2022-01-01", url: "https://bodacc/2" },
            { family: "collective", date: "2023-01-01", url: "https://bodacc/3", family_label: "Procédures collectives", judgment: null },
          ],
        }),
    });
    const r = await run(d, { country: "FR", identifier: "542 051 180" });
    expect(d.calls[1]).toEqual(["fr-bodacc-lookup", { siren: "542051180", limit: 100 }]);
    expect(r.output.status).toBe("inactive");
    expect((r.output.insolvency as any).notices).toEqual([
      { date: "2023-05-02", type: "Jugement d'ouverture de liquidation judiciaire", source_url: "https://bodacc/1" },
      { date: "2023-01-01", type: "Procédures collectives", source_url: "https://bodacc/3" },
    ]);
    expect((r.output.insolvency as any).window_note).toBeUndefined();
  });

  it("FR: says so when the BODACC window was exceeded", async () => {
    const d = deps({
      "french-company-data": async () => ok({ company_name: "X", status: "active" }),
      "fr-bodacc-lookup": async () => ok({ total_announcements: 450, announcements: [] }),
    });
    const r = await run(d, { country: "FR", identifier: "542051180" });
    expect((r.output.insolvency as any).window_note).toMatch(/100 most recent/);
  });

  it("a country with no insolvency source says checked:false with a reason and lists no notices", async () => {
    const d = deps({ "irish-company-data": async () => ok({ company_name: "STRIPE PAYMENTS EUROPE, LIMITED", status: "Normal" }) });
    const r = await run(d, { country: "IE", identifier: "513174" });
    expect(r.output.insolvency).toEqual({ checked: false, reason: "No official insolvency source is connected for IE." });
    expect(d.calls).toHaveLength(1);
  });
});

describe("output fields", () => {
  it("takes the company name from entity_name when a registry executor uses that field (Singapore)", async () => {
    const d = deps({ "singapore-company-data": async () => ok({ entity_name: "SINGAPORE AIRLINES LIMITED", status: "Registered" }) });
    const r = await run(d, { country: "SG", identifier: "197200078r" });
    expect(r.output).toMatchObject({ company_name: "SINGAPORE AIRLINES LIMITED", identifier: "197200078R", status: "active" });
  });

  it("lists a source once when registry and insolvency source share it", async () => {
    const d = deps({
      "uk-company-data": async () => ok({ company_name: "TESCO PLC", status: "active" }, { source: "companieshouse.gov.uk" }),
      "insolvency-check": async () => ok({ proceedings: [] }, { source: "companieshouse.gov.uk" }),
    });
    const r = await run(d, { country: "GB", identifier: "00445790" });
    expect(r.provenance.source).toBe("companieshouse.gov.uk");
  });
});

describe("status handling", () => {
  it("an unmapped registry value is unknown and the raw value is passed through", async () => {
    const d = deps({ "irish-company-data": async () => ok({ company_name: "X LTD", status: "Strike Off Listed" }) });
    const r = await run(d, { country: "IE", identifier: "513174" });
    expect(r.output).toMatchObject({ status: "unknown", registry_status_raw: "Strike Off Listed" });
  });

  it("a registry answer with no status at all is unknown, never active", async () => {
    const d = deps({ "croatian-company-data": async () => ok({ company_name: "X d.o.o." }) });
    const r = await run(d, { country: "HR", identifier: "81793146560" });
    expect(r.output).toMatchObject({ status: "unknown", registry_status_raw: null });
  });

  it("the output carries no verdict or recommendation wording", async () => {
    const d = deps({ "swedish-company-data": async () => ok({ company_name: "X AB", status: "deregistered", ongoing_procedures: [] }) });
    const r = await run(d, { country: "SE", identifier: "5567037485" });
    expect(JSON.stringify(r)).not.toMatch(/\b(safe|pass|passed|risk\w*|recommend\w*|approve\w*|verified|trust\w*)\b/i);
  });
});

describe("failures are structured and never partial", () => {
  it("registry failure: names the registry, returns no status", async () => {
    const d = deps({ "swedish-company-data": async () => { throw new Error("Bolagsverket HVD API returned HTTP 503"); } });
    const err = await run(d, { country: "SE", identifier: "5567037485" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toMatch(/Registry lookup failed for SE: Bolagsverket .* via swedish-company-data did not answer/);
    expect(err.message).toMatch(/No status is returned/);
  });

  it("insolvency failure fails the whole call and names the insolvency source", async () => {
    const d = deps({
      "uk-company-data": async () => ok({ company_name: "X", status: "active" }),
      "insolvency-check": async () => { throw new Error("Companies House error: HTTP 500"); },
    });
    const err = await run(d, { country: "GB", identifier: "00445790" }).catch((e) => e);
    expect(err.message).toMatch(/Insolvency lookup failed for GB: .* via insolvency-check did not answer/);
  });

  it("GB insolvency 'found: false' (company not resolved) is a failure, not an empty notice list", async () => {
    const d = deps({
      "uk-company-data": async () => ok({ company_name: "X", status: "active" }),
      "insolvency-check": async () => ok({ found: false, message: "Company not found in Companies House." }),
    });
    await expect(run(d, { country: "GB", identifier: "00445790" })).rejects.toThrow(/could not resolve company/);
  });

  it("a registry refusal stays a refusal so it does not open the breaker", async () => {
    const d = deps({ "swedish-company-data": async () => { throw new CapabilityRefusalError("No confident match"); } });
    await expect(run(d, { country: "SE", identifier: "5567037485" })).rejects.toBeInstanceOf(CapabilityRefusalError);
  });

  it("an open breaker on a routed registry refuses before any upstream call", async () => {
    const d = deps({ "swedish-company-data": async () => ok({ status: "active" }) }, ["swedish-company-data"]);
    await expect(run(d, { country: "SE", identifier: "5567037485" })).rejects.toThrow(/temporarily suspended/);
    expect(d.calls).toHaveLength(0);
  });

  it("an open breaker on the insolvency source refuses before the registry is called", async () => {
    const d = deps(
      { "uk-company-data": async () => ok({ status: "active" }), "insolvency-check": async () => ok({}) },
      ["insolvency-check"],
    );
    await expect(run(d, { country: "GB", identifier: "00445790" })).rejects.toThrow(/insolvency-check is temporarily suspended/);
    expect(d.calls).toHaveLength(0);
  });

  it("an unregistered executor is an error, not a silent skip", async () => {
    await expect(run(deps({}), { country: "SE", identifier: "5567037485" })).rejects.toThrow(/not registered/);
  });
});

describe("input validation happens before any upstream call", () => {
  const spy = () => vi.fn(async () => ok({ status: "active" }));

  it("unsupported country: a refusal that lists the routing table's countries", async () => {
    const s = spy();
    const d = deps({ "swedish-company-data": s });
    const err = await run(d, { country: "US", identifier: "320193" }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toContain(`Supported: ${SUPPORTED_COUNTRIES.join(", ")}.`);
    expect(s).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "  ", 5])("a missing country (%j) is a refusal listing the supported countries", async (country) => {
    const err = await run(deps({}), { country, identifier: "1" }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toContain(SUPPORTED_COUNTRIES.join(", "));
  });

  it("a Swedish personal identity number is refused (third digit below 2)", async () => {
    const s = spy();
    const err = await run(deps({ "swedish-company-data": s }), { country: "SE", identifier: "800101-1234" }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toMatch(/^'identifier' must be a 10-digit organisationsnummer/);
    expect(s).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   ", 12])("a missing identifier (%j) is refused before any call", async (identifier) => {
    const s = spy();
    const err = await run(deps({ "swedish-company-data": s }), { country: "SE", identifier }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(s).not.toHaveBeenCalled();
  });

  // [iso, valid, expected normalised, invalid] for every routed country: the identifier a name or
  // free text could be mistaken for must not pass, because that is what would reach an executor's
  // LLM-backed name-resolution step.
  const CASES: Array<[string, string, string, string]> = [
    ["AT", "fn 93363z", "FN 93363 z", "Red Bull"],
    ["AU", "51 824 753 556", "51824753556", "5182475355"],
    ["EE", "17449106", "17449106", "1744910"],
    ["FI", "01120389", "0112038-9", "Nokia Oyj"],
    ["FR", "542051180", "542051180", "54205118"],
    ["GB", "SC123456", "SC123456", "Tesco"],
    ["GR", "123456789012", "123456789012", "296601000"],  // a 9-digit value is an AFM (tax ID), refused
    ["HR", "81793146560", "81793146560", "8179314656"],
    ["IE", "513174", "513174", "1234"],
    ["LV", "40003245752", "40003245752", "4000324575"],
    ["SE", "556703-7485", "556703-7485", "55670374"],
    ["SG", "197200078R", "197200078R", "1972"],
  ];

  it("covers every routed country", () => {
    expect(CASES.map((c) => c[0]).sort()).toEqual([...SUPPORTED_COUNTRIES].sort());
  });

  it.each(CASES)("%s: accepts a valid identifier and refuses a malformed one", async (iso, valid, normalised, invalid) => {
    const route = COUNTRY_ROUTES.find((r) => r.iso === iso)!;
    expect(route.normalise_identifier(valid)).toBe(normalised);
    expect(route.normalise_identifier(invalid)).toBeNull();
    const s = spy();
    const err = await run(deps({ [route.registry.slug]: s }), { country: iso, identifier: invalid }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toMatch(/^'identifier' must be /);
    expect(s).not.toHaveBeenCalled();
  });
});

describe("provenance: the composite claims the weakest lane of its inputs", () => {
  const swedish = async () => ok({ company_name: "X", status: "active" });

  it("all preferred: preferred, direct_api, no checks claim, one signal per call", async () => {
    const d = deps({
      "uk-company-data": async () => ok({ company_name: "X", status: "active" }, { source: "companies-house" }),
      "insolvency-check": async () => ok({ proceedings: [] }, { source: "companies-house-insolvency" }),
    });
    const r = await run(d, { country: "GB", identifier: "00445790" });
    expect(r.provenance).toMatchObject({
      acquisition_method: "direct_api",
      data_access_lane: "preferred",
      source: "companies-house; companies-house-insolvency",
      fetched_at: NOW.toISOString(),
    });
    expect(r.provenance.data_access_checks).toBeUndefined();
    expect((r.provenance.signals as any[]).map((s) => [s.role, s.capability_slug, s.data_access_lane])).toEqual([
      ["registry", "uk-company-data", "preferred"],
      ["insolvency", "insolvency-check", "preferred"],
    ]);
  });

  it("a weaker insolvency source lowers the composite: allowed_with_checks, pending, with that signal's method and vendor", async () => {
    const d = deps({
      "french-company-data": async () => ok({ company_name: "X", status: "active" }),
      "fr-bodacc-lookup": async () =>
        ok({ announcements: [] }, { data_access_lane: "allowed_with_checks", data_access_checks: "pending", acquisition_method: "vendor_api", upstream_vendor: "acme" }),
    });
    const r = await run(d, { country: "FR", identifier: "542051180" });
    expect(r.provenance).toMatchObject({
      data_access_lane: "allowed_with_checks",
      data_access_checks: "pending",
      acquisition_method: "vendor_api",
      upstream_vendor: "acme",
    });
  });

  it("recorded checks beat pending checks, and both are weaker than preferred", async () => {
    const mk = (lane: string, checks?: string) => ({ role: "registry" as const, capability_slug: "x", source: null, fetched_at: null, acquisition_method: "direct_api", data_access_lane: lane, data_access_checks: checks ?? null, upstream_vendor: null });
    const pref = mk("preferred");
    const rec = mk("allowed_with_checks", "recorded");
    const pend = mk("allowed_with_checks", "pending");
    expect(weakestSignal([pref, rec, pend])).toBe(pend);
    expect(weakestSignal([pref, rec])).toBe(rec);
    expect(weakestSignal([rec, pref])).toBe(rec);
    expect(weakestSignal([pref, mk("preferred")])).toBe(pref);
  });

  it("a signal with no lane in its provenance is treated as the weakest, never as preferred", async () => {
    const d = deps({
      "swedish-company-data": async () => ({ output: { company_name: "X", status: "active" }, provenance: { source: "s", fetched_at: "2026-10-26T09:00:00Z" } }),
    });
    const r = await run(d, { country: "SE", identifier: "5567037485" });
    expect(r.provenance).toMatchObject({ data_access_lane: "allowed_with_checks", data_access_checks: "pending", acquisition_method: "vendor_aggregation" });
  });

  it("a recorded-checks input yields a recorded claim on the allowed_with_checks lane", async () => {
    const d = deps({
      "swedish-company-data": async () => ok({ company_name: "X", status: "active" }, { data_access_lane: "allowed_with_checks", data_access_checks: "recorded" }),
    });
    const r = await run(d, { country: "SE", identifier: "5567037485" });
    expect(r.provenance).toMatchObject({ data_access_lane: "allowed_with_checks", data_access_checks: "recorded" });
  });

  it("the registry signal wins a tie, so its method is reported", async () => {
    const d = deps({ "swedish-company-data": swedish });
    const r = await run(d, { country: "SE", identifier: "5567037485" });
    expect((r.provenance.signals as any[])).toHaveLength(1);
  });
});
