import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// ClinicalTrials.gov API v2 — free, no key, no registration. One search call
// per invocation. Verified live 2026-09-05 (query.term "crispr" returned
// NCT03399448, a terminated UPenn phase-1 trial).
const API = "https://clinicaltrials.gov/api/v2/studies";
const USER_AGENT = "Strale/1.0 (support@strale.io)";

// The v2 payload nests everything under protocolSection modules. Only the
// fields we surface are typed; the rest of each module is ignored.
interface Study {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
      completionDateStruct?: { date?: string };
    };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string; class?: string } };
    conditionsModule?: { conditions?: string[] };
    designModule?: {
      studyType?: string;
      phases?: string[];
      enrollmentInfo?: { count?: number; type?: string };
    };
    armsInterventionsModule?: { interventions?: Array<{ type?: string; name?: string }> };
    contactsLocationsModule?: { locations?: unknown[] };
  };
}
interface SearchResponse { studies?: Study[]; totalCount?: number }

// Recruitment states accepted on `status`, mapped to the API's enum.
const STATUS = new Map<string, string>([
  ["recruiting", "RECRUITING"],
  ["not_yet_recruiting", "NOT_YET_RECRUITING"],
  ["active_not_recruiting", "ACTIVE_NOT_RECRUITING"],
  ["completed", "COMPLETED"],
  ["terminated", "TERMINATED"],
  ["withdrawn", "WITHDRAWN"],
  ["suspended", "SUSPENDED"],
]);

/** Flatten one v2 study into the shape this capability returns. */
export function normalizeStudy(study: Study): Record<string, unknown> | null {
  const p = study.protocolSection;
  const nctId = p?.identificationModule?.nctId;
  if (!nctId) return null;
  const design = p?.designModule;
  return {
    nct_id: nctId,
    title: p?.identificationModule?.briefTitle ?? null,
    official_title: p?.identificationModule?.officialTitle ?? null,
    status: p?.statusModule?.overallStatus ?? null,
    study_type: design?.studyType ?? null,
    phases: design?.phases ?? [],
    conditions: p?.conditionsModule?.conditions ?? [],
    interventions: (p?.armsInterventionsModule?.interventions ?? [])
      .map((i) => (i.name ? { type: i.type ?? null, name: i.name } : null))
      .filter((i): i is { type: string | null; name: string } => i !== null),
    enrollment: typeof design?.enrollmentInfo?.count === "number" ? design.enrollmentInfo.count : null,
    enrollment_type: design?.enrollmentInfo?.type ?? null,
    start_date: p?.statusModule?.startDateStruct?.date ?? null,
    completion_date: p?.statusModule?.completionDateStruct?.date ?? null,
    lead_sponsor: p?.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
    lead_sponsor_class: p?.sponsorCollaboratorsModule?.leadSponsor?.class ?? null,
    location_count: Array.isArray(p?.contactsLocationsModule?.locations)
      ? p.contactsLocationsModule.locations.length
      : null,
    url: `https://clinicaltrials.gov/study/${nctId}`,
  };
}

registerCapability("clinical-trials-search", async (input: CapabilityInput) => {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 2) {
    throw new Error("'query' must be at least 2 characters — a condition, intervention, sponsor or free text.");
  }
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 20, fallback: 10 });

  let statusFilter: string | null = null;
  if (input.status !== undefined && input.status !== null && input.status !== "") {
    const raw = String(input.status).trim().toLowerCase();
    const mapped = STATUS.get(raw);
    if (!mapped) {
      throw new Error(`'status' must be one of: ${[...STATUS.keys()].join(", ")}.`);
    }
    statusFilter = mapped;
  }

  const params = new URLSearchParams({
    "query.term": query,
    pageSize: String(limit),
    countTotal: "true",
    format: "json",
  });
  if (statusFilter) params.set("filter.overallStatus", statusFilter);

  const res = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) {
    throw new Error("ClinicalTrials.gov is rate-limiting requests right now. Retry shortly.");
  }
  if (res.status === 400) {
    throw new Error("ClinicalTrials.gov rejected the query as malformed. Simplify the search terms and retry.");
  }
  if (!res.ok) throw new Error(`ClinicalTrials.gov returned HTTP ${res.status}.`);

  const data = await readJsonWithLimit<SearchResponse>(res);
  const studies = (data.studies ?? [])
    .map(normalizeStudy)
    .filter((s): s is Record<string, unknown> => s !== null);

  return {
    output: {
      query,
      status_filter: statusFilter,
      // countTotal=true populates totalCount; fall back to the page size so the
      // field is never null when studies came back.
      total_results: typeof data.totalCount === "number" ? data.totalCount : studies.length,
      returned: studies.length,
      studies,
    },
    provenance: {
      source: "ClinicalTrials.gov API v2 (U.S. National Library of Medicine)",
      fetched_at: new Date().toISOString(),
    },
  };
});
