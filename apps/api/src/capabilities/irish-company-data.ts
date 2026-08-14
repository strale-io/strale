import { registerCapability, type CapabilityInput } from "./index.js";
import { pickByName as pickByNameShared } from "../lib/company-name-match.js";

/**
 * Irish company data via the CRO Open Data Portal CKAN datastore API.
 *
 * Free, real-time JSON, no signup required. Data is published by the
 * Companies Registration Office (CRO) under CC-BY 4.0, which permits
 * commercial redistribution with attribution. Daily snapshots cover
 * both currently registered and historical entities.
 *
 * Replaces the prior Browserless+LLM scrape of core.cro.ie which was
 * a Tier 1 violation per DEC-20260428-A. This implementation is
 * `acquisition_method: direct_api`.
 */

const CRO_DATASTORE_API = "https://opendata.cro.ie/api/3/action/datastore_search";
// Resource ID for the "Company Records" dataset on opendata.cro.ie.
const CRO_RESOURCE_ID = "3fef41bc-b8f4-4b10-8434-ce51c29b1bba";

// CRO number: 5-6 digits.
const CRO_RE = /^\d{5,6}$/;

function findCro(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (CRO_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{5,6}/);
  return match && CRO_RE.test(match[0]) ? match[0] : null;
}

interface CroRecord {
  company_num: number;
  company_name: string;
  company_status: string;
  company_type: string;
  company_reg_date: string | null;
  last_ar_date: string | null;
  company_address_1: string | null;
  company_address_2: string | null;
  company_address_3: string | null;
  company_address_4: string | null;
  comp_dissolved_date: string | null;
  nard: string | null;
  last_accounts_date: string | null;
  company_status_date: string | null;
  nace_v2_code: number | string | null;
  eircode: string | null;
  princ_object_code: string | null;
}

interface DatastoreResponse {
  success: boolean;
  result: { records: CroRecord[]; total?: number };
}

async function callDatastore(qs: URLSearchParams): Promise<CroRecord[]> {
  qs.set("resource_id", CRO_RESOURCE_ID);
  const url = `${CRO_DATASTORE_API}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`CRO Open Data Portal returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as DatastoreResponse;
  if (!data.success) {
    throw new Error("CRO Open Data Portal returned success=false");
  }
  return data.result.records ?? [];
}

async function lookupByCroNumber(croNumber: string): Promise<CroRecord> {
  const filters = JSON.stringify({ company_num: parseInt(croNumber, 10) });
  const records = await callDatastore(new URLSearchParams({ filters, limit: "1" }));
  if (!records.length) {
    throw new Error(`No Irish company found for CRO number ${croNumber}.`);
  }
  return records[0];
}

/**
 * Name path: the CKAN datastore_search `q=` full-text query does return a
 * Postgres ts_rank score per record, but rank reflects term frequency, not
 * entity identity — searching "Kerry" ranks WEST KERRY DEVELOPMENTS LIMITED
 * (dissolved 2010) and WEST KERRY BUILDERS LIMITED identically and neither
 * is a name match at all. Taking the top-ranked (or, previously, the first
 * Live-status) result hands the caller a different legal entity with no
 * signal that it did — the #161 wrong-company class already fixed for
 * NO/FI/EE/DE/CH. Score every candidate by name and refuse when nothing
 * genuinely matches; a status preference is not a substitute for a name
 * match, so it is not applied as a tiebreaker.
 *
 * Thin field-mapping wrapper: the bucket/score/refuse logic itself now lives
 * once in company-name-match.ts (consolidated 2026-08-14, was duplicated
 * four ways — see that module's pickByName doc comment). The shared function
 * hands back the winning candidate itself (`resolved.candidate`), so this
 * wrapper only renames it to the `{ record, matchConfidence }` shape
 * irish-company-data.test.ts already exercises — no second scan needed. No
 * status tiebreak is reintroduced here either.
 */
export interface IeNameResolution {
  record: CroRecord;
  matchConfidence: "exact" | "high";
}

export function pickByName(name: string, records: CroRecord[]): IeNameResolution {
  const resolved = pickByNameShared(
    name,
    records,
    (r) => r?.company_name,
    (r) => (r?.company_num != null ? String(r.company_num) : undefined),
    {
      subjectLabel: "Irish company",
      disambiguationHint: "Provide the CRO number (5-6 digits) to disambiguate.",
      noMatchLabel: "Irish registry",
      searchDescription: "The CRO Open Data Portal's search",
      noMatchHint: "Provide the CRO number (5-6 digits) for an exact lookup.",
    },
  );
  return { record: resolved.candidate, matchConfidence: resolved.matchConfidence };
}

