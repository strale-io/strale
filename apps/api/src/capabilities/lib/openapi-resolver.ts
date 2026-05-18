// Openapi.com resolver — shared helper for Tier-3 vendor-aggregator
// capabilities backed by the Openapi.com product line.
//
// Auth model: OAuth scope-exchange.
//   1. POST https://oauth.openapi.it/token with HTTP Basic (email:api-token)
//      and JSON body {"scopes":[scope],"ttl":600} → opaque Bearer, ~10 min TTL.
//   2. GET https://company.openapi.com/{PRODUCT}/{path...} with
//      Authorization: Bearer <token>.
//
// Supported products (Phase 2b):
//   ww-top      — global, country-keyed (BG/CY/HU/LU/MT/NL/RO/AT). T3=1/6 (NACE).
//   es-advanced — Spain, NIF-keyed. T3=2/6 (NACE + last_filing_date).
//   pt-advanced — Portugal, NIPC-keyed. T3=2/6 (NACE + last_filing_date).
//
// Phase 2c will add IT-advanced (shareHolders[]) + IT-full (managers,
// subsidiaries, affiliateCompanies). The product-switch design (see
// PRODUCT_REGISTRY below) is the extension point.
//
// Gating: process.env.OPENAPI_ENABLED must equal "true" or the resolver
// returns a capability-unavailable error before any HTTP call. This is
// load-bearing — Strale's resale of Openapi data requires the addendum
// countersignature (case 151296). The flag stays off in production until
// that lands.
//
// Reference: c:/tmp/openapi-research/v4-2026-05-15/output.json (WW-Top
// per-call responses) + c:/tmp/openapi-coverage-probe-v3-2026-05-15.json
// (ES/PT-Advanced response shapes verified).

import { log } from "../../lib/log.js";

export type OpenapiProduct =
  | "ww-top"
  | "es-advanced"
  | "pt-advanced"
  | "it-advanced"
  | "it-stakeholders";

export interface OpenapiResolverConfig {
  countryCode: string;          // ISO 3166-1 alpha-2
  identifierRegex: RegExp;      // pre-flight identifier-shape validation
  openapiProduct: OpenapiProduct;
  capabilitySlug: string;       // for log context + error messages
}

export interface OpenapiResolverResult {
  output: Record<string, unknown>;
  provenance: {
    source: string;
    source_url: string;
    fetched_at: string;
    upstream_vendor: string;
    acquisition_method: string;
    authoritative: boolean;
    [key: string]: unknown;
  };
}

// ─── Token cache (per scope, in-process) ───────────────────────────────────
interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

/** For tests only — clears the in-process OAuth-token cache. */
export function __resetOpenapiTokenCacheForTests(): void {
  tokenCache.clear();
}

async function issueToken(scope: string): Promise<string> {
  const email = process.env.OPENAPI_COM_EMAIL;
  const apiToken = process.env.OPENAPI_COM_API_TOKEN_PROD;
  if (!email || !apiToken) {
    throw new Error(
      "capability-unavailable: OPENAPI_COM_EMAIL and OPENAPI_COM_API_TOKEN_PROD must be configured.",
    );
  }
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt - 30_000 > Date.now()) {
    return cached.token;
  }
  const basic = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const r = await fetch("https://oauth.openapi.it/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scopes: [scope], ttl: 600 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(
      `Openapi token endpoint returned HTTP ${r.status}: ${body.slice(0, 200)}`,
    );
  }
  const data = (await r.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Openapi token endpoint returned no token field.");
  }
  tokenCache.set(scope, {
    token: data.token,
    expiresAt: Date.now() + 600_000,
  });
  return data.token;
}

// ─── Shared response sub-types ─────────────────────────────────────────────
interface OpenapiAddress {
  registeredOffice?: {
    town?: string | null;
    country?: string | null;
    zipCode?: string | null;
    streetName?: string | null;
    streetNumber?: string | null;
    nativeTown?: string | null;
  };
}
interface WwTopNaceItem {
  code?: string;
  description?: string;
}
interface FlatNace {
  code?: string;
  description?: string;
}
interface BalanceSheetEntry {
  year?: number;
  balanceSheetDate?: string;
  employees?: number;
  netWorth?: number;
  operatingRevenue?: number;
  equity?: number;
  totalAssets?: number;
}

