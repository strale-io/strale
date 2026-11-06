/**
 * ESMA interim MiCA register: source, format, URL change, age.
 *
 * The fixtures under `__fixtures__/vasp/` are trimmed from the live files
 * recorded 2026-11-06 (https://www.esma.europa.eu/sites/default/files/2024-12/
 * CASPS.csv and NCASP.csv, and the "Interim MiCA Register" block of ESMA's
 * MiCA page). They are public register rows of companies, with ESMA's real
 * quirks kept on purpose: a UTF-8 BOM and CRLF, a quoted multi-line address, a
 * tab inside a service code, a mistyped website ("https.//coinbase.com"),
 * several websites in one cell, a withdrawn authorisation, and an end-date
 * cell that holds a company name.
 *
 * Offline: fetch is stubbed. Before this change the executors asked for
 * dated monthly paths that all answer 404 and read the columns by position,
 * so every test here that needs data fails without it.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STRALE_USER_AGENT } from "../lib/site-access.js";
import { assertBillableOutput } from "../lib/execution-outcome.js";
import { categorizeFailureReason } from "../lib/trust-helpers.js";
import type { CapabilityExecutor } from "./index.js";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/vasp/${name}`, import.meta.url), "utf8");
const CASPS = fixture("CASPS.sample.csv");
const NCASP = fixture("NCASP.sample.csv");
const MICA_PAGE = fixture("mica-page.sample.html");

const CASP_URL = "https://www.esma.europa.eu/sites/default/files/2024-12/CASPS.csv";
const NC_URL = "https://www.esma.europa.eu/sites/default/files/2024-12/NCASP.csv";
const PAGE_URL =
  "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica";

/** The recorded Last-Modified of both files. */
const PUBLISHED = "Thu, 05 Nov 2026 14:07:51 GMT";
const NOW = new Date("2026-11-06T12:00:00Z");

type Route = { status?: number; body?: string; lastModified?: string | null };
let routes: Record<string, Route>;
let fetchMock: ReturnType<typeof vi.fn>;

