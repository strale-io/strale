import { registerCapability, type CapabilityInput } from "./index.js";

// Slovak Register of Legal Persons (Register právnických osôb / RPO)
// Operated by the Statistical Office of the Slovak Republic (ŠÚ SR).
// Data licensed under CC-BY 4.0 per Act 272/2015 § 7 and § 7a.
// Free, no auth. Documented at https://susrrpo.docs.apiary.io/.
// Unauthenticated access limited to 60 req/min/IP.
const RPO_API = "https://api.statistics.sk/rpo/v1";

const ICO_RE = /^\d{8}$/;

interface ValidityWindow {
  validFrom?: string;
  validTo?: string;
}

interface RpoIdentifier extends ValidityWindow {
  value: string;
}

interface RpoFullName extends ValidityWindow {
  value: string;
}

interface RpoMunicipality {
  value?: string;
  code?: string;
}

interface RpoCountry {
  value?: string;
  code?: string;
}

interface RpoAddress extends ValidityWindow {
  street?: string;
  buildingNumber?: string;
  regNumber?: number;
  postalCodes?: string[];
  municipality?: RpoMunicipality;
  country?: RpoCountry;
}

interface RpoLegalForm extends ValidityWindow {
  value: { value?: string; code?: string };
}

interface RpoStatutoryBody extends ValidityWindow {
  stakeholderType?: { value?: string; code?: string };
  personName?: { formatedName?: string; familyNames?: string[]; givenNames?: string[] };
}

interface RpoSearchResultEntry {
  id: number;
  dbModificationDate?: string;
  identifiers?: RpoIdentifier[];
  fullNames?: RpoFullName[];
}

interface RpoSearchResponse {
  results?: RpoSearchResultEntry[];
  license?: string;
}

interface RpoEntity {
  id: number;
  dbModificationDate?: string;
  identifiers?: RpoIdentifier[];
  fullNames?: RpoFullName[];
  addresses?: RpoAddress[];
  legalForms?: RpoLegalForm[];
  establishment?: string;
  statutoryBodies?: RpoStatutoryBody[];
  sourceRegister?: {
    value?: { value?: string; code?: string };
    registrationOffices?: Array<ValidityWindow & { value?: string }>;
    registrationNumbers?: Array<ValidityWindow & { value?: string }>;
  };
  statisticalCodes?: {
    statCodesActualization?: string;
    mainActivity?: { value?: string; code?: string };
    esa2010?: { value?: string; code?: string };
  };
  license?: string;
}

function normalizeIco(raw: string): string | null {
  const digits = raw.replace(/[\s.-]/g, "");
  if (ICO_RE.test(digits)) return digits;
  // Pad short numerics with leading zeros (RPO IČOs are zero-padded to 8)
  if (/^\d{1,8}$/.test(digits)) return digits.padStart(8, "0");
  return null;
}

/**
 * Pick the current entry from a time-versioned RPO array. RPO returns each
 * field as an array of historical values, where the active value has no
 * validTo (or the latest validTo if all are bounded). Picking the entry
 * whose validFrom is the most recent and whose validTo is unset gives the
 * current value.
 */
function pickCurrent<T extends ValidityWindow>(items: T[] | undefined): T | undefined {
  if (!items || items.length === 0) return undefined;
  const open = items.filter((x) => !x.validTo);
  const pool = open.length > 0 ? open : items;
  return pool.reduce((best, x) => {
    if (!best) return x;
    const a = x.validFrom ?? "";
    const b = best.validFrom ?? "";
    return a > b ? x : best;
  }, undefined as T | undefined);
}

