import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { normalizeStudy } from "./clinical-trials-search.js";

const exec = getDirectExecutor("clinical-trials-search")!;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const STUDY = {
  protocolSection: {
    identificationModule: { nctId: "NCT03872479", briefTitle: "Single Ascending Dose Study", officialTitle: "Open-Label Study" },
    statusModule: { overallStatus: "UNKNOWN", startDateStruct: { date: "2019-09-26" }, completionDateStruct: { date: "2025-05-23" } },
    sponsorCollaboratorsModule: { leadSponsor: { name: "Editas Medicine, Inc.", class: "INDUSTRY" } },
    conditionsModule: { conditions: ["Leber Congenital Amaurosis 10"] },
    designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE1", "PHASE2"], enrollmentInfo: { count: 34, type: "ESTIMATED" } },
    armsInterventionsModule: { interventions: [{ type: "DRUG", name: "EDIT-101" }, { type: "DRUG" }] },
    contactsLocationsModule: { locations: [{}, {}, {}] },
  },
};

describe("clinical-trials-search", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("flattens the nested protocol modules into one record", () => {
    const s = normalizeStudy(STUDY)!;
    expect(s.nct_id).toBe("NCT03872479");
    expect(s.phases).toEqual(["PHASE1", "PHASE2"]);
    expect(s.enrollment).toBe(34);
    expect(s.enrollment_type).toBe("ESTIMATED");
    expect(s.lead_sponsor).toBe("Editas Medicine, Inc.");
    expect(s.location_count).toBe(3);
    expect(s.url).toBe("https://clinicaltrials.gov/study/NCT03872479");
    // An intervention with no name carries no information and is dropped.
    expect(s.interventions).toEqual([{ type: "DRUG", name: "EDIT-101" }]);
  });

  it("drops a study with no NCT id rather than emitting a null-keyed record", () => {
    expect(normalizeStudy({ protocolSection: { statusModule: { overallStatus: "COMPLETED" } } })).toBeNull();
    expect(normalizeStudy({})).toBeNull();
  });

  it("tolerates a study missing every optional module", () => {
    const s = normalizeStudy({ protocolSection: { identificationModule: { nctId: "NCT1" } } })!;
    expect(s.nct_id).toBe("NCT1");
    expect(s.phases).toEqual([]);
    expect(s.conditions).toEqual([]);
    expect(s.enrollment).toBeNull();
    expect(s.location_count).toBeNull();
  });

  it("refuses a missing query and an unknown status before any upstream call", async () => {
    await expect(exec({})).rejects.toThrow(/'query' is required/);
    await expect(exec({ query: "x" })).rejects.toThrow(/'query' is required/);
    await expect(exec({ query: "crispr", status: "sleeping" })).rejects.toThrow(/'status' must be one of/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the status filter onto the API's enum and reports the total", async () => {
    fetchMock.mockResolvedValue(ok({ totalCount: 103, studies: [STUDY] }));
    const { output } = await exec({ query: "crispr cas9", status: "recruiting", limit: 5 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("filter.overallStatus=RECRUITING");
    expect(output.status_filter).toBe("RECRUITING");
    expect(output.total_results).toBe(103);
    expect(output.returned).toBe(1);
  });

  it("falls back to the page size when the upstream omits totalCount", async () => {
    fetchMock.mockResolvedValue(ok({ studies: [STUDY] }));
    const { output } = await exec({ query: "crispr" });
    expect(output.total_results).toBe(1);
    expect(output.status_filter).toBeNull();
  });

  it("surfaces a rejected query and rate limiting distinctly", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(exec({ query: "crispr" })).rejects.toThrow(/rejected the query as malformed/);
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(exec({ query: "crispr" })).rejects.toThrow(/rate-limiting/);
  });
});