function answer(url: string): Response {
  const route = routes[url];
  if (!route) return new Response("not routed", { status: 599 });
  const headers: Record<string, string> = {};
  if (route.lastModified !== null) headers["last-modified"] = route.lastModified ?? PUBLISHED;
  return new Response(route.body ?? "", { status: route.status ?? 200, headers });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  routes = {
    [CASP_URL]: { body: CASPS },
    [NC_URL]: { body: NCASP },
    [PAGE_URL]: { body: MICA_PAGE, lastModified: null },
  };
  fetchMock = vi.fn(async (url: string) => answer(url));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function loadData() {
  vi.resetModules();
  return import("./lib/vasp-data.js");
}

async function load(slug: string, module: string): Promise<CapabilityExecutor> {
  vi.resetModules();
  const index = await import("./index.js");
  await import(module);
  const exec = index.getDirectExecutor(slug);
  if (!exec) throw new Error(`${slug} is not registered`);
  return exec;
}

const verify = () => load("vasp-verify", "./vasp-verify.js");
const nonCompliant = () => load("vasp-non-compliant-check", "./vasp-non-compliant-check.js");

async function expectUnavailable(promise: Promise<unknown>) {
  const err = await promise.then(
    () => {
      throw new Error("expected UpstreamUnavailableError, got an answer");
    },
    (e: unknown) => e as Error & { retryable: boolean },
  );
  expect(err.name).toBe("UpstreamUnavailableError");
  return err;
}

// ─── Format ─────────────────────────────────────────────────────────────────

describe("CSV parsing", () => {
  it("handles BOM, CRLF, doubled quotes and quoted line breaks", async () => {
    const { parseCsv } = await loadData();
    const rows = parseCsv('﻿a,b,c\r\n1,"x, ""y""",3\r\n"line\r\nbreak",,\r\n\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", 'x, "y"', "3"],
      ["line\r\nbreak", "", ""],
    ]);
  });

  it("reads the recorded CASP file by column name", async () => {
    const { getCASPRegister } = await loadData();
    const { records } = await getCASPRegister();
    expect(records).toHaveLength(8);

    const coinbase = records.find((r) => r.entityName === "Coinbase Luxembourg S.A.")!;
    expect(coinbase).toMatchObject({
      nca: "Commission de Surveillance du Secteur Financier (CSSF)",
      homeMemberState: "LU",
      lei: "984500F14CA4571AAC11",
      commercialName: "Coinbase",
      authorizationDate: "20/06/2025",
      authorizationEndDate: "",
    });
    expect(coinbase.services[0]).toBe("a. providing custody and administration of crypto-assets on behalf of clients");
    expect(coinbase.services.length).toBeGreaterThan(3);
    expect(coinbase.passportingCountries).toContain("DE");

    // A tab inside a service code and a line break inside the address are flattened.
    const payhound = records.find((r) => r.entityName === "Payhound Limited")!;
    expect(payhound.services[0]).toMatch(/^a\. providing custody/);
    expect(payhound.address).not.toMatch(/[\r\n\t]/);
    // Country codes are normalised ("Fi" appears in ESMA's data).
    const decubate = records.find((r) => r.entityName === "Decubate B.V.")!;
    expect(decubate.passportingCountries).toContain("FI");
    expect(decubate.legalBasis).toBe("Article 63 - CASP authorisation");
  });

  it("reads the recorded non-compliant file by column name", async () => {
    const { getNonCompliantRegister } = await loadData();
    const { records } = await getNonCompliantRegister();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      entityName: "Bank Bit",
      homeMemberState: "BE",
      website: "www.bank-bit.com",
      decisionDate: "29/06/2026",
      nca: "Financial Services and Markets Authority (FSMA)",
    });
    expect(records[0].infringement).toMatch(/without the required MiCAR license/);
  });

  it("asks the fixed ESMA path, once each, with the honest user agent", async () => {
    const { getCASPRegister, getNonCompliantRegister } = await loadData();
    const casp = await getCASPRegister();
    const nc = await getNonCompliantRegister();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([CASP_URL, NC_URL]);
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as { headers: Record<string, string> }).headers["User-Agent"]).toBe(STRALE_USER_AGENT);
    }
    expect(casp.sourceUrl).toBe(CASP_URL);
    expect(nc.sourceUrl).toBe(NC_URL);
  });

  it("throws, instead of misreading rows, when the columns change", async () => {
    // The pre-2026-11 positional layout this module used to assume.
    routes[CASP_URL] = {
      body: "NCA,Country,Entity,LEI,Home,Commercial\nBaFin,DE,Example Crypto GmbH,529900EXAMPLE0000001,DE,ExampleX",
    };
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Example Crypto" }));
    expect(err.message).toMatch(/columns changed/);
    expect(err.retryable).toBe(false);
  });

  it("throws when the CASP file has a header and no rows", async () => {
    routes[CASP_URL] = { body: CASPS.split(/\r?\n/)[0] + "\r\n" };
    const exec = await verify();
    await expectUnavailable(exec({ entity_name: "Coinbase" }));
  });
});

// ─── vasp-verify ────────────────────────────────────────────────────────────

