import { registerCapability, type CapabilityInput } from "./index.js";

// GEMI Open Data API — Γενικό Εμπορικό Μητρώο (Greek Business Registry)
// Operated by GEMI/UHC under the Greek Ministry of Development.
// Licence: ODC-BY-1.0 (commercial use permitted with attribution).
// Rate limit: 8 req/min (raise via support@uhc.gr if needed).
const GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";

const GEMI_NUMBER_RE = /^\d{6,14}$/;
const AFM_RE = /^\d{9}$/;

interface GemiActivity {
  activity?: { id?: number | string; descr?: string };
  type?: string;
  dtFrom?: string;
  dtTo?: string | null;
}

interface GemiPerson {
  personName?: string;
  businessName?: string;
  role?: string;
  dtFrom?: string;
  dtTo?: string | null;
}

interface GemiEnum {
  id?: number | string;
  descr?: string;
}

interface GemiCompany {
  arGemi?: string;
  afm?: string;
  coNameEl?: string;
  coNamesEn?: string[];
  coTitlesEl?: string[];
  coTitlesEn?: string[];
  legalType?: GemiEnum;
  status?: GemiEnum;
  gemiOffice?: GemiEnum;
  municipality?: GemiEnum;
  incorporationDate?: string;
  lastStatusChange?: string;
  city?: string;
  zipCode?: string;
  street?: string;
  streetNumber?: string;
  phone?: string;
  url?: string;
  email?: string;
  objective?: string;
  isBranch?: boolean;
  activities?: GemiActivity[];
  persons?: GemiPerson[];
}

function normaliseGemiNumber(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return GEMI_NUMBER_RE.test(cleaned) ? cleaned : null;
}

function normaliseAfm(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return AFM_RE.test(cleaned) ? cleaned : null;
}

