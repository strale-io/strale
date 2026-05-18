import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Slovenian company data via the data.gov.si CKAN datastore API.
 *
 * Free, real-time JSON, no signup required. Data is published by AJPES
 * (Agencija Republike Slovenije za javnopravne evidence in storitve)
 * under CC-BY 4.0, which permits commercial redistribution with
 * attribution. The dataset is the open subset of the Poslovni register
 * Slovenije (PRS) per Zakon o Poslovnem registru Slovenije (ZPRS-1).
 *
 * Coverage caveat: AJPES publishes only the statutory open-data subset
 * — registration number, full name, address, legal form, and registry
 * authority. Status, registration date, NACE/SKD, directors, and VAT
 * are NOT in this dataset. Customers needing those fields must use the
 * paid AJPES restPrsInfo service (out of scope per DEC-20260507-A —
 * AJPES ToU §7 prohibits redistribution under that contract).
 */

const SI_DATASTORE_API = "https://podatki.gov.si/api/3/action/datastore_search";
// Resource ID for the "Poslovni register" CSV on podatki.gov.si.
const SI_RESOURCE_ID = "beb70929-3d0d-41c6-9af2-25d525d906d3";

// Matična številka: 7 digits identify the entity; an optional 3-digit
// suffix identifies the establishment (000 = main entity, 001-999 =
// branches). The published dataset uses the 10-digit form throughout.
const REG_RE = /^\d{10}$/;

function findReg(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (REG_RE.test(cleaned)) return cleaned;
  // Accept the bare 7-digit form by appending the main-entity suffix.
  if (/^\d{7}$/.test(cleaned)) return `${cleaned}000`;
  const tenDigit = input.match(/\d{10}/);
  if (tenDigit) return tenDigit[0];
  const sevenDigit = input.match(/\b\d{7}\b/);
  return sevenDigit ? `${sevenDigit[0]}000` : null;
}

interface SiRecord {
  "Matična številka": string;
  "Popolno ime": string | null;
  HSEID: string | null;
  "Pravnoorganizacijska oblika": string | null;
  "Registrski organ": string | null;
  Ulica: string | null;
  "Hišna št": string | null;
  "Hišna št  dodatek": string | null;
  Naselje: string | null;
  "Poštna št": string | null;
  Pošta: string | null;
  Država: string | null;
}

interface DatastoreResponse {
  success: boolean;
  result: { records: SiRecord[]; total?: number };
}

async function callDatastore(qs: URLSearchParams): Promise<SiRecord[]> {
  qs.set("resource_id", SI_RESOURCE_ID);
  const url = `${SI_DATASTORE_API}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Slovenian Open Data Portal returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as DatastoreResponse;
  if (!data.success) {
    throw new Error("Slovenian Open Data Portal returned success=false");
  }
  return data.result.records ?? [];
}

async function lookupByRegNumber(reg: string): Promise<SiRecord> {
  const filters = JSON.stringify({ "Matična številka": reg });
  const records = await callDatastore(new URLSearchParams({ filters, limit: "1" }));
  if (!records.length) {
    throw new Error(`No Slovenian company found for matična številka ${reg}.`);
  }
  return records[0];
}

async function lookupByName(name: string): Promise<SiRecord> {
  const records = await callDatastore(new URLSearchParams({ q: name, limit: "10" }));
  if (!records.length) {
    throw new Error(`No Slovenian company found matching "${name}".`);
  }
  // CKAN keyword search ranks by relevance. The first hit is the best
  // match; no further sorting signal is available because the source
  // dataset has no status / activity column to prefer active entities.
  return records[0];
}

function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatAddress(r: SiRecord): string | null {
  const street = [clean(r.Ulica), clean(r["Hišna št"]), clean(r["Hišna št  dodatek"])]
    .filter((p): p is string => p !== null)
    .join(" ")
    .trim();
  const postal = [clean(r["Poštna št"]), clean(r.Pošta)]
    .filter((p): p is string => p !== null)
    .join(" ")
    .trim();
  const city = clean(r.Naselje);
  const country = clean(r.Država);
  // Avoid duplicating city when Pošta and Naselje are identical (common
  // for entities in the same locality as their post office).
  const settlementLine = city && city !== clean(r.Pošta) ? city : "";
  const parts = [street, settlementLine, postal, country].filter(
    (p): p is string => p !== null && p.length > 0,
  );
  return parts.length ? parts.join(", ") : null;
}

registerCapability("slovenian-company-data", async (input: CapabilityInput) => {
  const raw =
    (input.reg_number as string) ??
    (input.matricna_stevilka as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "'reg_number' or 'company_name' is required. Provide a Slovenian matična številka (7 or 10 digits) or company name.",
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    throw new Error("Input must be at least 2 characters.");
  }

  const reg = findReg(trimmed);
  const record = reg ? await lookupByRegNumber(reg) : await lookupByName(trimmed);

  const output = {
    company_name: clean(record["Popolno ime"]),
    reg_number: clean(record["Matična številka"]),
    hseid: clean(record.HSEID),
    legal_form: clean(record["Pravnoorganizacijska oblika"]),
    registration_office: clean(record["Registrski organ"]),
    address: formatAddress(record),
    settlement: clean(record.Naselje),
    postal_code: clean(record["Poštna št"]),
    post_office: clean(record.Pošta),
    country: clean(record.Država),
    jurisdiction: "SI",
  };

  const filterRef = encodeURIComponent(
    JSON.stringify({ "Matična številka": output.reg_number ?? "" }),
  );
  const primarySourceUrl = `${SI_DATASTORE_API}?resource_id=${SI_RESOURCE_ID}&filters=${filterRef}`;

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
    o.tier_2_available_reason = "data.gov.si CKAN PRS dataset does not expose directors";
    o.ubo_availability = "unavailable_no_registry";
    o.ubo_availability_reason = "PRS dataset does not expose UBO data programmatically";
  }

  return {
    output,
    provenance: {
      source: "podatki.gov.si",
      source_url: "https://podatki.gov.si/dataset/poslovni-register-slovenije",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: primarySourceUrl,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/legalcode",
      attribution:
        "Poslovni register Slovenije, AGENCIJA REPUBLIKE SLOVENIJE ZA JAVNOPRAVNE EVIDENCE IN STORITVE",
      source_note:
        "Open subset of the Poslovni register Slovenije (PRS) per Zakon o Poslovnem registru Slovenije (ZPRS-1), refreshed twice monthly. Real-time API via CKAN datastore_search. Source coverage is limited to registration number, full name, address, legal form, and registry authority — see manifest limitations.",
    },
  };
});
