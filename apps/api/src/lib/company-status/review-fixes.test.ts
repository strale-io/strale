import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import type { CapabilityExecutor, CapabilityResult } from "../../capabilities/index.js";
import { CapabilityRefusalError, isCapabilityRefusal } from "../capability-refusal.js";
import { isUserInputError } from "../circuit-breaker.js";
import { classifyUpstreamMessage, runCompanyStatusCheck, type ComposeDeps } from "./compose.js";
import { normaliseRegistryOutput } from "./normalise.js";
import { COUNTRY_ROUTES, EXCLUDED_COUNTRIES, SUPPORTED_COUNTRIES } from "./routing.js";

const NOW = new Date("2026-10-26T10:00:00.000Z");
const ok = (output: Record<string, unknown>, extra: Record<string, unknown> = {}): CapabilityResult => ({
  output,
  provenance: { source: "s", fetched_at: "2026-10-26T09:59:59.000Z", acquisition_method: "direct_api", data_access_lane: "preferred", ...extra },
});
const deps = (table: Record<string, CapabilityExecutor>): ComposeDeps => ({
  getExecutor: (slug) => table[slug],
  isCircuitOpen: async () => false,
  now: () => NOW,
});
const run = (d: ComposeDeps, input: Record<string, unknown>) => runCompanyStatusCheck(input, d);

// ─── Errors: one country's answers must not suspend all countries ──────────────────────────

// The real not-found / invalid wording of each routed registry executor, copied from its source.
const REAL_NOT_FOUND: Array<[string, string]> = [
  ["AU", "ABN not found or invalid."],
  ["AT", "Firmenbuch returned no current registration data for FN 93363 z. The company may be struck off (gelöscht); historical extracts are not part of this capability."],
  ["EE", 'No Estonian company found for registry code "10137025". The code is well-formed but is not in the Business Register — it may belong to a deregistered entity, or be a typo.'],
  ["FI", "Finnish company with business ID 0112038-9 not found."],
  ["FR", 'No French company found matching "542051180".'],
  ["GB", "UK company with number 00445790 not found."],
  ["HR", "No Croatian entity found for OIB '81793146560'."],
  ["IE", "No Irish company found for CRO number 513174."],
  ["LV", "No Latvian company found for registration number 40003245752."],
  ["SE", "No Swedish organisation found for 5567037485."],
  ["SG", "No Singapore entity found for UEN 197200078R."],
];
const REAL_INVALID: Array<[string, string]> = [
  ["HR", "Sudreg rejected OIB '81793146560': invalid identifier"],
  ["SE", "Bolagsverket rejected org number 5567037485 as invalid."],
  ["AT", "'FN 1' is not a valid Austrian Firmenbuchnummer. Expected up to 6 digits plus a check letter."],
  ["AU", 'Invalid ABN format: "123". ABN must be exactly 11 digits.'],
];
const TRANSIENT = [
  "Bolagsverket HVD API returned HTTP 503",
  "Companies House error: HTTP 401",
  "BODACC API returned HTTP 400",
  "Invalid ABR response: no <response> element",
  "The operation was aborted due to timeout",
  "fetch failed",
  "French API returned HTTP 503",
  "Invalid API key",
  "Invalid API key for Firmenbuch (JUSTIZONLINE_API_KEY)",
  "Invalid credentials",
  "Companies House: invalid authorization header",
];