function formatAddress(addr: RpoAddress | undefined): string {
  if (!addr) return "";
  const street = [addr.street, addr.buildingNumber].filter(Boolean).join(" ").trim();
  const postal = (addr.postalCodes ?? [])[0] ?? "";
  const city = addr.municipality?.value ?? "";
  const country = addr.country?.value ?? "";
  return [street, [postal, city].filter(Boolean).join(" "), country].filter(Boolean).join(", ");
}

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (resp.status === 404) {
    throw new Error("Not found in Slovak RPO registry.");
  }
  if (resp.status === 429) {
    throw new Error("Slovak RPO rate limit exceeded (60 req/min unauthenticated). Retry shortly.");
  }
  if (!resp.ok) {
    throw new Error(`Slovak RPO returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

async function findInternalId(ico: string): Promise<number> {
  const data = await fetchJson<RpoSearchResponse>(
    `${RPO_API}/search?identifier=${encodeURIComponent(ico)}`,
  );
  const hit = data.results?.[0];
  if (!hit || typeof hit.id !== "number") {
    throw new Error(`No Slovak entity found with IČO ${ico}.`);
  }
  return hit.id;
}

async function fetchEntity(id: number): Promise<RpoEntity> {
  return fetchJson<RpoEntity>(`${RPO_API}/entity/${id}`);
}

function deriveStatus(entity: RpoEntity): string {
  // RPO does not publish an explicit active/dissolved flag at the entity root.
  // A current address (no validTo) is the strongest available proxy: a
  // company that has been deleted from the register has its final address
  // closed out with a validTo. Same goes for legal form and identifier.
  const addr = pickCurrent(entity.addresses);
  const form = pickCurrent(entity.legalForms);
  const ident = pickCurrent(entity.identifiers);
  const allCurrent = addr && !addr.validTo && form && !form.validTo && ident && !ident.validTo;
  return allCurrent ? "active" : "inactive";
}

registerCapability("slovak-company-data", async (input: CapabilityInput) => {
  const raw = ((input.ico as string) ?? (input.company_number as string) ?? "").toString().trim();
  if (!raw) {
    throw new Error("'ico' is required. Provide a Slovak IČO (8 digits).");
  }
  const ico = normalizeIco(raw);
  if (!ico) {
    throw new Error(
      `'${raw}' is not a valid IČO. Slovak IČO is 8 digits (zero-padded).`,
    );
  }

  const id = await findInternalId(ico);
  const entity = await fetchEntity(id);

  const currentName = pickCurrent(entity.fullNames);
  const currentAddress = pickCurrent(entity.addresses);
  const currentLegalForm = pickCurrent(entity.legalForms);
  const currentRegOffice = pickCurrent(entity.sourceRegister?.registrationOffices);
  const currentRegNumber = pickCurrent(entity.sourceRegister?.registrationNumbers);
  const directors = (entity.statutoryBodies ?? [])
    .filter((b) => !b.validTo)
    .map((b) => b.personName?.formatedName ?? "")
    .filter(Boolean);

  return {
    output: {
      ico,
      company_name: currentName?.value ?? "",
      address: formatAddress(currentAddress),
      legal_form: currentLegalForm?.value?.value ?? null,
      legal_form_code: currentLegalForm?.value?.code ?? null,
      registration_date: entity.establishment ?? null,
      status: deriveStatus(entity),
      source_register: entity.sourceRegister?.value?.value ?? null,
      registration_office: currentRegOffice?.value ?? null,
      registration_number: currentRegNumber?.value ?? null,
      nace_code: entity.statisticalCodes?.mainActivity?.code ?? null,
      nace_description: entity.statisticalCodes?.mainActivity?.value ?? null,
      directors,
      last_updated: entity.dbModificationDate ?? null,
    },
    provenance: {
      source: "api.statistics.sk/rpo",
      source_url: `${RPO_API}/entity/${id}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${RPO_API}/entity/${id}`,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/legalcode",
      attribution:
        "Source: Register of Legal Persons (Štatistický úrad SR / Statistical Office of the Slovak Republic), under CC-BY 4.0 (Act 272/2015 §§ 7, 7a).",
      source_note:
        "Slovak RPO is the single authoritative register of legal persons in Slovakia (since 1 Nov 2015), operated by ŠÚ SR. Designated as an EU High-Value Dataset under Reg. (EU) 2023/138.",
    },
  };
});
