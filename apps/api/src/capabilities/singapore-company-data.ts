import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Singapore company data via the data.gov.sg CKAN datastore_search API.
 *
 * Free, monthly-refresh JSON, no signup required. Data is the
 * "Entities Registered with ACRA" dataset published by Singapore's
 * Accounting and Corporate Regulatory Authority on data.gov.sg under
 * the Singapore Open Data Licence (commercial reuse permitted with
 * attribution). ~2.1M records; covers active and deregistered
 * entities since the UEN was introduced.
 *
 * Replaces the prior Browserless scrape of opencorporates.com which
 * was a Tier-1 violation per DEC-20260428-A. This implementation is
 * `acquisition_method: direct_api`.
 */

const SG_DATASTORE_API = "https://data.gov.sg/api/action/datastore_search";
// Resource ID for "Entities Registered with ACRA".
const SG_RESOURCE_ID = "d_3f960c10fed6145404ca7b821f263b87";

// UEN formats per ACRA:
//   Old (pre-2009 businesses):  NNNNNNNNX or NNNNNNNNNX  (9-10 chars)
//   Modern companies:            YYYYNNNNNX                (10 chars)
//   Trust/Society/Foreign etc.:  TYYxxNNNNX, SYYxxNNNNX, FNNNNNNNNX  (10 chars)
// We accept any 9-10 char alphanumeric uppercase token; the API resolves real UENs.
const UEN_RE = /^[A-Z0-9]{9,10}$/;

function findUen(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").toUpperCase();
  if (UEN_RE.test(cleaned)) return cleaned;
  const match = input.toUpperCase().match(/[A-Z0-9]{9,10}/);
  return match && UEN_RE.test(match[0]) ? match[0] : null;
}

interface SgRecord {
  uen: string;
  issuance_agency_desc: string | null;
  uen_status_desc: string | null;
  entity_name: string | null;
  entity_type_desc: string | null;
  uen_issue_date: string | null;
  reg_street_name: string | null;
  reg_postal_code: string | null;
}

interface DatastoreResponse {
  success: boolean;
  result: { records: SgRecord[]; total?: number };
}

async function callDatastore(params: Record<string, string>): Promise<SgRecord[]> {
  const qs = new URLSearchParams({ resource_id: SG_RESOURCE_ID, ...params });
  const url = `${SG_DATASTORE_API}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        "Singapore registry lookup is currently rate-limited (data.gov.sg). Please retry in a few seconds.",
      );
    }
    throw new Error(`data.gov.sg returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as DatastoreResponse;
  if (!data.success) {
    throw new Error("data.gov.sg returned success=false");
  }
  return data.result.records ?? [];
}

async function lookupByUen(uen: string): Promise<SgRecord> {
  const filters = JSON.stringify({ uen });
  const records = await callDatastore({ filters, limit: "1" });
  if (!records.length) {
    throw new Error(`No Singapore entity found for UEN ${uen}.`);
  }
  return records[0];
}

async function lookupByName(name: string): Promise<SgRecord> {
  const records = await callDatastore({ q: name, limit: "20" });
  if (!records.length) {
    throw new Error(`No Singapore entity found matching "${name}".`);
  }
  // Full-text search ranks loosely — prefer exact-substring + Registered status.
  const upper = name.toUpperCase();
  const sorted = [...records].sort((a, b) => {
    const aSub = (a.entity_name ?? "").toUpperCase().includes(upper) ? 0 : 1;
    const bSub = (b.entity_name ?? "").toUpperCase().includes(upper) ? 0 : 1;
    if (aSub !== bSub) return aSub - bSub;
    const aLive = a.uen_status_desc === "Registered" ? 0 : 1;
    const bLive = b.uen_status_desc === "Registered" ? 0 : 1;
    return aLive - bLive;
  });
  return sorted[0];
}

function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatAddress(record: SgRecord): string | null {
  const street = clean(record.reg_street_name);
  const postal = clean(record.reg_postal_code);
  if (!street && !postal) return null;
  return [street, postal && `Singapore ${postal}`].filter(Boolean).join(", ");
}

registerCapability("singapore-company-data", async (input: CapabilityInput) => {
  const raw =
    (input.uen as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "'uen' or 'company_name' is required. Provide a Singapore UEN (9-10 alphanumeric) or entity name.",
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    throw new Error("Input must be at least 2 characters.");
  }

  const uen = findUen(trimmed);
  const record = uen ? await lookupByUen(uen) : await lookupByName(trimmed);

  const output = {
    entity_name: clean(record.entity_name),
    uen: clean(record.uen) ?? record.uen,
    entity_type: clean(record.entity_type_desc),
    status: clean(record.uen_status_desc),
    is_active: record.uen_status_desc === "Registered",
    issuance_agency: clean(record.issuance_agency_desc),
    uen_issue_date: clean(record.uen_issue_date),
    registered_street: clean(record.reg_street_name),
    registered_postal_code: clean(record.reg_postal_code),
    registered_address: formatAddress(record),
    jurisdiction: "SG",
  };

  const filterRef = encodeURIComponent(JSON.stringify({ uen: record.uen }));
  const primarySourceUrl = `${SG_DATASTORE_API}?resource_id=${SG_RESOURCE_ID}&filters=${filterRef}`;

  return {
    output,
    provenance: {
      source: "data.gov.sg",
      source_url:
        "https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: primarySourceUrl,
      license: "Singapore Open Data Licence v1.0",
      license_url: "https://data.gov.sg/open-data-licence",
      attribution:
        "Accounting and Corporate Regulatory Authority (ACRA) — Entities Registered with ACRA, via data.gov.sg",
      source_note:
        "Monthly snapshot from the data.gov.sg ACRA Entities dataset. Real-time API via CKAN datastore_search.",
    },
  };
});