describe("vasp-verify against the recorded register", () => {
  it("finds an authorised CASP and reports its services and passporting", async () => {
    const exec = await verify();
    const { output } = await exec({ entity_name: "Coinbase" });
    expect(output).toMatchObject({
      match_found: true,
      authorized: true,
      register_entries: 8,
      register_stale: false,
      register_age_days: 0,
      register_last_updated: "2026-11-05T14:07:51.000Z",
      register_source_url: CASP_URL,
    });
    const match = (output as { matches: Array<Record<string, unknown>> }).matches[0];
    expect(match).toMatchObject({
      entity_name: "Coinbase Luxembourg S.A.",
      home_country: "LU",
      authorization_date: "20/06/2025",
      authorization_end_date: null,
      authorization_in_force: true,
    });
    expect(match.passporting_countries).toContain("FR");
    expect(output).not.toHaveProperty("note");
    expect(() => assertBillableOutput("vasp-verify", output)).not.toThrow();
  });

  it("finds it by LEI, and by website despite ESMA's mistyped 'https.//' cell", async () => {
    const exec = await verify();
    const byLei = await exec({ entity_name: "unrelated", lei: "984500f14ca4571aac11" });
    expect(byLei.output).toMatchObject({ authorized: true });
    const bySite = await exec({ entity_name: "unrelated", website: "https://www.coinbase.com/" });
    expect(bySite.output).toMatchObject({ authorized: true });
  });

  it("matches a website inside a multi-address cell, and not a lookalike", async () => {
    const exec = await verify();
    const hit = await exec({ entity_name: "x1", website: "platform.decubate.com" });
    expect((hit.output as { matches: Array<{ entity_name: string }> }).matches[0].entity_name).toBe("Decubate B.V.");
    const miss = await exec({ entity_name: "zz", website: "notcoinbase.com" });
    expect(miss.output).toMatchObject({ match_found: false });
  });

  it("a withdrawn authorisation is listed but not in force", async () => {
    const exec = await verify();
    const { output } = await exec({ entity_name: "Stratos Europe" });
    expect(output).toMatchObject({ match_found: true, authorized: false });
    const o = output as { matches: Array<Record<string, unknown>>; note: string };
    expect(o.matches[0]).toMatchObject({ authorization_end_date: "24/04/2026", authorization_in_force: false });
    expect(o.note).toMatch(/withdrawal date/);
  });

  it("an end-date cell that is not a date does not count as authorised", async () => {
    const exec = await verify();
    const { output } = await exec({ entity_name: "Payhound" });
    expect(output).toMatchObject({ match_found: true, authorized: false });
  });

  it("an in-force row is not crowded out by a withdrawn one", async () => {
    const exec = await verify();
    const { output } = await exec({ entity_name: "EUWAX" });
    expect(output).toMatchObject({ match_found: true, authorized: true });
  });

  it("an entity the register does not list is a billed 'not authorised'", async () => {
    const exec = await verify();
    const { output } = await exec({ entity_name: "Definitely Not A Registered Exchange Ltd" });
    expect(output).toMatchObject({ match_found: false, authorized: false, matches: [] });
    expect(() => assertBillableOutput("vasp-verify", output)).not.toThrow();
  });
});

// ─── vasp-non-compliant-check ───────────────────────────────────────────────

describe("vasp-non-compliant-check against the recorded register", () => {
  it("reports a listed non-compliant entity with its reason and decision date", async () => {
    const exec = await nonCompliant();
    const { output } = await exec({ entity_name: "Bank Bit" });
    expect(output).toMatchObject({
      on_non_compliant_list: true,
      data_available: true,
      register_entries: 2,
      register_stale: false,
      register_source_url: NC_URL,
    });
    const match = (output as { matches: Array<Record<string, unknown>> }).matches[0];
    expect(match).toMatchObject({ entity_name: "Bank Bit", home_country: "BE", decision_date: "29/06/2026" });
    expect(match.infringement).toMatch(/breach of section 59 MiCAR/);
  });

  it("finds it by website, and an unlisted name is a billed negative", async () => {
    const exec = await nonCompliant();
    const bySite = await exec({ entity_name: "unrelated", website: "https://dxago.com" });
    expect(bySite.output).toMatchObject({ on_non_compliant_list: true });
    const none = await exec({ entity_name: "Google" });
    expect(none.output).toMatchObject({ on_non_compliant_list: false, data_available: true, matches: [] });
    expect(() => assertBillableOutput("vasp-non-compliant-check", none.output)).not.toThrow();
  });

  it("does not take the CASP file's date for its own", async () => {
    routes[NC_URL] = { body: NCASP, lastModified: "Mon, 15 Sep 2026 09:00:00 GMT" };
    const exec = await nonCompliant();
    const { output } = await exec({ entity_name: "Bank Bit" });
    expect(output).toMatchObject({ register_last_updated: "2026-09-15T09:00:00.000Z", register_age_days: 52 });
  });
});

// ─── The URL changes, or the source is down ─────────────────────────────────

