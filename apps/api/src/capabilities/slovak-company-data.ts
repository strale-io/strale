import { registerCapability, type CapabilityInput } from "./index.js";
// Czech and Slovak IČO share the 8-digit zero-padded format inherited from
// pre-1993 Czechoslovakia. The checksum rules differ (cz-validation also
// exports isValidIcoChecksum, which is Czech-specific and not used here).
import { normalizeIco } from "../lib/cz-validation.js";

// Slovak Register of Legal Persons (Register právnických osôb / RPO)
// Operated by the Statistical Office of the Slovak Republic (ŠÚ SR).
// Data licensed under CC-BY 4.0 per Act 272/2015 § 7 and § 7a.
// Free, no auth. Documented at https://susrrpo.docs.apiary.io/.
// Unauthenticated access limited to 60 req/min/IP.
const RPO_API = "https://api.statistics.sk/rpo/v1";

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

interface RpoAddress extends ValidityWindow {
  street?: string;
  buildingNumber?: string;
  postalCodes?: string[];
  municipality?: { value?: string; code?: string };
  country?: { value?: string; code?: string };
}

interface RpoLegalForm extends ValidityWindow {
  value: { value?: string; code?: string };
}

interface RpoStatutoryBody extends ValidityWindow {
  personName?: { formatedName?: string };
}

interface RpoSearchResultEntry {
  id: number;
}

interface RpoSearchResponse {
  results?: RpoSearchResultEntry[];
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
    mainActivity?: { value?: string; code?: string };
  };
}

/**
 * Pick the current entry from a time-versioned RPO array. RPO returns each
 * field as an array of historical values, where the active value has no
 * validTo. Picking the entry whose validFrom is the most recent and whose
 * validTo is unset gives the current value; if every entry is closed (rare:
 * dissolved companies), we still return the most recent one for context.
 */
function pickCurrent<T extends ValidityWindow>(items: T[] | undefined): T | undefined {
  if (!items || items.length === 0) return undefined;
  const open = items.filter((x) => !x.validTo);
  const pool = open.length > 0 ? open : items;
  return pool.reduce<T | undefined>((best, x) => {
    if (!best) return x;
    return (x.validFrom ?? "") > (best.validFrom ?? "") ? x : best;
  }, undefined);
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
    throw new Error(
      "Slovak RPO platform rate limit reached (60 req/min, shared across Strale's egress). " +
        "Retry in 10–60 seconds.",
    );
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

/**
 * RPO does not publish an explicit active/dissolved flag at the entity
 * root. A deleted entity has its final address, legal form, and identifier
 * closed out with a validTo. If all three current entries are still open,
 * the company is treated as active.
 */
function deriveStatus(
  addr: RpoAddress | undefined,
  form: RpoLegalForm | undefined,
  ident: RpoIdentifier | undefined,
): string {
  return [addr, form, ident].every((x) => x && !x.validTo) ? "active" : "inactive";
}

registerCapability("slovak-company-data", async (input: CapabilityInput) => {
  const raw = ((input.ico as string) ?? (input.company_number as string) ?? "").toString().trim();
  if (!raw) {
    throw new Error("'ico' is required. Provide a Slovak IČO (8 digits).");
  }
  // normalizeIco zero-pads 1-7 digit numeric input to 8. Real Slovak IČOs go
  // as low as 5 significant digits (e.g. 00151653), so we tolerate short
  // input but reject obvious junk (<4 digits) before firing the API call.
  const stripped = raw.replace(/[\s.-]/g, "");
  const ico = normalizeIco(raw);
  if (!ico || stripped.length < 4) {
    throw new Error(
      `'${raw}' is not a valid IČO. Slovak IČO is 8 digits (zero-padded).`,
    );
  }

  const id = await findInternalId(ico);
  const entity = await fetchEntity(id);

  const currentName = pickCurrent(entity.fullNames);
  const currentAddress = pickCurrent(entity.addresses);
  const currentLegalForm = pickCurrent(entity.legalForms);
  const currentIdentifier = pickCurrent(entity.identifiers);
  const currentRegOffice = pickCurrent(entity.sourceRegister?.registrationOffices);
  const currentRegNumber = pickCurrent(entity.sourceRegister?.registrationNumbers);
  const directors = (entity.statutoryBodies ?? []).flatMap((b) =>
    !b.validTo && b.personName?.formatedName ? [b.personName.formatedName] : [],
  );

  return {
    output: {
      ico,
      company_name: currentName?.value ?? "",
      address: formatAddress(currentAddress),
      legal_form: currentLegalForm?.value?.value ?? null,
      legal_form_code: currentLegalForm?.value?.code ?? null,
      registration_date: entity.establishment ?? null,
      status: deriveStatus(currentAddress, currentLegalForm, currentIdentifier),
      source_register: entity.sourceRegister?.value?.value ?? null,
      registration_office: currentRegOffice?.value ?? null,
      registration_number: currentRegNumber?.value ?? null,
      nace_code: entity.statisticalCodes?.mainActivity?.code ?? null,
      nace_description: entity.statisticalCodes?.mainActivity?.value ?? null,
      directors,
      last_updated: entity.dbModificationDate ?? null,
      jurisdiction: "SK",
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