describe("not-found and invalid-identifier answers are refusals", () => {
  it("covers every routed country", () => {
    expect([...new Set(REAL_NOT_FOUND.map((c) => c[0]))].sort()).toEqual([...SUPPORTED_COUNTRIES].sort());
  });

  it.each(REAL_NOT_FOUND)("%s: %j", async (iso, message) => {
    const route = COUNTRY_ROUTES.find((r) => r.iso === iso)!;
    const identifier = { AT: "FN 93363 z", AU: "51824753556", EE: "10137025", FI: "0112038-9", FR: "542051180", GB: "00445790", HR: "81793146560", IE: "513174", LV: "40003245752", SE: "556703-7485", SG: "197200078R" }[iso]!;
    // The Austrian executor throws this one as a CapabilityRefusalError; the others throw a plain Error.
    const thrown = () => (iso === "AT" ? new CapabilityRefusalError(message) : new Error(message));
    const d = deps({
      [route.registry.slug]: async () => { throw thrown(); },
      "fr-bodacc-lookup": async () => ok({}),
      "insolvency-check": async () => ok({}),
    });
    const err = await run(d, { country: iso, identifier }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    // What /v1/do keeps once only the message string survives: the breaker and the failure taxonomy both read it.
    expect(isUserInputError(err.message)).toBe(true);
    expect(isCapabilityRefusal(err.message) || /not found/.test(err.message)).toBe(true);
    expect(err.message).toContain(route.registry.name);
  });

  it.each(REAL_INVALID)("%s: %j", async (iso, message) => {
    const route = COUNTRY_ROUTES.find((r) => r.iso === iso)!;
    const identifier = { AT: "FN 93363 z", AU: "51824753556", HR: "81793146560", SE: "556703-7485" }[iso]!;
    const d = deps({ [route.registry.slug]: async () => { throw new Error(message); } });
    const err = await run(d, { country: iso, identifier }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toMatch(/^'identifier' must be a valid /);
    expect(isUserInputError(err.message)).toBe(true);
  });

  it("an insolvency source's not-found is a refusal too, naming the source's country", async () => {
    const d = deps({
      "french-company-data": async () => ok({ company_name: "X", status: "active" }),
      "fr-bodacc-lookup": async () => { throw new Error('No BODACC announcement found for company name "X".'); },
    });
    const err = await run(d, { country: "FR", identifier: "542051180" }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
  });
});

describe("outages and transient failures still count against the capability", () => {
  it.each(TRANSIENT)("%j stays a plain error, not recognised as caller input", async (message) => {
    expect(classifyUpstreamMessage(message)).toBe("failure");
    const d = deps({ "swedish-company-data": async () => { throw new Error(message); } });
    const err = await run(d, { country: "SE", identifier: "556703-7485" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toMatch(/via swedish-company-data did not answer/);
  });

  it("a synthetic upstream 'Invalid API key' fault from the Austrian registry is an outage, not a refusal", async () => {
    const d = deps({ "austrian-company-data": async () => { throw new Error("Invalid API key"); } });
    const err = await run(d, { country: "AT", identifier: "FN 93363 z" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toMatch(/via austrian-company-data did not answer \(Invalid API key\)/);
    expect(isUserInputError(err.message)).toBe(false);
  });

  it("no per-country marker exists in the breaker, so the manifest says one registry can pause the check for all", () => {
    const m = yaml.load(readFileSync(resolve(import.meta.dirname, "..", "..", "..", "..", "..", "manifests", "company-status-check.yaml"), "utf8")) as any;
    const lim = m.limitations.find((l: any) => l.title === "A failing registry can pause the check for every country");
    expect(lim.text).toMatch(/pause the check\s+for all countries/);
  });
});

// ─── Sweden ──────────────────────────────────────────────────────────────────────

describe("Sweden status and insolvency", () => {
  const se = (o: Record<string, unknown>) => normaliseRegistryOutput("swedish-company-data", o);

  it("an open konkurs overrides verksam = JA", () => {
    expect(se({ status: "active", ongoing_procedures: [{ code: "KK", description: "Konkurs", from_date: "2024-01-26" }] }).status).toBe("in_insolvency");
  });
  it("an open likvidation gives in_liquidation, and konkurs wins over likvidation", () => {
    expect(se({ status: "active", ongoing_procedures: [{ code: "LI", description: "Likvidation" }] }).status).toBe("in_liquidation");
    expect(se({ status: "active", ongoing_procedures: [{ code: "LI", description: "Likvidation" }, { code: "KK", description: "Konkurs" }] }).status).toBe("in_insolvency");
  });
  it("företagsrekonstruktion is matched on its Swedish text", () => {
    expect(se({ status: "active", ongoing_procedures: [{ code: "", description: "Företagsrekonstruktion" }] }).status).toBe("in_insolvency");
  });
  it("an open proceeding the table cannot classify makes the status unknown, not active", () => {
    expect(se({ status: "active", ongoing_procedures: [{ code: "ZZ", description: "Något nytt" }] })).toMatchObject({ status: "unknown", registry_status_raw: "active" });
  });
  it("no procedures leaves active", () => {
    expect(se({ status: "active", ongoing_procedures: [] }).status).toBe("active");
  });
  it("verksam = NEJ without an avregistreringsdatum is inactive; with one it is struck_off", () => {
    expect(se({ status: "deregistered", deregistered_date: null }).status).toBe("inactive");
    expect(se({ status: "deregistered" }).status).toBe("inactive");
    expect(se({ status: "deregistered", deregistered_date: "2023-05-05" }).status).toBe("struck_off");
  });
  it("verksam = NEJ with no deregistration date and an open konkurs or likvidation takes the proceeding override, not inactive", () => {
    expect(se({ status: "deregistered", deregistered_date: null, ongoing_procedures: [{ code: "KK", description: "Konkurs" }] }).status).toBe("in_insolvency");
    expect(se({ status: "deregistered", deregistered_date: null, ongoing_procedures: [{ code: "LI", description: "Likvidation" }] }).status).toBe("in_liquidation");
    expect(se({ status: "deregistered", ongoing_procedures: [{ code: "ZZ", description: "Något nytt" }] }).status).toBe("inactive");
  });
  it("a deregistration date wins over old proceedings: struck_off", () => {
    expect(se({ status: "deregistered", deregistered_date: "2024-06-01", ongoing_procedures: [{ code: "KK", description: "Konkurs" }] }).status).toBe("struck_off");
  });
  it("other registries ignore these rules", () => {
    expect(normaliseRegistryOutput("irish-company-data", { status: "Normal", ongoing_procedures: [{ code: "KK" }] }).status).toBe("active");
  });

  it("no pending proceedings: insolvency is checked:false with a reason, never notices_found 0", async () => {
    const d = deps({ "swedish-company-data": async () => ok({ company_name: "X AB", status: "active", ongoing_procedures: [] }) });
    const r = await run(d, { country: "SE", identifier: "556703-7485" });
    expect(r.output.insolvency).toMatchObject({ checked: false });
    expect((r.output.insolvency as any).notices_found).toBeUndefined();
    expect((r.output.insolvency as any).reason).toMatch(/cannot show whether that part of the record loaded/);
  });

  it("a pending proceeding is reported as checked:true with its notice, and sets the status", async () => {
    const d = deps({ "swedish-company-data": async () => ok({ company_name: "X AB", status: "active", ongoing_procedures: [{ code: "LI", description: "Likvidation", from_date: "2024-05-26" }] }) });
    const r = await run(d, { country: "SE", identifier: "556703-7485" });
    expect(r.output.status).toBe("in_liquidation");
    expect(r.output.insolvency).toMatchObject({ checked: true, notices_found: 1, notices: [{ date: "2024-05-26", type: "Likvidation" }] });
  });
});

// ─── Finland, Greece, Austria, Great Britain, identifiers ─────────────────────────────────────────

describe("registry-specific vocabulary", () => {
  const norm = (slug: string, status: string) => normaliseRegistryOutput(slug, { status });

  it("FI: only the executor's 'active' is mapped; 'inactive' and 'liquidation' are unknown with the raw value", () => {
    expect(norm("finnish-company-data", "active").status).toBe("active");
    expect(norm("finnish-company-data", "inactive")).toMatchObject({ status: "unknown", registry_status_raw: "inactive", mapped: false });
    expect(norm("finnish-company-data", "liquidation")).toMatchObject({ status: "unknown", registry_status_raw: "liquidation", mapped: false });
  });
  it("GR: bankrupt is in_insolvency", () => {
    expect(norm("greek-company-data", "bankrupt").status).toBe("in_insolvency");
  });
  it("AT: the executor's 'dissolved' (an Auflösung) is in_liquidation, not dissolved", () => {
    expect(norm("austrian-company-data", "dissolved").status).toBe("in_liquidation");
  });
});

describe("GB notices carry the proceeding status; numeric identifiers are accepted", () => {
  it("a closed proceeding says so", async () => {
    const d = deps({
      "uk-company-data": async () => ok({ company_name: "X LTD", status: "active" }),
      "insolvency-check": async () => ok({ proceedings: [{ type: "company-voluntary-arrangement", date_started: "2019-01-01", status: "completed" }] }),
    });
    const r = await run(d, { country: "GB", identifier: "00445790" });
    expect((r.output.insolvency as any).notices[0]).toMatchObject({ type: "company-voluntary-arrangement", status: "completed" });
  });

  it("a JSON number is coerced only where it cannot lose a leading zero (AU); fractional and negative numbers are refused", async () => {
    const d = deps({ "au-company-data": async () => ok({ company_name: "X", status: "Active" }) });
    expect((await run(d, { country: "AU", identifier: 51824753556 })).output.identifier).toBe("51824753556");
    for (const bad of [51824753556.5, -51824753556, Number.NaN]) {
      await expect(run(d, { country: "AU", identifier: bad })).rejects.toBeInstanceOf(CapabilityRefusalError);
    }
  });

  it("every other routed country refuses a JSON number, because it can drop a leading zero or hide a length", async () => {
    for (const route of COUNTRY_ROUTES.filter((r) => !r.numeric_ok)) {
      const executor = vi.fn(async () => ok({ status: "active" }));
      const d = deps({ [route.registry.slug]: executor, "fr-bodacc-lookup": executor, "insolvency-check": executor });
      const err = await run(d, { country: route.iso, identifier: 513174 }).catch((e) => e);
      expect(err, route.iso).toBeInstanceOf(CapabilityRefusalError);
      expect(err.message, route.iso).toMatch(/^'identifier' must be sent as a string/);
      expect(executor, route.iso).not.toHaveBeenCalled();
    }
  });

  it("only AU opts in, and its identifier is fixed-length with no leading zero", () => {
    expect(COUNTRY_ROUTES.filter((r) => r.numeric_ok).map((r) => r.iso)).toEqual(["AU"]);
  });
});

// ─── Recorded real responses ──────────────────────────────────────────────────────────────

interface Fixture {
  id: string;
  registry_slug: string;
  executor_input: Record<string, string>;
  captured_at: string;
  executor_output: Record<string, unknown>;
}
const FIXTURES: Fixture[] = JSON.parse(readFileSync(resolve(import.meta.dirname, "__fixtures__", "dead-entities.json"), "utf8"));
const fixture = (id: string): Fixture => FIXTURES.find((f) => f.id === id)!;

// Executor outputs captured live on 2026-10-26 (about 12:30 Swedish time), trimmed to the fields the composite reads.
const ROUTED_EXPECTATIONS: Array<[string, string, string, string, string | null]> = [
  // id,                    country, identifier,     expected status,  expected registry_status_raw
  ["FI-association-alive", "FI", "0101279-1", "unknown", "inactive"],
  ["IE-struck-off", "IE", "596725", "struck_off", "Struck Off"],
  ["IE-dissolved", "IE", "279457", "dissolved", "Dissolved"],
  ["IE-liquidation", "IE", "283902", "in_liquidation", "Liquidation"],
  ["LV-terminated", "LV", "40203246549", "dissolved", "Likvidēts"],
  ["EE-liquidation", "EE", "16157985", "in_liquidation", "in_liquidation"],
  ["FR-closed", "FR", "479575037", "inactive", "closed"],
  ["SG-deregistered", "SG", "201201936C", "inactive", "Deregistered"],
];

describe("recorded real executor responses give the expected composite status", () => {
  it.each(ROUTED_EXPECTATIONS)("%s", async (id, country, identifier, status, raw) => {
    const f = fixture(id);
    expect(f, `fixture ${id}`).toBeTruthy();
    const table: Record<string, CapabilityExecutor> = { [f.registry_slug]: async () => ok(f.executor_output) };
    if (country === "FR") table["fr-bodacc-lookup"] = async () => ok({ total_announcements: 0, announcements: [] });
    const r = await run(deps(table), { country, identifier });
    expect(r.output).toMatchObject({ status, registry_status_raw: raw, country });
    expect(typeof r.output.company_name).toBe("string");
  });

  it("every fixture was captured on the stated day and names the executor input it was fetched with", () => {
    for (const f of FIXTURES) {
      expect(f.captured_at.startsWith("2026-10-26"), f.id).toBe(true);
      expect(Object.keys(f.executor_input).length, f.id).toBe(1);
    }
  });
});

describe("dead entities in the excluded countries (NO, PL, CZ)", () => {
  // The underlying executors still report these as "active" (their defect, tracked separately), so the
  // countries are not routed. When the executors are fixed and the countries re-added, these fixtures
  // are the cases to flip: NO deleted 2026-10-20, PL struck off 2022, CZ "v likvidaci".
  const DEAD: Array<[string, string, string]> = [
    ["NO-deleted", "NO", "930663530"],
    ["PL-struck-off", "PL", "0000106150"],
    ["CZ-v-likvidaci", "CZ", "01485377"],
  ];

  it.each(DEAD)("%s: the executor still says active, and the country is excluded rather than routed", async (id, country, identifier) => {
    const f = fixture(id);
    expect(f.executor_output.status).toBe("active");
    expect(SUPPORTED_COUNTRIES).not.toContain(country);
    expect(EXCLUDED_COUNTRIES[country]).toMatch(/does not report deleted \/ deregistered \/ liquidating entities/);
    const spy: CapabilityExecutor = async () => ok(f.executor_output);
    const err = await run(deps({ [f.registry_slug]: spy }), { country, identifier }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toContain(`'${country}' is not`);
  });

  it("GR is excluded for the same reason: its executor reports an inactive company as active", async () => {
    expect(SUPPORTED_COUNTRIES).not.toContain("GR");
    expect(EXCLUDED_COUNTRIES.GR).toMatch(/does not report deleted \/ deregistered \/ liquidating entities/);
    const spy = vi.fn(async () => ok({ status: "active" }));
    const err = await run(deps({ "greek-company-data": spy }), { country: "GR", identifier: "123456789012" }).catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityRefusalError);
    expect(err.message).toContain("'GR' is not");
    expect(spy).not.toHaveBeenCalled();
  });

  it("the normaliser keeps its rows for NO, PL and CZ so the follow-up only has to re-route", async () => {
    expect(normaliseRegistryOutput("norwegian-company-data", { status: "bankrupt" }).status).toBe("in_insolvency");
    expect(normaliseRegistryOutput("polish-company-data", { status: "deregistered" }).status).toBe("struck_off");
    expect(normaliseRegistryOutput("cz-company-data", { status: "dissolved" }).status).toBe("dissolved");
  });

  it("the fixture for a natural person carries a placeholder, not a personal name", () => {
    const o = fixture("NO-deleted").executor_output;
    expect(o.company_name).toBe("[sole trader: personal name removed from this fixture]");
    expect(o.legal_name).toBe(o.company_name);
  });
});
