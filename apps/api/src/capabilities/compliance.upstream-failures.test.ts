/**
 * Swallowed-upstream-failure fixes, wave 1: the compliance rows (audit rows 1,
 * 2, 3 and 18; archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md).
 *
 * When the upstream that decides a compliance answer fails, the executor must
 * throw (unbilled), never return a clean-looking negative. A real negative
 * keeps today's output and stays billable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { assertBillableOutput, outcomeFromError } from "../lib/execution-outcome.js";
import type { CapabilityExecutor } from "./index.js";

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * Fresh modules per test: vasp-data caches the register in module state, and
 * a cached register from an earlier test would mask the outage under test.
 */
async function load(slug: string, module: string): Promise<CapabilityExecutor> {
  vi.resetModules();
  const index = await import("./index.js");
  await import(module);
  const exec = index.getDirectExecutor(slug);
  if (!exec) throw new Error(`${slug} is not registered`);
  return exec;
}

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>): Promise<UpstreamUnavailableError> {
  const err = await promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e,
  );
  // Fresh modules mean a fresh class identity; compare by name, and check
  // billing with the outcome module from the same module graph.
  expect((err as Error).name).toBe("UpstreamUnavailableError");
  const { outcomeFromError: freshOutcome } = await import("../lib/execution-outcome.js");
  expect(freshOutcome(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err as UpstreamUnavailableError;
}

const status = (code: number, body = "") => new Response(body, { status: code });
const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ─── vasp-verify / vasp-non-compliant-check (lib/vasp-data.ts) ──────────────

// ESMA's real column names (the layout is asserted in vasp-register.test.ts).
const CASP_HEADER =
  "ae_competentAuthority,ae_homeMemberState,ae_lei_name,ae_lei,ae_lei_cou_code,ae_commercial_name,ae_address,ae_website,ae_website_platform,ac_authorisationNotificationDate,ac_authorisationEndDate,ac_serviceCode,ac_serviceCode_cou,ac_comments,ac_lastupdate,ac_legal_basis";
const CASP_CSV = [
  CASP_HEADER,
  "BaFin,DE,Example Crypto GmbH,529900EXAMPLE0000001,DE,ExampleX,Berlin,https://examplex.de,,01/01/2025,,a. custody | c. exchange,FR|IT,,01/11/2026,Article 63",
].join("\r\n");
const NC_HEADER =
  "ae_competentAuthority,ae_homeMemberState,ae_lei_name,ae_lei,ae_lei_cou_code,ae_commercial_name,ae_website,ae_infrigment,ae_reason,ae_decision_date,ae_comments,ae_lastupdate";
// A register file ESMA published just now; the age rule is tested in vasp-register.test.ts.
const withDate = (body: string) => new Response(body, { status: 200, headers: { "last-modified": new Date().toUTCString() } });

describe("vasp-verify", () => {
  it("throws, retryable, when every ESMA path fails with a server error", async () => {
    fetchMock.mockImplementation(async () => status(503));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    const err = await expectUnbilledUpstreamFailure(exec({ entity_name: "Example Crypto" }));
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("HTTP 503");
  });

  it("throws, not retryable, when the register path and ESMA's page both answer 404 (the files moved)", async () => {
    fetchMock.mockImplementation(async () => status(404, "<!DOCTYPE html><html></html>"));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    const err = await expectUnbilledUpstreamFailure(exec({ entity_name: "Example Crypto" }));
    expect(err.retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on a timeout", async () => {
    fetchMock.mockImplementation(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    const exec = await load("vasp-verify", "./vasp-verify.js");
    const err = await expectUnbilledUpstreamFailure(exec({ entity_name: "Example Crypto" }));
    expect(err.message).toMatch(/timeout/);
  });

  it("throws on an HTML page served with 200", async () => {
    fetchMock.mockImplementation(async () => status(200, "<!DOCTYPE html><html>maintenance</html>"));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    const err = await expectUnbilledUpstreamFailure(exec({ entity_name: "Example Crypto" }));
    expect(err.message).toMatch(/HTML page instead of CSV/);
  });

  it("throws when the file parses to no rows", async () => {
    fetchMock.mockImplementation(async () => withDate(`${CASP_HEADER}\r\n`));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    await expectUnbilledUpstreamFailure(exec({ entity_name: "Example Crypto" }));
  });

  it("a register that loaded and does not list the entity is a billed 'not authorised'", async () => {
    fetchMock.mockImplementation(async () => withDate(CASP_CSV));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    const { output } = await exec({ entity_name: "Unknown Exchange Ltd" });
    expect(output).toMatchObject({ match_found: false, authorized: false, matches: [], register_entries: 1 });
    expect(() => assertBillableOutput("vasp-verify", output)).not.toThrow();
  });

  it("a listed entity is found", async () => {
    fetchMock.mockImplementation(async () => withDate(CASP_CSV));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    const { output } = await exec({ entity_name: "Example Crypto" });
    expect(output).toMatchObject({ match_found: true, authorized: true });
  });

  it("still answers from a stale cache when ESMA goes down after a good read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockImplementation(async () => withDate(CASP_CSV));
    const exec = await load("vasp-verify", "./vasp-verify.js");
    await exec({ entity_name: "Example Crypto" });
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    fetchMock.mockImplementation(async () => status(503));
    const { output } = await exec({ entity_name: "Example Crypto" });
    expect(output).toMatchObject({ match_found: true });
  });
});

describe("vasp-non-compliant-check", () => {
  it("throws when the register cannot be read", async () => {
    fetchMock.mockImplementation(async () => status(502));
    const exec = await load("vasp-non-compliant-check", "./vasp-non-compliant-check.js");
    await expectUnbilledUpstreamFailure(exec({ entity_name: "Example Crypto" }));
  });

  it("a published list with no entries is a billed, available negative", async () => {
    fetchMock.mockImplementation(async () => withDate(`${NC_HEADER}\r\n`));
    const exec = await load("vasp-non-compliant-check", "./vasp-non-compliant-check.js");
    const { output } = await exec({ entity_name: "Example Crypto" });
    expect(output).toMatchObject({ on_non_compliant_list: false, data_available: true, matches: [], register_entries: 0 });
    expect(() => assertBillableOutput("vasp-non-compliant-check", output)).not.toThrow();
  });

  it("a listed entity is reported", async () => {
    fetchMock.mockImplementation(async () =>
      withDate(
        `${NC_HEADER}\r\nMFSA,MT,Shady Coins Ltd,,MT,ShadyX,https://shadyx.io,No,Unauthorised CASP services,01/10/2026,,02/10/2026`,
      ),
    );
    const exec = await load("vasp-non-compliant-check", "./vasp-non-compliant-check.js");
    const { output } = await exec({ entity_name: "Shady Coins" });
    expect(output).toMatchObject({ on_non_compliant_list: true, data_available: true });
  });
});

// ─── insolvency-check (Companies House) ─────────────────────────────────────

describe("insolvency-check", () => {
  beforeEach(() => vi.stubEnv("COMPANIES_HOUSE_API_KEY", "test-key"));

  const searchThen = (search: () => Response, insolvency: () => Response = () => status(404)) =>
    fetchMock.mockImplementation(async (url: string) => (url.includes("/search/companies") ? search() : insolvency()));

  it.each([429, 500, 503])("throws, unbilled, when the company search answers HTTP %i", async (code) => {
    searchThen(() => status(code));
    const exec = await load("insolvency-check", "./insolvency-check.js");
    const err = await expectUnbilledUpstreamFailure(exec({ company_name: "Example Ltd", country_code: "GB" }));
    expect(err.code).toBe(`HTTP ${code}`);
  });

  it("throws, rather than 'not found', when the search rejects our request", async () => {
    searchThen(() => status(401));
    const exec = await load("insolvency-check", "./insolvency-check.js");
    await expect(exec({ company_name: "Example Ltd", country_code: "GB" })).rejects.toThrow("Companies House search error: HTTP 401");
  });

  it("throws, unbilled, when the insolvency endpoint answers HTTP 503", async () => {
    searchThen(() => json({ items: [{ company_number: "01234567" }] }), () => status(503));
    const exec = await load("insolvency-check", "./insolvency-check.js");
    await expectUnbilledUpstreamFailure(exec({ company_name: "Example Ltd", country_code: "GB" }));
  });

  it("a search that answered with no company is still the billed 'not found' envelope", async () => {
    searchThen(() => json({ items: [] }));
    const exec = await load("insolvency-check", "./insolvency-check.js");
    const { output } = await exec({ company_name: "No Such Company Ltd", country_code: "GB" });
    expect(output).toEqual({
      query: "No Such Company Ltd",
      country_code: "GB",
      supported_country: true,
      found: false,
      message: "Company not found in Companies House.",
      data_source: "companies-house-uk",
    });
    expect(() => assertBillableOutput("insolvency-check", output)).not.toThrow();
  });

  it("a 404 from the insolvency endpoint is still 'no proceedings'", async () => {
    searchThen(() => json({ items: [{ company_number: "01234567" }] }));
    const exec = await load("insolvency-check", "./insolvency-check.js");
    const { output } = await exec({ company_name: "Example Ltd", country_code: "GB" });
    expect(output).toMatchObject({ company_number: "01234567", has_insolvency_proceedings: false, proceedings: [] });
  });
});

// ─── cz-company-data (ARES, VR leg) ─────────────────────────────────────────

describe("cz-company-data", () => {
  const ICO = "27082440";
  const BE = {
    ico: ICO,
    obchodniJmeno: "Example a.s.",
    sidlo: { textovaAdresa: "Praha" },
    pravniForma: "121",
    seznamRegistraci: { stavZdrojeRos: "AKTIVNI", stavZdrojeVr: "AKTIVNI" },
  };
  const VR = {
    icoId: ICO,
    zaznamy: [
      {
        primarniZaznam: true,
        statutarniOrgany: [
          {
            nazevOrganu: "Představenstvo",
            clenoveOrganu: [{ typAngazma: "STATUTARNI_ORGAN_CLEN", fyzickaOsoba: { jmeno: "Jan", prijmeni: "Novák" } }],
          },
        ],
      },
    ],
  };
  const withVr = (vr: () => Response | Promise<Response>) =>
    fetchMock.mockImplementation(async (url: string) => (url.includes("ekonomicke-subjekty-vr/") ? vr() : json(BE)));

  it.each([
    ["HTTP 503", () => status(503)],
    ["timeout", () => Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))],
  ])("a failed VR read (%s) is marked degraded with the true reason, not 'likely sole trader'", async (reason, vr) => {
    withVr(vr as () => Promise<Response>);
    const exec = await load("cz-company-data", "./cz-company-data.js");
    const { output } = await exec({ ico: ICO });
    expect(output.tier_2_available).toBe(false);
    // Unknown, not "none": null rather than [] or 0, plus a machine-readable status.
    expect(output.legal_representatives).toBeNull();
    expect(output.total_legal_representatives).toBeNull();
    expect(output.tier_2_status).toBe("upstream_unavailable");
    expect(output.tier_2_available_reason).toContain(`ARES VR view could not be read (${reason})`);
    expect(output.tier_2_available_reason).not.toMatch(/sole trader/);
    // Liquidation cannot be excluded without the VR view.
    expect(output.status).toBe("unknown");
    // Tier-1 data is the answer and is still billed, as the other KYB tools do.
    expect(() => assertBillableOutput("cz-company-data", output)).not.toThrow();
  });

  it("a VR 404 keeps its 'not in the commercial register' reason", async () => {
    withVr(() => status(404));
    const exec = await load("cz-company-data", "./cz-company-data.js");
    const { output } = await exec({ ico: ICO });
    expect(output.tier_2_available).toBe(false);
    expect(output.tier_2_available_reason).toBe(
      "ARES VR view returned no active statutory body members for this entity (likely sole trader / association / foreign branch not in the commercial register); tier_2 not bindable on this record.",
    );
    // The real negative keeps its old shape: an empty list, a zero count, no status key.
    expect(output.legal_representatives).toEqual([]);
    expect(output.total_legal_representatives).toBe(0);
    expect(output).not.toHaveProperty("tier_2_status");
  });

  it("a VR read that answered binds tier 2", async () => {
    withVr(() => json(VR));
    const exec = await load("cz-company-data", "./cz-company-data.js");
    const { output } = await exec({ ico: ICO });
    expect(output.tier_2_available).toBe(true);
    expect(output.legal_representatives).toMatchObject([{ name: "Jan Novák", role_group: "Představenstvo" }]);
  });
});

// Keep the static imports honest: the same billing authority the rails use.
it("the outcome module files UpstreamUnavailableError as unbilled", () => {
  expect(outcomeFromError(new UpstreamUnavailableError("x", "y"))).toMatchObject({ billable: false });
});