// ─── WW-Top response shape (verified against v4 AT/OMV response) ───────────
interface WwTopData {
  id?: string;
  lastUpdateTimestamp?: number;
  companyName?: string;
  nativeCompanyName?: string;
  companyNumber?: string;
  vatCode?: string;
  taxCode?: string;
  leiCode?: string;
  companySize?: string;
  address?: OpenapiAddress;
  activityStatus?: string;
  incorporationDate?: string;
  internationalClassification?: {
    nace?: {
      primary?: WwTopNaceItem[];
      secondary?: WwTopNaceItem[];
    };
  };
}

// ─── ES/PT-Advanced response shape (verified against v3 probe ─────────────
// Phase B Telefonica + Galp responses). Shares identity fields with
// WW-Top but NACE is flat (single object, not array) and adds
// balanceSheets (last + 4-year history with employees, equity,
// operatingRevenue, totalAssets, netWorth, balanceSheetDate).
interface IberianAdvancedData {
  id?: string;
  lastUpdateTimestamp?: number;
  companyName?: string;
  nativeCompanyName?: string;
  taxCode?: string;
  vatCode?: string;
  leiCode?: string;
  address?: OpenapiAddress;
  activityStatus?: string;
  incorporationDate?: string;
  contacts?: { fax?: string; phone?: string; website?: string };
  internationalClassification?: {
    nace?: FlatNace;
    naics?: FlatNace;
    sic?: FlatNace;
  };
  balanceSheets?: {
    last?: BalanceSheetEntry;
    all?: BalanceSheetEntry[];
  };
}

// ─── IT-Advanced response shape (verified against v4 Eni response) ─────────
// IT-Advanced is the richest Openapi product Strale ships in v1. Adds over
// the WW-Top base:
//   - detailedLegalForm  → closes T1 legal_form gap (IT is the only Openapi-
//     routed country to reach T1=7/7)
//   - atecoClassification.ateco → T3.nace (Italian NACE; ATECO=Italian variant)
//   - balanceSheets.last.shareCapital → T3.share_capital (IT-Advanced-only;
//     absent in ES/PT-Advanced per Phase 2b correction)
//   - balanceSheets.last.balanceSheetDate → T3.last_filing_date
//   - shareHolders[] → T3.shareholders (≥10% threshold per Openapi docs)
//
// shareHolders[] entry shape per 2026-05-11 openapi-test-plan.md:
//   { companyName?, name?, surname?, taxCode?, percentShare? }
// (companyName set for corporate shareholders; name+surname set for natural
// persons.) For widely-held entities like Eni the array is empty by design
// — Strale's manifest reliability declares "common" not "guaranteed".
interface ItAdvancedAtecoEntry {
  code?: string;
  description?: string;
}
interface ItAdvancedAddressOffice {
  toponym?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  streetName?: string | null;
  town?: string | null;
  zipCode?: string | null;
  province?: string | null;
  region?: { code?: string; description?: string };
}
interface ItAdvancedBalanceSheet {
  year?: number;
  balanceSheetDate?: string | null;
  employees?: number;
  turnover?: number;
  netWorth?: number;
  shareCapital?: number;
  totalStaffCost?: number;
  totalAssets?: number;
  avgGrossSalary?: number;
}
interface ItAdvancedShareHolder {
  companyName?: string;
  name?: string;
  surname?: string;
  taxCode?: string;
  percentShare?: number;
}
interface ItAdvancedData {
  id?: string;
  lastUpdateTimestamp?: number;
  companyName?: string;
  nativeCompanyName?: string;
  taxCode?: string;
  vatCode?: string;
  leiCode?: string;
  address?: { registeredOffice?: ItAdvancedAddressOffice };
  activityStatus?: string;
  registrationDate?: string;
  startDate?: string;
  endDate?: string | null;
  pec?: string;
  detailedLegalForm?: { code?: string; description?: string };
  atecoClassification?: {
    ateco?: ItAdvancedAtecoEntry;
    ateco2007?: ItAdvancedAtecoEntry;
    ateco2022?: ItAdvancedAtecoEntry;
  };
  balanceSheets?: {
    last?: ItAdvancedBalanceSheet;
    all?: ItAdvancedBalanceSheet[];
  };
  shareHolders?: ItAdvancedShareHolder[];
}