describe("when ESMA moves or loses the files", () => {
  it("follows the link on ESMA's MiCA page after the fixed path answers 404", async () => {
    const moved = "https://www.esma.europa.eu/sites/default/files/2027-01/CASPS.csv";
    routes[CASP_URL] = { status: 404, body: "<!DOCTYPE html><html>Page not found</html>" };
    routes[PAGE_URL] = { body: MICA_PAGE.replaceAll("2024-12", "2027-01"), lastModified: null };
    routes[moved] = { body: CASPS };
    const exec = await verify();
    const { output } = await exec({ entity_name: "Coinbase" });
    expect(output).toMatchObject({ authorized: true, register_source_url: moved });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([CASP_URL, PAGE_URL, moved]);
  });

  it("never follows a link that leaves ESMA's file store", async () => {
    routes[CASP_URL] = { status: 404 };
    routes[PAGE_URL] = {
      body: MICA_PAGE.replace('href="/sites/default/files/2024-12/CASPS.csv"', 'href="https://example.com/CASPS.csv"'),
      lastModified: null,
    };
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.message).toMatch(/leaves ESMA's file store/);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([CASP_URL, PAGE_URL]);
  });

  it("an HTML page served with 200 at the fixed path is treated as moved", async () => {
    routes[CASP_URL] = { body: "<html><body>maintenance</body></html>" };
    const moved = "https://www.esma.europa.eu/sites/default/files/2027-01/CASPS.csv";
    routes[PAGE_URL] = { body: MICA_PAGE.replaceAll("2024-12", "2027-01"), lastModified: null };
    routes[moved] = { body: CASPS };
    const exec = await verify();
    const { output } = await exec({ entity_name: "Coinbase" });
    expect(output).toMatchObject({ authorized: true, register_source_url: moved });
  });

  it("throws, not retryable, when the path and the page both answer 404", async () => {
    routes[CASP_URL] = { status: 404 };
    routes[PAGE_URL] = { status: 404, lastModified: null };
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/^Upstream unavailable: ESMA MiCA CASP register/);
  });

  it("throws, retryable, on a server error, without reading the page for a new link", async () => {
    routes[NC_URL] = { status: 503 };
    const exec = await nonCompliant();
    const err = await expectUnavailable(exec({ entity_name: "Bank Bit" }));
    expect(err.retryable).toBe(true);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([NC_URL]);
  });

  it("a 404 on one source and a timeout on another is a transient failure, not a moved file", async () => {
    routes[CASP_URL] = { status: 404 };
    fetchMock.mockImplementation(async (url: string) => {
      if (url === PAGE_URL) throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
      return answer(url);
    });
    const exec = await verify();
    const err = (await expectUnavailable(exec({ entity_name: "Coinbase" }))) as Error & {
      retryable: boolean;
      failures: string[];
    };
    expect(err.retryable).toBe(true);
    // The per-source codes live on the error, not in the text classifiers read.
    expect(err.failures).toEqual(["2024-12/CASPS.csv: HTTP 404", "MiCA page: timeout"]);
    expect(err.message).not.toMatch(/404|401|403|410/);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });

  it("404 plus a server error on the page is transient too", async () => {
    routes[CASP_URL] = { status: 404 };
    routes[PAGE_URL] = { status: 503, lastModified: null };
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.retryable).toBe(true);
    expect(categorizeFailureReason(err.message)).toBe("transient");
  });

  it("every source answering 404 stays endpoint_gone, with the codes printed", async () => {
    routes[CASP_URL] = { status: 404 };
    routes[PAGE_URL] = { status: 404, lastModified: null };
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.retryable).toBe(false);
    expect(categorizeFailureReason(err.message)).toBe("endpoint_gone");
  });

  it("a changed format or a frozen file is never filed as a moved endpoint", async () => {
    routes[CASP_URL] = { body: CASPS, lastModified: "Mon, 06 Jul 2026 10:00:00 GMT" };
    const frozen = await expectUnavailable((await verify())({ entity_name: "Coinbase" }));
    expect(categorizeFailureReason(frozen.message)).not.toBe("endpoint_gone");
    routes[CASP_URL] = { body: "a,b\n1,2" };
    const changed = await expectUnavailable((await verify())({ entity_name: "Coinbase" }));
    expect(categorizeFailureReason(changed.message)).not.toBe("endpoint_gone");
    expect(categorizeFailureReason(changed.message)).not.toBe("auth_expired");
  });

  it("throws on a timeout", async () => {
    fetchMock.mockImplementation(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.message).toMatch(/timeout/);
  });
});