// Fetches the candidate page and delegates to pickByName above for the
// actual scoring — see that function's doc comment for the ts_rank/Kerry
// rationale.
async function lookupByName(name: string): Promise<IeNameResolution> {
  const records = await callDatastore(new URLSearchParams({ q: name, limit: "25" }));
  if (!records.length) {
    throw new Error(`No Irish company found matching "${name}".`);
  }
  return pickByName(name, records);
}

function formatAddress(r: CroRecord): string | null {
  // Source data occasionally has leading commas or stray whitespace inside
  // a single field (e.g. company_address_4 == ", Ireland"). Strip them.
  const parts = [r.company_address_1, r.company_address_2, r.company_address_3, r.company_address_4]
    .map((p) => (typeof p === "string" ? p.replace(/^[,\s]+|[,\s]+$/g, "").trim() : ""))
    .filter((p) => p.length > 0);
  return parts.length ? parts.join(", ") : null;
}

function toIsoDate(timestamp: string | null): string | null {
  return timestamp ? timestamp.slice(0, 10) : null;
}

function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

registerCapability("irish-company-data", async (input: CapabilityInput) => {
  const raw =
    (input.cro_number as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "'cro_number' or 'company_name' is required. Provide a CRO number (5-6 digits) or an Irish company name.",
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    throw new Error("Input must be at least 2 characters.");
  }

  const cro = findCro(trimmed);
  let record: CroRecord;
  let matchConfidence: "exact" | "high" | null = null;
  if (cro) {
    record = await lookupByCroNumber(cro);
  } else {
    const resolved = await lookupByName(trimmed);
    record = resolved.record;
    matchConfidence = resolved.matchConfidence;
  }

  const output: Record<string, unknown> = {
    company_name: clean(record.company_name) ?? record.company_name,
    cro_number: String(record.company_num),
    company_type: clean(record.company_type),
    status: clean(record.company_status),
    address: formatAddress(record),
    eircode: clean(record.eircode),
    registration_date: toIsoDate(record.company_reg_date),
    last_annual_return_date: toIsoDate(record.last_ar_date),
    next_annual_return_date: toIsoDate(record.nard),
    last_accounts_date: toIsoDate(record.last_accounts_date),
    status_date: toIsoDate(record.company_status_date),
    dissolution_date: toIsoDate(record.comp_dissolved_date),
    nace_v2_code: record.nace_v2_code != null ? String(record.nace_v2_code) : null,
    principal_object_code: clean(record.princ_object_code),
    jurisdiction: "IE",
  };
  if (matchConfidence) output.match_confidence = matchConfidence;

  const filterRef = encodeURIComponent(JSON.stringify({ company_num: record.company_num }));
  const primarySourceUrl = `${CRO_DATASTORE_API}?resource_id=${CRO_RESOURCE_ID}&filters=${filterRef}`;

  // Evidence Tier framework labels + Tier 1 canonical aliases (DEC-20260518-A).
  // Resolves alias keys at runtime; only sets a canonical if not already present.
  {
    const o = output as Record<string, unknown>;
    if (o.legal_name === undefined) o.legal_name = (o.company_name ?? o.name);
    if (o.primary_registration_id === undefined) o.primary_registration_id = (o.company_number ?? o.registration_number ?? o.uen ?? o.fn_number ?? o.ico ?? o.krs_number ?? o.org_number ?? o.cnpj ?? o.reg_number);
    if (o.status === undefined) {
    if (typeof o.company_status === "string") o.status = o.company_status;
    else if (o.is_active === true || o.active === true) o.status = "active";
    else if (o.is_active === false || o.active === false) o.status = "inactive";
  }
    if (o.legal_form === undefined) o.legal_form = (o.business_type ?? o.company_type ?? o.entity_type ?? o.legal_form_code ?? o.legal_form_id);
    if (o.registered_address === undefined) o.registered_address = (o.address ?? o.office_address);
    if (o.date_incorporated === undefined) o.date_incorporated = (o.incorporation_date ?? o.registered_date ?? o.registration_date ?? o.founded ?? o.uen_issue_date ?? o.registered_at);
    o.tier_2_available = false;
    o.tier_2_available_reason = "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked";
    o.ubo_availability = "restricted";
    o.ubo_availability_reason = "RBO (Register of Beneficial Ownership) access restricted post-CJEU 2022";
  }

  return {
    output,
    provenance: {
      source: "opendata.cro.ie",
      source_url: "https://opendata.cro.ie/dataset/companies",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: primarySourceUrl,
      license: "CC-BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Companies Registration Office (CRO), Ireland — opendata.cro.ie",
      source_note:
        "Daily snapshot from the CRO Open Data Portal Company Records dataset. Real-time API via CKAN datastore_search.",
    },
  };
});