// ─── IT-Stakeholders response shape (verified against Openapi OAS spec) ─────
// Phase 7a — adds the directors / legal-representatives surface that
// IT-Advanced does not expose. Distinct wire shape from the other Openapi
// products: `data` is a single object (not an array of one). See the data
// guard in executeOpenapiCapability for the array-vs-object normalisation.
//
// managers[] = the "stakeholders" universe. Each entry is either a natural
// person (name + surname populated) or a corporate stakeholder (companyName
// populated, typically a sole-owner SRL holding shares). Each manager can
// carry multiple roles[]; common codes: AUN (Amministratore Unico /
// Managing director), PP (Procura speciale / Special representative), SOU
// (Sole owner — shareholder relation, NOT a director), PCDA (Presidente
// CdA), AD (Amministratore delegato), LIQ (Liquidatore). isLegalRepresentative
// is Openapi's authoritative flag — used by Strale to derive the binding-ready
// T2 legal_representatives[] subset.
interface ItStakeholdersRole {
  role?: { code?: string; description?: string };
  roleStartDate?: string | null;
}
interface ItStakeholdersManager {
  name?: string;
  surname?: string;
  companyName?: string;
  roles?: ItStakeholdersRole[];
  gender?: { code?: string; description?: string };
  taxCode?: string;
  birthDate?: string | null;
  age?: number;
  birthTown?: string | null;
  isLegalRepresentative?: boolean;
}
interface ItStakeholdersShareholderRow {
  taxCode?: string;
  companyName?: string;
  name?: string;
  surname?: string;
  openapiNumber?: string;
  sinceDate?: string | null;
  streetName?: string | null;
  zipCode?: string | null;
  town?: string | null;
}
interface ItStakeholdersShareholderEntry {
  shareholdersInformation?: ItStakeholdersShareholderRow[];
  percentShare?: number;
}
interface ItStakeholdersCompanyDetails {
  vatCode?: string;
  taxCode?: string;
  lastUpdateDate?: string | null;
  cciaa?: string;
  reaCode?: string;
  companyName?: string;
  officeType?: { code?: string; description?: string };
  openapiNumber?: string;
}
interface ItStakeholdersData {
  managers?: ItStakeholdersManager[];
  shareholders?: ItStakeholdersShareholderEntry[];
  companyDetails?: ItStakeholdersCompanyDetails;
}

// ─── Strale canonical legal-representative shape (Phase 7a contract) ────────
//
// First v1 capability surfacing directors → this defines the contract.
// v1.1+ enrichments (UK officers normalisation, additional country
// directors capabilities) should conform.
export interface StraleLegalRepresentative {
  type: "person" | "company";
  name: string;                       // composed natural-person name OR companyName
  role: string | null;                // role description (vendor-localised)
  role_code: string | null;           // raw vendor role code (e.g. AUN, PP, AD)
  start_date: string | null;          // ISO date (YYYY-MM-DD) — role start
  tax_code: string | null;            // codice fiscale (IT) or other identifier
  birth_date: string | null;          // ISO date (YYYY-MM-DD) — null for companies
  is_legal_representative: boolean;   // vendor-asserted binding authority
}

interface OpenapiResponse<T> {
  data?: T[] | T;
  success?: boolean;
  message?: string;
  error?: unknown;
}

