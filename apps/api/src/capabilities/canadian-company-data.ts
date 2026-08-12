import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Canada — Corporations Canada (ISED)
//
// Numeric lookups use the OFFICIAL JSON API (no key, no rendering):
//   GET https://ised-isde.canada.ca/cc/lgcy/api/corporations/{id}.json?lang=eng
// It accepts a 7-digit corporation number OR a 9-digit business number and
// returns [englishData, null] — or, for unknown IDs, a plain array of two
// error STRINGS (not [data, null]), which is why the parser type-checks
// element 0. Verified live 2026-08-12 (corp 1007, 3000061).
//
// Named directors are NOT in the API response — only directorLimits
// (min/max). The web UI shows names, but scraping it is exactly the
// DEC-20260428-A/DEC-20260518-F question pending Petter's ruling, so
// tier_2_available stays false with an honest reason.
//
// The name-search path still Browserless-renders the site search (the API
// has no name search — probed 2026-08-12, non-JSON 302). Same page as
// before this migration; it is the remaining doctrine-gated surface here.
const CORP_API = "https://ised-isde.canada.ca/cc/lgcy/api/corporations";

// Corporation IDs are NOT fixed-width: modern CBCA corps have 7 digits but
// older federal corps have shorter IDs (corp 1007 = Abbotsford Chamber of
// Commerce, verified live). 9 digits = business number. Any all-digit input
// up to 9 digits goes to the API; embedded numbers only count at 7-9 digits
// (shorter embedded digit runs inside free text are too ambiguous).
const REGISTRY_NUM_RE = /^\d{1,9}$/;

export function findRegistryNumber(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (REGISTRY_NUM_RE.test(cleaned)) return cleaned;
  const match = input.match(/\b\d{7,9}\b/);
  return match ? match[0] : null;
}

interface CorpApiRecord {
  corporationId?: string;
  act?: string;
  status?: string;
  corporationNames?: Array<{
    CorporationName?: { name?: string; nameType?: string; current?: boolean; effectiveDate?: string };
  }>;
  // The API really does spell it "adresses" (verified live) — accept both.
  adresses?: Array<{ address?: ApiAddress }>;
  addresses?: Array<{ address?: ApiAddress }>;
  directorLimits?: { minimum?: number; maximum?: number };
  businessNumbers?: { businessNumber?: string };
  annualReturns?: Array<{ annualReturn?: { yearOfFiling?: string } }>;
  activities?: Array<{ activity?: { activity?: string; date?: string } }>;
}

interface ApiAddress {
  addressLine?: string[];
  city?: string;
  postalCode?: string;
  provinceCode?: string;
  countryCode?: string;
  current?: boolean;
}