async function gemiFetch(path: string): Promise<unknown> {
  const apiKey = process.env.GEMI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMI_API_KEY environment variable is required for greek-company-data.");
  }
  const url = `${GEMI_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { api_key: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) {
    throw new Error("GEMI API returned 401 Unauthorized — check GEMI_API_KEY value.");
  }
  if (response.status === 429) {
    throw new Error("GEMI API rate limit exceeded (8 req/min). Retry after a short wait.");
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GEMI API returned HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchByGemiNumber(arGemi: string): Promise<GemiCompany | null> {
  const data = await gemiFetch(`/companies/${encodeURIComponent(arGemi)}`);
  if (!data || typeof data !== "object") return null;
  return data as GemiCompany;
}

async function searchByAfm(afm: string): Promise<GemiCompany | null> {
  const data = await gemiFetch(`/companies?afm=${encodeURIComponent(afm)}&resultsSize=1`);
  if (!data || typeof data !== "object") return null;
  const results = (data as { searchResults?: GemiCompany[] }).searchResults;
  if (!Array.isArray(results) || results.length === 0) return null;
  return results[0];
}

function pickCompanyName(company: GemiCompany): string {
  if (company.coNameEl) return company.coNameEl;
  const enName = company.coNamesEn?.[0];
  if (enName) return enName;
  const titleEl = company.coTitlesEl?.[0];
  if (titleEl) return titleEl;
  const titleEn = company.coTitlesEn?.[0];
  if (titleEn) return titleEn;
  return "";
}

function buildAddress(company: GemiCompany): string {
  const parts: string[] = [];
  const streetLine = [company.street, company.streetNumber].filter(Boolean).join(" ").trim();
  if (streetLine) parts.push(streetLine);
  const cityLine = [company.zipCode, company.city].filter(Boolean).join(" ").trim();
  if (cityLine) parts.push(cityLine);
  if (company.municipality?.descr && company.municipality.descr !== company.city) {
    parts.push(company.municipality.descr);
  }
  return parts.join(", ");
}

function pickPrimaryActivity(activities: GemiActivity[] | undefined): {
  id: string | null;
  description: string | null;
} {
  if (!activities || activities.length === 0) return { id: null, description: null };
  const primary = activities.find((a) => a.type === "Κύρια") ?? activities[0];
  const id = primary.activity?.id;
  return {
    id: id !== undefined && id !== null ? String(id) : null,
    description: primary.activity?.descr ?? null,
  };
}

function summariseDirectors(persons: GemiPerson[] | undefined): string[] {
  if (!persons || persons.length === 0) return [];
  // Filter out terminated roles (dtTo set to a real date)
  const active = persons.filter((p) => !p.dtTo);
  const source = active.length > 0 ? active : persons;
  return source
    .map((p) => {
      const name = p.personName ?? p.businessName ?? "";
      if (!name) return null;
      return p.role ? `${name} (${p.role})` : name;
    })
    .filter((s): s is string => Boolean(s));
}

function deriveStatus(company: GemiCompany): string {
  const descr = company.status?.descr?.toLowerCase() ?? "";
  if (!descr) return "unknown";
  if (descr.includes("ενεργ")) return "active"; // Ενεργή
  if (descr.includes("διαγραφ") || descr.includes("λυσ")) return "dissolved"; // Διαγραφή / Λύση
  if (descr.includes("πτωχ")) return "bankrupt"; // Πτώχευση
  if (descr.includes("εκκαθ")) return "liquidation"; // Εκκαθάριση
  return company.status?.descr ?? "unknown";
}

function mapToOutput(company: GemiCompany): Record<string, unknown> {
  const activity = pickPrimaryActivity(company.activities);
  return {
    company_name: pickCompanyName(company),
    org_number: company.arGemi ?? "",
    vat_number: company.afm ? `EL${company.afm}` : null,
    afm: company.afm ?? null,
    business_type: company.legalType?.descr ?? null,
    address: buildAddress(company),
    registration_date: company.incorporationDate ?? null,
    industry_code: activity.id,
    industry_description: activity.description,
    status: deriveStatus(company),
    directors: summariseDirectors(company.persons),
    is_branch: company.isBranch ?? false,
  };
}

registerCapability("greek-company-data", async (input: CapabilityInput) => {
  const gemiInput =
    (input.gemi_number as string) ??
    (input.org_number as string) ??
    (input.ar_gemi as string) ??
    "";
  const afmInput = (input.afm as string) ?? (input.tax_id as string) ?? "";

  if (
    (typeof gemiInput !== "string" || !gemiInput.trim()) &&
    (typeof afmInput !== "string" || !afmInput.trim())
  ) {
    throw new Error(
      "Provide either 'gemi_number' (Greek GEMI registry number) or 'afm' (Greek tax ID, 9 digits).",
    );
  }

  let company: GemiCompany | null = null;
  let resolvedFrom: "gemi_number" | "afm" = "gemi_number";

  if (typeof gemiInput === "string" && gemiInput.trim()) {
    const arGemi = normaliseGemiNumber(gemiInput);
    if (!arGemi) {
      throw new Error(
        `'gemi_number' must be 6-14 digits. Received: "${gemiInput}".`,
      );
    }
    company = await fetchByGemiNumber(arGemi);
    if (!company) {
      throw new Error(`No Greek company found with GEMI number ${arGemi}.`);
    }
  } else if (typeof afmInput === "string" && afmInput.trim()) {
    const afm = normaliseAfm(afmInput);
    if (!afm) {
      throw new Error(`'afm' must be exactly 9 digits. Received: "${afmInput}".`);
    }
    company = await searchByAfm(afm);
    if (!company) {
      throw new Error(`No Greek company found with AFM ${afm}.`);
    }
    resolvedFrom = "afm";
  }

  if (!company) {
    throw new Error("Failed to resolve Greek company.");
  }

  const output = mapToOutput(company);

  return {
    output,
    provenance: {
      source: "opendata-api.businessportal.gr",
      fetched_at: new Date().toISOString(),
      resolved_from: resolvedFrom,
    },
  };
});
