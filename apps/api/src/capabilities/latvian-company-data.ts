import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatLV } from "../lib/vat-derivation.js";
import { logWarn } from "../lib/log.js";

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
// Resource ID for the officers dataset ("Tiesību subjekta valdes locekļu,
// pārstāvēttiesīgo biedru vai citu pārstāvēttiesīgo personu saraksts") —
// package `officers`, publisher LR Uzņēmumu reģistrs, CC0 1.0, datastore-
// queryable. Lists CURRENT representation-entitled persons only (no history).
// Verified live 2026-08-12: airBaltic (40003245752) → 2 board members.
const LV_OFFICERS_RESOURCE_ID = "e665114a-73c2-4375-9470-55874b4cfa6b";

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

interface LvOfficerRecord {
  name?: string | null;
  position?: string | null;
  governing_body?: string | null;
  entity_type?: string | null;
  rights_of_representation_type?: string | null;
  representation_with_at_least?: string | number | null;
  registered_on?: string | null;
  // latvian_identity_number_masked exists upstream but is deliberately never
  // read: even masked national IDs are data minimization we don't need.
}

interface LegalRepresentative {
  // Canonical cross-country shape (NO/CZ/EE/CY parity): type discriminator +
  // date_of_birth always present. DOB is deliberately null here — see the
  // manifest limitation (a Strale data-minimization choice, not an upstream
  // absence: the dataset publishes birth_date and masked personal codes,
  // which this handler never reads).
  type: "person" | "organisation";
  name: string;
  role: string;
  role_code: string | null;
  role_group: string;
  rights_of_representation: string | null;
  representation_with_at_least: number | null;
  start_date: string | null;
  date_of_birth: null;
}

// Maps (not object literals) to avoid prototype-key collisions on
// upstream-controlled strings ("constructor" would resolve on an object).
const LV_POSITION_LABELS = new Map<string, string>([
  ["BOARD_MEMBER", "Board member"],
  ["CHAIR_OF_BOARD", "Chair of the board"],
  ["DEPUTY_CHAIR_OF_BOARD", "Deputy chair of the board"],
]);

// role_group tokens follow the EE vocabulary (management_board /
// supervisory_council) so cross-country grouping works; a shared enum for
// all six countries is queued follow-up work.
const LV_BODY_GROUPS = new Map<string, string>([
  ["EXECUTIVE_BOARD", "management_board"],
  ["SUPERVISORY_BOARD", "supervisory_council"],
]);

interface LvOfficersResult {
  representatives: LegalRepresentative[];
  total: number;
}

/**
 * Fetch current representation-entitled persons (board members etc.) for an
 * entity from the UR officers dataset. Best-effort: a failure here degrades
 * tier_2_available and yields NULL fields (never a fake empty list — "0
 * officers" and "lookup failed" are materially different KYB answers), and
 * the swallow is logged so it is visible in prod (DEC-20260504-A).
 */
async function fetchLegalRepresentatives(regcode: string): Promise<LvOfficersResult | null> {
  try {
    const filters = JSON.stringify({ at_legal_entity_registration_number: Number(regcode) });
    const qs = new URLSearchParams({
      resource_id: LV_OFFICERS_RESOURCE_ID,
      filters,
      limit: "50",
    });
    const res = await fetch(`${LV_DATASTORE_API}?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logWarn("lv-officers-fetch", `officers datastore returned HTTP ${res.status}`, { regcode });
      return null;
    }
    const data = (await res.json()) as {
      success: boolean;
      result?: { records?: LvOfficerRecord[]; total?: number };
    };
    if (!data.success) {
      logWarn("lv-officers-fetch", "officers datastore returned success=false", { regcode });
      return null;
    }
    const records = data.result?.records ?? [];
    const representatives = records
      .filter((r) => clean(r.name ?? null))
      .map((r): LegalRepresentative => {
        const position = clean(r.position ?? null);
        const body = clean(r.governing_body ?? null);
        const atLeast = r.representation_with_at_least;
        return {
          type: clean(r.entity_type ?? null) === "LEGAL_ENTITY" ? "organisation" : "person",
          name: (r.name as string).trim(),
          role: (position ? LV_POSITION_LABELS.get(position) : null) ?? position ?? body ?? "Representative",
          role_code: position,
          role_group: (body ? LV_BODY_GROUPS.get(body) : null) ?? "representation",
          rights_of_representation: clean(r.rights_of_representation_type ?? null),
          representation_with_at_least:
            atLeast != null && atLeast !== "" && Number.isFinite(Number(atLeast)) ? Number(atLeast) : null,
          start_date: r.registered_on ? String(r.registered_on).slice(0, 10) : null,
          date_of_birth: null,
        };
      });
    // CKAN reports the true total; if it exceeds our page the count field
    // stays honest even though the array is truncated.
    return { representatives, total: data.result?.total ?? representatives.length };
  } catch (err) {
    logWarn("lv-officers-fetch", `officers datastore query failed: ${(err as Error).message}`, { regcode });
    return null;
  }
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

  const regNum = String(record.regcode);
  const officersResult = await fetchLegalRepresentatives(regNum);
  const output = {
    company_name: clean(record.name),
    reg_number: regNum,
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
    vat_number: deriveVatLV(regNum),
    // null (not []) when the officers query failed: "no officers" is an
    // affirmative claim this response cannot make in that case.
    legal_representatives: officersResult?.representatives ?? null,
    total_legal_representatives: officersResult?.total ?? null,
    jurisdiction: "LV",
  };

  const filterRef = encodeURIComponent(JSON.stringify({ regcode: String(record.regcode) }));
  const primarySourceUrl = `${LV_DATASTORE_API}?resource_id=${LV_RESOURCE_ID}&filters=${filterRef}`;

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
    if (officersResult === null) {
      o.tier_2_available = false;
      o.tier_2_available_reason =
        "officers dataset query failed on this call — representation data temporarily unavailable, retry later";
    } else if (officersResult.representatives.length === 0) {
      o.tier_2_available = false;
      o.tier_2_available_reason =
        "no current representation-entitled persons listed for this entity in the UR officers dataset";
    } else {
      o.tier_2_available = true;
      o.tier_2_available_reason =
        "current board members / representation-entitled persons from the UR officers dataset (data.gov.lv, CC0 1.0)";
    }
    o.ubo_availability = "unavailable_no_registry";
    o.ubo_availability_reason = "Programmatic UBO access not yet operational at v1; verification pending public-source confirmation";
  }

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