async function fetchCorporationJson(registryNumber: string): Promise<Record<string, unknown>> {
  const url = `${CORP_API}/${encodeURIComponent(registryNumber)}.json?lang=eng`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Corporations Canada API returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as unknown[];
  const first = Array.isArray(data) ? data[0] : null;
  if (typeof first === "string") {
    // Not-found shape: ["could not find corporation …", "… est inconnu."]
    throw new Error(
      `No Canadian federal corporation found for "${registryNumber}". ` +
        `Provide a federal corporation number (older corporations have fewer than 7 digits) ` +
        `or a 9-digit business number; provincially registered businesses are not in this registry.`,
    );
  }
  if (!first || typeof first !== "object") {
    throw new Error("Corporations Canada API returned an unexpected response shape.");
  }
  const c = first as CorpApiRecord;

  const currentName = (c.corporationNames ?? [])
    .map((n) => n.CorporationName)
    .find((n) => n?.current);
  const nameHistory = (c.corporationNames ?? [])
    .map((n) => n.CorporationName)
    .filter((n): n is NonNullable<typeof n> => Boolean(n?.name) && !n?.current)
    .map((n) => n.name);

  // ?.length fallthrough (not ??): an empty "adresses" array must not shadow
  // a populated "addresses" if upstream ever fixes their key spelling.
  const addrArray = (c.adresses?.length ? c.adresses : c.addresses) ?? [];
  const addrEntry = addrArray.map((a) => a.address).find((a) => a?.current) ?? addrArray[0]?.address;
  const address = addrEntry
    ? [
        ...(addrEntry.addressLine ?? []),
        [addrEntry.city, addrEntry.provinceCode].filter(Boolean).join(" "),
        addrEntry.postalCode,
        addrEntry.countryCode,
      ]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const incorporation = (c.activities ?? [])
    .map((a) => a.activity)
    .find((a) => a?.activity === "Incorporation");

  return {
    company_name: currentName?.name ?? null,
    // corporation_number kept alongside registration_number: it was the
    // pre-migration output contract's guaranteed field.
    corporation_number: c.corporationId ?? registryNumber,
    registration_number: c.corporationId ?? registryNumber,
    business_number: c.businessNumbers?.businessNumber ?? null,
    status: c.status ?? null,
    business_type: c.act ?? null,
    address,
    registration_date: incorporation?.date ?? currentName?.effectiveDate ?? null,
    name_history: nameHistory,
    director_limits: c.directorLimits ?? null,
    latest_annual_return_year:
      (c.annualReturns ?? [])
        .map((r) => r.annualReturn?.yearOfFiling)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    industry: null,
    jurisdiction: "CA",
  };
}

async function lookupByName(query: string): Promise<Record<string, unknown>> {
  const searchUrl = `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html?V_SEARCH.command=search&V_SEARCH.docsStart=0&V_SEARCH.docsCount=10&V_SEARCH.srchNm=${encodeURIComponent(query)}`;
  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("no records") || text.length < 200) {
    throw new Error(`No Canadian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Canadian", query);
}

registerCapability("canadian-company-data", async (input: CapabilityInput) => {
  const raw = (input.corporation_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'corporation_number' or 'company_name' is required.");
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    // Principle B: never reach the paid LLM/Browserless path on junk input.
    throw new Error("Input must be at least 2 characters.");
  }
  const registryNumber = findRegistryNumber(trimmed);

  let output: Record<string, unknown>;
  let viaApi = false;
  if (registryNumber) {
    output = await fetchCorporationJson(registryNumber);
    viaApi = true;
  } else {
    const name = await extractCompanyName(trimmed, "Canadian");
    output = await lookupByName(name);
  }

  // Evidence Tier canonical aliases + honest Tier-2/UBO posture.
  {
    const o = output;
    if (o.legal_name === undefined) o.legal_name = o.company_name;
    if (o.primary_registration_id === undefined) o.primary_registration_id = o.registration_number;
    if (o.legal_form === undefined) o.legal_form = o.business_type;
    if (o.registered_address === undefined) o.registered_address = o.address;
    if (o.date_incorporated === undefined) o.date_incorporated = o.registration_date;
    o.tier_2_available = false;
    o.tier_2_available_reason =
      "Corporations Canada's JSON API exposes director count limits but not named directors; " +
      "the web UI shows names but automated extraction from it is pending a sourcing-doctrine ruling";
    o.ubo_availability = "restricted";
    o.ubo_availability_reason =
      "CBCA individuals-with-significant-control information is filed with Corporations Canada but " +
      "not exposed via the public JSON API";
  }

  return {
    output,
    provenance: viaApi
      ? {
          source: "ised-isde.canada.ca (Corporations Canada JSON API)",
          source_url: `${CORP_API}/${encodeURIComponent(registryNumber!)}.json?lang=eng`,
          fetched_at: new Date().toISOString(),
          acquisition_method: "direct_api" as const,
          primary_source_reference: `${CORP_API}/${encodeURIComponent(registryNumber!)}.json?lang=eng`,
        }
      : {
          source: "ised-isde.canada.ca",
          fetched_at: new Date().toISOString(),
        },
  };
});