// ─── Age ────────────────────────────────────────────────────────────────────

describe("register age", () => {
  it("says so in the output once the file is older than six weeks", async () => {
    routes[CASP_URL] = { body: CASPS, lastModified: "Wed, 16 Sep 2026 10:00:00 GMT" }; // 51 days
    const exec = await verify();
    const { output } = await exec({ entity_name: "Coinbase" });
    expect(output).toMatchObject({ authorized: true, register_stale: true, register_age_days: 51 });
    expect((output as { note: string }).note).toMatch(/last published 51 days ago/);
  });

  it("is not stale at the boundary of six weeks", async () => {
    routes[CASP_URL] = { body: CASPS, lastModified: "Tue, 22 Sep 2026 12:00:00 GMT" }; // 45 days
    const exec = await verify();
    const { output } = await exec({ entity_name: "Coinbase" });
    expect(output).toMatchObject({ register_stale: false, register_age_days: 45 });
  });

  it("throws once the file is older than four months: frozen data is not an answer", async () => {
    routes[CASP_URL] = { body: CASPS, lastModified: "Mon, 06 Jul 2026 10:00:00 GMT" }; // 123 days
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.message).toMatch(/2026-07-06 \(about 17 weeks ago\)/);
    expect(err.retryable).toBe(false);
  });

  it("dates the file by its newest record when the server sends no Last-Modified", async () => {
    // Newest record in the recorded file: 21/05/2026, 169 days before NOW.
    routes[CASP_URL] = { body: CASPS, lastModified: null };
    const exec = await verify();
    const err = await expectUnavailable(exec({ entity_name: "Coinbase" }));
    expect(err.message).toMatch(/2026-05-21/);
  });

  it("flags, rather than hides, a file whose age cannot be established", async () => {
    const lastUpdateColumn = CASPS.split(/\r?\n/)[0].split(",").indexOf("ac_lastupdate");
    expect(lastUpdateColumn).toBeGreaterThan(0);
    const { parseCsv } = await loadData();
    const stripped = parseCsv(CASPS)
      .map((row, i) => row.map((c, j) => (i > 0 && j === lastUpdateColumn ? "" : c)))
      .map((row) => row.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    routes[CASP_URL] = { body: stripped, lastModified: null };
    const exec = await verify();
    const { output } = await exec({ entity_name: "Coinbase" });
    expect(output).toMatchObject({ register_stale: true, register_age_days: null, register_last_updated: null });
  });
});

// ─── Cache ──────────────────────────────────────────────────────────────────

describe("cache", () => {
  it("reads each file once within six hours", async () => {
    const { getCASPRegister } = await loadData();
    await getCASPRegister();
    await getCASPRegister();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a published, empty non-compliant list like any other read", async () => {
    routes[NC_URL] = { body: NCASP.split(/\r?\n/)[0] + "\r\n" };
    const { getNonCompliantRegister } = await loadData();
    const first = await getNonCompliantRegister();
    const second = await getNonCompliantRegister();
    expect(first.records).toEqual([]);
    expect(second.records).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the previous read when ESMA goes down, and says so", async () => {
    const { getCASPRegister } = await loadData();
    await getCASPRegister();
    vi.setSystemTime(new Date(NOW.getTime() + 7 * 60 * 60 * 1000));
    routes[CASP_URL] = { status: 503 };
    const again = await getCASPRegister();
    expect(again.servedFromCache).toBe(true);
    expect(again.records.length).toBe(8);
  });

  it("stops serving the previous read once it is past the age limit", async () => {
    const { getCASPRegister } = await loadData();
    await getCASPRegister();
    vi.setSystemTime(new Date(NOW.getTime() + 125 * 24 * 60 * 60 * 1000));
    routes[CASP_URL] = { status: 503 };
    await expectUnavailable(getCASPRegister());
  });
});
