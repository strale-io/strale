import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Latvian company data via the data.gov.lv CKAN datastore API.
 *
 * Free, real-time JSON, no signup required. Data is published by Latvia's
 * Enterprise Register (Uzņēmumu reģistrs) under CC0 1.0 (public domain),
 * which permits unrestricted commercial use. Daily refresh covers active
 * and historical entities (~480k records).
 *
 * Replaces the prior Browserless+Claude scrape of info.ur.gov.lv which was
 * a Tier 1 violation per DEC-20260428-A. This implementation is
 * `acquisition_method: direct_api`.
 */

const LV_DATASTORE_API = "https://data.gov.lv/dati/api/3/action/datastore_search";
// Resource ID for "Uzņēmumu reģistra atvērtie dati" on data.gov.lv.
const LV_RESOURCE_ID = "25e80bf3-f107-4ab4-89ef-251b5b9374e9";

// Latvian unified registration number: 11 digits.
const REG_RE = /^\d{11}$/;

function findReg(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (REG_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{11}/);
  return match && REG_RE.test(match[0]) ? match[0] : null;
}

interface LvRecord {
  regcode: string | number;
  sepa: string | null;
  name: string | null;
  name_before_quotes: string | null;
  name_in_quotes: string | null;
  name_after_quotes: string | null;
  regtype: string | null;
  regtype_text: string | null;
  type: string | null;
  type_text: string | null;
  registered: string | null;
  terminated: string | null;
  closed: string | null;
  address: string | null;
  index: string | number | null;
  addressid: string | number | null;
  region: string | number | null;
  city: string | number | null;
  atvk: string | number | null;
  reregistration_term: string | null;
}

interface DatastoreResponse {
  success: boolean;
  result: { records: LvRecord[]; total?: number };
}

async function callDatastore(qs: URLSearchParams): Promise<LvRecord[]> {
  qs.set("resource_id", LV_RESOURCE_ID);
  const url = `${LV_DATASTORE_API}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Latvian Open Data Portal returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as DatastoreResponse;
  if (!data.success) {
    throw new Error("Latvian Open Data Portal returned success=false");
  }
  return data.result.records ?? [];
}

async function lookupByRegcode(regcode: string): Promise<LvRecord> {
  const filters = JSON.stringify({ regcode });
  const records = await callDatastore(new URLSearchParams({ filters, limit: "1" }));
  if (!records.length) {
    throw new Error(`No Latvian company found for registration number ${regcode}.`);
  }
  return records[0];
}

async function lookupByName(name: string): Promise<LvRecord> {
  const records = await callDatastore(new URLSearchParams({ q: name, limit: "10" }));
  if (!records.length) {
    throw new Error(`No Latvian company found matching "${name}".`);
  }
  // Prefer entries with no termination date when multiple matches.
  const sorted = [...records].sort((a, b) => {
    const aActive = a.terminated ? 1 : 0;
    const bActive = b.terminated ? 1 : 0;
    return aActive - bActive;
  });
  return sorted[0];
}

function toIsoDate(timestamp: string | null): string | null {
  return timestamp ? timestamp.slice(0, 10) : null;
}

function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveStatus(record: LvRecord): string {
  if (record.terminated) return "Likvidēts";
  if (clean(record.closed)) return "Slēgts";
  return "Reģistrēts";
}

registerCapability("latvian-company-data", async (input: CapabilityInput) => {
  const raw =
    (input.reg_number as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "'reg_number' or 'company_name' is required. Provide a Latvian registration number (11 digits) or company name.",
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    throw new Error("Input must be at least 2 characters.");
  }

  const reg = findReg(trimmed);
  const record = reg ? await lookupByRegcode(reg) : await lookupByName(trimmed);

  const output = {
    company_name: clean(record.name),
    reg_number: String(record.regcode),
    company_type: clean(record.type_text),
    company_type_code: clean(record.type),
    register_type: clean(record.regtype_text),
    status: deriveStatus(record),
    address: clean(record.address),
    postal_index: record.index != null ? String(record.index) : null,
    registration_date: toIsoDate(record.registered),
    termination_date: toIsoDate(record.terminated),
    sepa_creditor_id: clean(record.sepa),
    atvk_code: record.atvk != null ? String(record.atvk) : null,
    jurisdiction: "LV",
  };

  const filterRef = encodeURIComponent(JSON.stringify({ regcode: String(record.regcode) }));
  const primarySourceUrl = `${LV_DATASTORE_API}?resource_id=${LV_RESOURCE_ID}&filters=${filterRef}`;

  return {
    output,
    provenance: {
      source: "data.gov.lv",
      source_url: "https://data.gov.lv/dati/lv/dataset/uz",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: primarySourceUrl,
      license: "CC0 1.0",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      attribution: "Uzņēmumu reģistrs (Latvian Enterprise Register) — data.gov.lv",
      source_note:
        "Daily snapshot from the Latvian Open Data Portal (data.gov.lv) — Uzņēmumu reģistra atvērtie dati. Real-time API via CKAN datastore_search.",
    },
  };
});
