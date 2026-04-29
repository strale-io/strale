import { registerCapability, type CapabilityInput } from "./index.js";

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

async function lookupByName(name: string): Promise<CroRecord> {
  const records = await callDatastore(new URLSearchParams({ q: name, limit: "10" }));
  if (!records.length) {
    throw new Error(`No Irish company found matching "${name}".`);
  }
  // Prefer Live/Normal status when multiple matches.
  const liveStatuses = new Set(["Live", "Normal", "Active"]);
  const sorted = [...records].sort((a, b) => {
    const aLive = liveStatuses.has(a.company_status) ? 0 : 1;
    const bLive = liveStatuses.has(b.company_status) ? 0 : 1;
    return aLive - bLive;
  });
  return sorted[0];
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
  const record = cro ? await lookupByCroNumber(cro) : await lookupByName(trimmed);

  const output = {
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

  const filterRef = encodeURIComponent(JSON.stringify({ company_num: record.company_num }));
  const primarySourceUrl = `${CRO_DATASTORE_API}?resource_id=${CRO_RESOURCE_ID}&filters=${filterRef}`;

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
