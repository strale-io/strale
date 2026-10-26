import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./norwegian-company-data.js";
import "./no-bankruptcy-check.js";
import "./polish-company-data.js";
import "./cz-company-data.js";
import "./finnish-company-data.js";
import "./greek-company-data.js";

function fixture(name: string): any {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/registry-status/${name}.json`, import.meta.url), "utf8")).response;
}
function mockFetch(responses: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const entry = Object.entries(responses).find(([part]) => String(url).includes(part));
    if (!entry) throw new Error(`Unexpected registry request: ${url}`);
    return Response.json(entry[1]);
  }));
}
async function run(slug: string, input: Record<string, unknown>) {
  return (await getDirectExecutor(slug)!(input)).output;
}
afterEach(() => vi.unstubAllGlobals());

describe("recorded live registry status regressions", () => {
  it.each([["no-deleted", "930663530", "deleted"], ["no-active", "923609016", "active"]])(
    "Norway %s → %s %s", async (file, id, status) => {
      mockFetch({ [`/enheter/${id}/roller`]: { rollegrupper: [] }, [`/enheter/${id}`]: fixture(file) });
      expect((await run("norwegian-company-data", { org_number: id })).status).toBe(status);
    },
  );
  it.each([["no-deleted", "930663530", true], ["no-active", "923609016", false]] as const)(
    "Norway bankruptcy check %s preserves deletion", async (file, id, deleted) => {
      mockFetch({ [`/enheter/${id}`]: fixture(file) });
      expect(await run("no-bankruptcy-check", { org_number: id })).toMatchObject({
        is_deleted: deleted, deletion_date: deleted ? "2026-10-20" : null,
        has_bankruptcy_filing: false, has_any_distress_signal: deleted,
      });
    },
  );
  it.each([
    ["pl-deleted", "0000106150", "deregistered"],
    ["pl-active", "0000033945", "deregistered"], // old known-answer is also dead
    ["pl-orlen", "0000028860", "active"],
  ])("Poland %s", async (file, id, status) => {
    mockFetch({ [`/OdpisPelny/${id}`]: fixture(file) });
    expect((await run("polish-company-data", { krs_number: id })).status).toBe(status);
  });
  it.each([
    ["cz-liquidation", "cz-vr-liquidation", "01485377", "liquidation"],
    ["cz-01819062", "cz-vr-01819062", "01819062", "liquidation"],
    ["cz-active", "cz-vr-active", "00177041", "active"],
  ])("Czechia %s", async (basic, vr, id, status) => {
    mockFetch({ [`/ekonomicke-subjekty/${id}`]: fixture(basic), [`/ekonomicke-subjekty-vr/${id}`]: fixture(vr) });
    expect((await run("cz-company-data", { ico: id })).status).toBe(status);
  });
  it.each([["fi-association", "0101279-1"], ["fi-active", "0112038-9"]])("Finland %s", async (file, id) => {
    mockFetch({ "v3/companies": fixture(file) });
    expect((await run("finnish-company-data", { business_id: id })).status).toBe("active");
  });
});

describe("status precedence and missing signals (synthetic variants)", () => {
  it.each([
    [{ konkurs: true }, "bankrupt"],
    [{ underAvvikling: true }, "dissolving"],
    [{ underTvangsavviklingEllerTvangsopplosning: true }, "compulsory_dissolution"],
    [{ slettedato: "2026-10-20", konkurs: true }, "deleted"],
    [{ respons_klasse: "SlettetEnhet" }, "deleted"],
  ])("Norway %j", async (flags, status) => {
    mockFetch({ "/roller": {}, "/enheter/": { organisasjonsnummer: "923609016", ...flags } });
    expect((await run("norwegian-company-data", { org_number: "923609016" })).status).toBe(status);
  });
  it.each([
    [{ type: "KONK" }, "bankrupt"], [{ type: "SELTILA" }, "liquidation"],
    [{ type: "SANE" }, "restructuring"], [{ type: "KONK", endDate: "2020-01-01" }, "active"],
  ])("Finland situation %j", async (situation, status) => {
    const data = fixture("fi-active"); data.companies[0].companySituations = [situation];
    mockFetch({ "v3/companies": data });
    expect((await run("finnish-company-data", { business_id: "0112038-9" })).status).toBe(status);
  });
  it.each([[{ status: "5" }, "inactive"], [{ endDate: "2020-01-01" }, "inactive"], [{ status: "1" }, "pending"], [{ status: "9" }, "unknown"]])(
    "Finland lifecycle %j", async (change, status) => {
      const data = fixture("fi-active"); Object.assign(data.companies[0], change);
      mockFetch({ "v3/companies": data });
      expect((await run("finnish-company-data", { business_id: "0112038-9" })).status).toBe(status);
    },
  );
  it("Czechia ignores historical liquidators and name suffixes", async () => {
    const vr = fixture("cz-vr-liquidation");
    vr.zaznamy[0].statutarniOrgany.find((o: any) => o.typOrganu === "LIKVIDATOR").datumVymazu = "2025-01-01";
    mockFetch({ "/ekonomicke-subjekty/": fixture("cz-liquidation"), "/ekonomicke-subjekty-vr/": vr });
    expect((await run("cz-company-data", { ico: "01485377" })).status).toBe("active");
  });
  it("Czechia does not claim active when VR status evidence is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("subjekty-vr") ? new Response(null, { status: 503 }) : Response.json(fixture("cz-liquidation"))));
    expect((await run("cz-company-data", { ico: "01485377" })).status).toBe("unknown");
  });
  it.each([["AKTIVNI", "insolvency"], ["ZANIKLY", "active"]])("Czech insolvency source %s", async (ir, status) => {
    const data = fixture("cz-active"); data.seznamRegistraci.stavZdrojeIr = ir;
    mockFetch({ "/ekonomicke-subjekty/": data, "/ekonomicke-subjekty-vr/": fixture("cz-vr-active") });
    expect((await run("cz-company-data", { ico: "00177041" })).status).toBe(status);
  });
});

describe("GEMI status strings — synthetic only; no GEMI credential available", () => {
  it.each([
    ["Ενεργή", "active"], ["ΕΝΕΡΓΗ", "active"], ["Ενεργός", "active"], ["Ανενεργή", "inactive"],
    ["Διαγραφή", "dissolved"], ["Λύση", "dissolved"], ["Πτώχευση", "bankrupt"],
    ["Εκκαθάριση", "liquidation"], ["Λύση και εκκαθάριση", "liquidation"],
    ["Άγνωστη κατάσταση", "Άγνωστη κατάσταση"], ["", "unknown"],
  ])("%s → %s", async (descr, status) => {
    vi.stubEnv("GEMI_API_KEY", "synthetic-test-key");
    mockFetch({ "/companies/": { arGemi: "000237954001", status: { descr } } });
    try { expect((await run("greek-company-data", { gemi_number: "000237954001" })).status).toBe(status); }
    finally { vi.unstubAllEnvs(); }
  });
});