// ─── Strale's canonical shareholder shape (set by IT-Advanced, Phase 2c) ───
//
// First v1 capability to expose shareholders → this defines the contract.
// v1.1+ enrichments (UK PSC, IT-Full managers, UBO-Italy) must conform.
// Sort order: descending by percent_share (largest first).
export interface StraleShareHolder {
  type: "company" | "person";        // company if companyName set; else person
  name: string;                       // companyName, or "name surname" composed
  identifier: string | null;          // taxCode (codice fiscale for IT entities)
  percent_share: number;              // 0-100; from Openapi percentShare
  share_type: string | null;          // null for IT-Advanced (no shareType field
                                      // in Openapi response); v1.1+ may populate
  source_as_of: string | null;        // response-level lastUpdateTimestamp (ISO)
}

// ─── Shared mappers ────────────────────────────────────────────────────────
function composeAddress(addr: OpenapiAddress | undefined): string | null {
  if (!addr?.registeredOffice) return null;
  const o = addr.registeredOffice;
  const street =
    o.streetName && o.streetNumber
      ? `${o.streetName.trim()} ${o.streetNumber.trim()}`
      : o.streetName?.trim() ?? null;
  const parts = [street, o.zipCode?.trim(), o.town?.trim(), o.country?.trim()]
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function epochSecondsToIso(epoch: number | undefined | null): string | null {
  if (typeof epoch !== "number" || !Number.isFinite(epoch) || epoch <= 0) {
    return null;
  }
  return new Date(epoch * 1000).toISOString();
}

function normaliseStatus(raw: string | undefined): "active" | "inactive" | "unknown" {
  if (!raw) return "unknown";
  const v = raw.trim().toLowerCase();
  if (v === "active" || v === "attiva") return "active";
  if (
    v === "inactive" ||
    v === "dissolved" ||
    v === "ceased" ||
    v === "terminated"
  ) {
    return "inactive";
  }
  return "unknown";
}

function wwTopNacePrimary(
  data: WwTopData,
): { code: string; description: string } | null {
  const p = data.internationalClassification?.nace?.primary?.[0];
  if (!p?.code) return null;
  return { code: p.code, description: p.description ?? "" };
}

function iberianNace(
  data: IberianAdvancedData,
): { code: string; description: string } | null {
  const p = data.internationalClassification?.nace;
  if (!p?.code) return null;
  return { code: p.code, description: p.description ?? "" };
}

function composeItAdvancedAddress(
  office: ItAdvancedAddressOffice | undefined,
): string | null {
  if (!office) return null;
  const street =
    office.streetName ??
    (office.street && office.streetNumber
      ? `${office.street} ${office.streetNumber}`
      : office.street ?? null);
  const parts = [
    street?.trim() ?? null,
    office.zipCode?.trim() ?? null,
    office.town?.trim() ?? null,
    office.province?.trim() ?? null,
    "IT",
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function itAdvancedNace(
  data: ItAdvancedData,
): { code: string; description: string } | null {
  const a =
    data.atecoClassification?.ateco2022 ??
    data.atecoClassification?.ateco2007 ??
    data.atecoClassification?.ateco;
  if (!a?.code) return null;
  return { code: a.code, description: a.description ?? "" };
}

function mapItShareHolder(
  sh: ItAdvancedShareHolder,
  sourceAsOf: string | null,
): StraleShareHolder {
  const isCompany = typeof sh.companyName === "string" && sh.companyName.trim().length > 0;
  const composedName = [sh.name, sh.surname]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ");
  return {
    type: isCompany ? "company" : "person",
    name: isCompany ? sh.companyName!.trim() : composedName || "(unknown)",
    identifier: sh.taxCode ?? null,
    percent_share:
      typeof sh.percentShare === "number" && Number.isFinite(sh.percentShare)
        ? sh.percentShare
        : 0,
    share_type: null,
    source_as_of: sourceAsOf,
  };
}

// ─── Per-product registry (URL builder + scope + mapper dispatch) ──────────
interface ProductDispatch {
  /** Build the fetch URL for a given country + identifier. */
  buildUrl: (country: string, id: string) => string;
  /** OAuth scope string required for this product. */
  scope: string;
  /** Human-readable provenance.source label. */
  sourceLabel: string;
}

const PRODUCT_REGISTRY: Record<OpenapiProduct, ProductDispatch> = {
  "ww-top": {
    buildUrl: (country, id) =>
      `https://company.openapi.com/WW-top/${encodeURIComponent(country)}/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/WW-top",
    sourceLabel: "Openapi.com WW-Top",
  },
  "es-advanced": {
    // Country-specific products take a single path segment (the identifier).
    // No country path segment because the product name encodes the country.
    buildUrl: (_country, id) =>
      `https://company.openapi.com/ES-advanced/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/ES-advanced",
    sourceLabel: "Openapi.com ES-Advanced",
  },
  "pt-advanced": {
    buildUrl: (_country, id) =>
      `https://company.openapi.com/PT-advanced/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/PT-advanced",
    sourceLabel: "Openapi.com PT-Advanced",
  },
  "it-advanced": {
    // Italy is identifier-keyed (bare 11-digit codice fiscale; same as
    // P.IVA for IT legal entities). No country path segment.
    buildUrl: (_country, id) =>
      `https://company.openapi.com/IT-advanced/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/IT-advanced",
    sourceLabel: "Openapi.com IT-Advanced",
  },
  "it-stakeholders": {
    // Italy stakeholders product — adds managers[] (directors / legal
    // representatives) absent from IT-Advanced. Same identifier shape as
    // IT-Advanced; separate scope + product path. Phase 7a.
    buildUrl: (_country, id) =>
      `https://company.openapi.com/IT-stakeholders/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/IT-stakeholders",
    sourceLabel: "Openapi.com IT-Stakeholders",
  },
};

// ─── Mappers (produce Strale output{} per product) ─────────────────────────
function mapWwTopOutput(
  data: WwTopData,
  config: OpenapiResolverConfig,
  trimmed: string,
): Record<string, unknown> {
  const status = normaliseStatus(data.activityStatus);
  const nace = wwTopNacePrimary(data);
  const sourceAsOf = epochSecondsToIso(data.lastUpdateTimestamp);
  return {
    company_name: data.companyName ?? data.nativeCompanyName ?? null,
    native_company_name: data.nativeCompanyName ?? null,
    registration_number: data.companyNumber ?? trimmed,
    vat_number: data.vatCode ?? trimmed,
    country_code: config.countryCode,
    legal_form: null,
    status,
    is_active: status === "active",
    registered_date: data.incorporationDate ?? null,
    registered_address: composeAddress(data.address),
    lei_code: data.leiCode ?? null,
    nace_codes: nace ? [nace] : [],
    company_size: data.companySize ?? null,
    source_as_of: sourceAsOf,
  };
}

function mapItAdvancedOutput(
  data: ItAdvancedData,
  config: OpenapiResolverConfig,
  trimmed: string,
): Record<string, unknown> {
  const status = normaliseStatus(data.activityStatus);
  const nace = itAdvancedNace(data);
  const sourceAsOf = epochSecondsToIso(data.lastUpdateTimestamp);
  const legalForm = data.detailedLegalForm?.description ?? null;
  const last = data.balanceSheets?.last;
  const shareCapital =
    typeof last?.shareCapital === "number" && Number.isFinite(last.shareCapital)
      ? last.shareCapital
      : null;
  const lastFilingDate = last?.balanceSheetDate ?? null;
  // shareHolders[] sorted descending by percent_share per Phase 2c contract.
  const shareholders = Array.isArray(data.shareHolders)
    ? data.shareHolders
        .map((sh) => mapItShareHolder(sh, sourceAsOf))
        .sort((a, b) => b.percent_share - a.percent_share)
    : [];
  return {
    company_name: data.companyName ?? data.nativeCompanyName ?? null,
    native_company_name: data.nativeCompanyName ?? null,
    registration_number: data.taxCode ?? trimmed,
    vat_number: data.vatCode ?? trimmed,
    country_code: config.countryCode,
    legal_form: legalForm,
    status,
    is_active: status === "active",
    registered_date: data.registrationDate ?? data.startDate ?? null,
    registered_address: composeItAdvancedAddress(data.address?.registeredOffice),
    lei_code: data.leiCode ?? null,
    nace_codes: nace ? [nace] : [],
    company_size: null,
    source_as_of: sourceAsOf,
    last_filing_date: lastFilingDate,
    share_capital: shareCapital,
    shareholders,
    pec: data.pec ?? null,
  };
}

function normaliseRoleStartDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  // Openapi emits roleStartDate as "YYYY-MM-DDTHH:MM:SS" without timezone.
  // Reduce to YYYY-MM-DD; preserve nulls if parsing fails.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normaliseBirthDate(raw: string | null | undefined): string | null {
  return normaliseRoleStartDate(raw);
}

function mapItStakeholdersManager(
  m: ItStakeholdersManager,
): StraleLegalRepresentative {
  const isCompany =
    typeof m.companyName === "string" && m.companyName.trim().length > 0;
  const composedName = [m.name, m.surname]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ");
  // Each manager may carry multiple roles; pick the first as primary.
  // Strale's v1 contract surfaces one (role, role_code, start_date) per
  // representative; consumers needing the full role history can call the
  // capability and inspect the raw vendor payload (deferred).
  const primary =
    Array.isArray(m.roles) && m.roles.length > 0 ? m.roles[0] : undefined;
  const roleCode = primary?.role?.code ?? null;
  const roleDescription = primary?.role?.description ?? null;
  return {
    type: isCompany ? "company" : "person",
    name: isCompany ? m.companyName!.trim() : composedName || "(unknown)",
    role: roleDescription,
    role_code: roleCode,
    start_date: normaliseRoleStartDate(primary?.roleStartDate),
    tax_code: typeof m.taxCode === "string" && m.taxCode.length > 0 ? m.taxCode : null,
    birth_date: isCompany ? null : normaliseBirthDate(m.birthDate),
    is_legal_representative: m.isLegalRepresentative === true,
  };
}

// SOU (sole-owner) is a shareholding relation surfaced inside managers[].
// It is not a representative role; excluded from legal_representatives[].
// Other shareholder-only role codes can be added here if Openapi expands
// the universe.
const NON_REPRESENTATIVE_ROLE_CODES = new Set<string>(["SOU"]);

function mapItStakeholdersOutput(
  data: ItStakeholdersData,
  config: OpenapiResolverConfig,
  trimmed: string,
): Record<string, unknown> {
  const managers = Array.isArray(data.managers) ? data.managers : [];
  const allRepresentatives = managers.map(mapItStakeholdersManager);
  // legal_representatives[] = managers carrying a director-like role.
  // SOU (sole-owner) is filtered out — that's a shareholder relation.
  // Within the remainder, sort: legal-representatives first, then by
  // start_date descending (most recent appointments first).
  const legalRepresentatives = allRepresentatives
    .filter(
      (rep) =>
        rep.role_code === null ||
        !NON_REPRESENTATIVE_ROLE_CODES.has(rep.role_code),
    )
    .sort((a, b) => {
      if (a.is_legal_representative !== b.is_legal_representative) {
        return a.is_legal_representative ? -1 : 1;
      }
      if (a.start_date && b.start_date) {
        return b.start_date.localeCompare(a.start_date);
      }
      return 0;
    });

  const sourceAsOfRaw = data.companyDetails?.lastUpdateDate ?? null;
  const sourceAsOf =
    typeof sourceAsOfRaw === "string" && sourceAsOfRaw.length > 0
      ? sourceAsOfRaw
      : null;

  return {
    company_name: data.companyDetails?.companyName ?? null,
    registration_number: data.companyDetails?.taxCode ?? trimmed,
    vat_number: data.companyDetails?.vatCode ?? trimmed,
    country_code: config.countryCode,
    legal_representatives: legalRepresentatives,
    total_legal_representatives: legalRepresentatives.length,
    source_as_of: sourceAsOf,
  };
}

function mapIberianAdvancedOutput(
  data: IberianAdvancedData,
  config: OpenapiResolverConfig,
  trimmed: string,
): Record<string, unknown> {
  const status = normaliseStatus(data.activityStatus);
  const nace = iberianNace(data);
  const sourceAsOf = epochSecondsToIso(data.lastUpdateTimestamp);
  // last_filing_date comes from balanceSheets.last.balanceSheetDate (already
  // ISO YYYY-MM-DD per probe data). NOTE: share_capital is NOT present in
  // ES/PT-Advanced response — only IT-Advanced has shareCapital. Matrix's
  // "T3 3/6 (NACE + share capital + last filing year)" claim is incorrect
  // for ES/PT; reality is 2/6 (NACE + last_filing_date). See PR description.
  const lastFilingDate = data.balanceSheets?.last?.balanceSheetDate ?? null;
  return {
    company_name: data.companyName ?? data.nativeCompanyName ?? null,
    native_company_name: data.nativeCompanyName ?? null,
    registration_number: data.taxCode ?? trimmed,
    vat_number: data.vatCode ?? trimmed,
    country_code: config.countryCode,
    legal_form: null,
    status,
    is_active: status === "active",
    registered_date: data.incorporationDate ?? null,
    registered_address: composeAddress(data.address),
    lei_code: data.leiCode ?? null,
    nace_codes: nace ? [nace] : [],
    company_size: null, // not returned at *-Advanced tier
    source_as_of: sourceAsOf,
    last_filing_date: lastFilingDate,
  };
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────
interface CallResult<T> {
  status: number;
  body: OpenapiResponse<T> | null;
  text: string;
}

async function callProduct<T>(
  url: string,
  bearer: string,
): Promise<CallResult<T>> {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await r.text();
  let body: OpenapiResponse<T> | null = null;
  try {
    body = text ? (JSON.parse(text) as OpenapiResponse<T>) : null;
  } catch {
    body = null;
  }
  return { status: r.status, body, text };
}

/**
 * Execute an Openapi-routed capability.
 *
 * Flow:
 *   1. Feature-flag check (OPENAPI_ENABLED).
 *   2. Product validation (config.openapiProduct must be in PRODUCT_REGISTRY).
 *   3. Identifier shape validation against config.identifierRegex.
 *   4. Credentials check (OPENAPI_COM_EMAIL + OPENAPI_COM_API_TOKEN_PROD).
 *   5. Token acquire (cached per scope, 10-min TTL).
 *   6. Product fetch with 15s timeout; single retry on 401 / 5xx.
 *   7. Map response to Strale Tier 1/2/3 shape; throw structured errors on
 *      204/406/4xx/5xx/network.
 */
export async function executeOpenapiCapability(
  config: OpenapiResolverConfig,
  identifier: string,
): Promise<OpenapiResolverResult> {
  const t0 = Date.now();
  const baseCtx = {
    capability_slug: config.capabilitySlug,
    country_code: config.countryCode,
    openapi_product: config.openapiProduct,
  };

  if (process.env.OPENAPI_ENABLED !== "true") {
    log.info(
      { label: "openapi-capability-disabled", ...baseCtx },
      "openapi-capability-disabled",
    );
    throw new Error(
      "capability-unavailable: OPENAPI_ENABLED is not set to 'true' in this environment. Openapi-routed capabilities require the resale addendum countersignature (case 151296) before serving customer traffic.",
    );
  }

  const product = PRODUCT_REGISTRY[config.openapiProduct];
  if (!product) {
    throw new Error(
      `Openapi resolver does not support product '${config.openapiProduct}'. Supported: ${Object.keys(PRODUCT_REGISTRY).join(", ")}.`,
    );
  }

  if (typeof identifier !== "string" || !identifier.trim()) {
    throw new Error(`Identifier is required for ${config.capabilitySlug}.`);
  }
  const trimmed = identifier.trim();
  if (!config.identifierRegex.test(trimmed)) {
    throw new Error(
      `'${trimmed}' does not match the expected identifier shape for ${config.capabilitySlug} (regex: ${config.identifierRegex.source}).`,
    );
  }

  const requestUrl = product.buildUrl(config.countryCode, trimmed);
  const maxAttempts = 2;
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const bearer = await issueToken(product.scope);
      const r = await callProduct<unknown>(requestUrl, bearer);
      const durationMs = Date.now() - t0;

      if (r.status === 200) {
        // Most Openapi products wrap data in an array; IT-Stakeholders wraps
        // a single object. Normalise both shapes before mapper dispatch.
        const rawData: unknown = r.body?.data;
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        if (
          !r.body ||
          r.body.success !== true ||
          !data ||
          typeof data !== "object"
        ) {
          throw new Error(
            `Openapi returned HTTP 200 but the response body did not contain expected data: ${r.text.slice(0, 200)}`,
          );
        }

        log.info(
          {
            label: "openapi-success",
            ...baseCtx,
            identifier: trimmed,
            duration_ms: durationMs,
            response_size_bytes: r.text.length,
          },
          "openapi-success",
        );

        let output: Record<string, unknown>;
        let recordId: string | null = null;
        if (config.openapiProduct === "ww-top") {
          const wwTopData = data as WwTopData;
          output = mapWwTopOutput(wwTopData, config, trimmed);
          recordId = wwTopData.id ?? null;
        } else if (config.openapiProduct === "it-advanced") {
          const itData = data as ItAdvancedData;
          output = mapItAdvancedOutput(itData, config, trimmed);
          recordId = itData.id ?? null;
        } else if (config.openapiProduct === "it-stakeholders") {
          const stakeholdersData = data as ItStakeholdersData;
          output = mapItStakeholdersOutput(stakeholdersData, config, trimmed);
          recordId = stakeholdersData.companyDetails?.openapiNumber ?? null;
        } else {
          // es-advanced or pt-advanced share the same Iberian shape
          const iberianData = data as IberianAdvancedData;
          output = mapIberianAdvancedOutput(iberianData, config, trimmed);
          recordId = iberianData.id ?? null;
        }

        return {
          output,
          provenance: {
            source: product.sourceLabel,
            source_url: requestUrl,
            fetched_at: new Date().toISOString(),
            upstream_vendor: "openapi.com",
            acquisition_method: "vendor_aggregation",
            authoritative: false,
            openapi_record_id: recordId,
          },
        };
      }

      if (r.status === 204) {
        log.info(
          {
            label: "openapi-not-found",
            ...baseCtx,
            identifier: trimmed,
            duration_ms: durationMs,
          },
          "openapi-not-found",
        );
        throw new Error(
          `No ${config.capabilitySlug.replace(/-/g, " ")} found for identifier '${trimmed}'.`,
        );
      }

      if (r.status === 406) {
        const msg = r.body?.message ?? "vendor rejected identifier";
        log.info(
          {
            label: "openapi-identifier-rejected",
            ...baseCtx,
            identifier: trimmed,
            vendor_message: msg,
            duration_ms: durationMs,
          },
          "openapi-identifier-rejected",
        );
        throw new Error(
          `Openapi rejected '${trimmed}' as invalid for country ${config.countryCode}: ${msg}`,
        );
      }

      if (r.status === 401 && attempt === 1) {
        tokenCache.delete(product.scope);
        log.info(
          { label: "openapi-token-stale", ...baseCtx },
          "openapi-token-stale",
        );
        continue;
      }

      if (r.status >= 500 && attempt === 1) {
        log.info(
          {
            label: "openapi-5xx-retry",
            ...baseCtx,
            status: r.status,
          },
          "openapi-5xx-retry",
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      if (r.status >= 500) {
        throw new Error(
          `capability-unavailable: Openapi upstream error (HTTP ${r.status}) for ${config.capabilitySlug}.`,
        );
      }

      throw new Error(
        `Openapi returned HTTP ${r.status} for ${config.capabilitySlug}: ${r.text.slice(0, 200)}`,
      );
    } catch (err) {
      lastErr = err;
      if (
        attempt === 1 &&
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.name === "TimeoutError" ||
          err.message.includes("fetch failed"))
      ) {
        log.info(
          {
            label: "openapi-network-retry",
            ...baseCtx,
            error: String(err).slice(0, 200),
          },
          "openapi-network-retry",
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
