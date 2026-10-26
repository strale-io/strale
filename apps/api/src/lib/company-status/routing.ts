/**
 * Country routing for company-status-check (portfolio plan 1C.1).
 *
 * One row per ISO 3166-1 alpha-2 country the capability answers for: which
 * registry executor to call, which input field carries the identifier, how to
 * validate that identifier BEFORE any upstream call, and which official
 * insolvency source (if any) to add.
 *
 * A country is routed only when its registry executor is registered, not in
 * auto-register's DEACTIVATED map, has an active manifest, records its
 * data-access lane as `preferred` (statutory or official source, no pending
 * vendor checks), and returns a status the normaliser can ground.
 * `company-status-routing.test.ts` holds this table to those conditions by
 * reading the manifests, and holds `EXCLUDED_COUNTRIES` to production's
 * `countries.company_data_active_iso`.
 *
 * Identifier validators mirror the executor's own regexes so a bad identifier
 * is refused here, never sent upstream, and never reaches an executor's
 * LLM-backed name-resolution path.
 */

export interface InsolvencySource {
  /**
   * `separate`: a second executor is called. `same_record`: the registry
   * executor's own output already carries official proceedings (Sweden).
   */
  kind: "separate" | "same_record";
  /** Executor slug when kind is "separate". */
  slug?: string;
  /** Official body behind the source, for the output. */
  name: string;
}

export interface CountryRoute {
  iso: string;
  registry: {
    /** Executor slug called through getExecutor. */
    slug: string;
    name: string;
    /** Input field of that executor that carries the identifier. */
    input_field: string;
  };
  /** Human description of the accepted identifier, used in refusals. */
  identifier_help: string;
  /** Returns the normalised identifier, or null when it is not valid for this registry. */
  normalise_identifier: (raw: string) => string | null;
  insolvency?: InsolvencySource;
}

const digits = (raw: string): string => raw.replace(/[\s.\-/]/g, "");

function exactDigits(n: number): (raw: string) => string | null {
  return (raw) => {
    const d = digits(raw);
    return new RegExp(`^\\d{${n}}$`).test(d) ? d : null;
  };
}

export const COUNTRY_ROUTES: readonly CountryRoute[] = [
  {
    iso: "AT",
    registry: { slug: "austrian-company-data", name: "Firmenbuch (Republik Österreich, BMJ)", input_field: "registration_number" },
    identifier_help: "a Firmenbuchnummer: up to 6 digits plus a check letter, e.g. FN 93363 z",
    normalise_identifier: (raw) => {
      // Same shape as austrian-company-data.ts parseFnr().
      const cleaned = raw.toLowerCase().replace(/^fn\s*/, "").replace(/[\s.-]/g, "");
      const m = cleaned.match(/^(\d{1,6})([a-z])$/);
      return m ? `FN ${Number(m[1])} ${m[2]}` : null;
    },
  },
  {
    iso: "AU",
    registry: { slug: "au-company-data", name: "Australian Business Register (ABR)", input_field: "abn" },
    identifier_help: "an 11-digit ABN",
    normalise_identifier: exactDigits(11),
  },
  {
    iso: "EE",
    registry: { slug: "estonian-company-data", name: "Äriregister (Estonian Business Register)", input_field: "registry_code" },
    identifier_help: "an 8-digit registry code",
    normalise_identifier: exactDigits(8),
  },
  {
    iso: "FI",
    registry: { slug: "finnish-company-data", name: "PRH (Finnish Patent and Registration Office)", input_field: "business_id" },
    identifier_help: "a Business ID: 7 digits, a hyphen and a check digit, e.g. 0112038-9",
    normalise_identifier: (raw) => {
      const m = raw.replace(/\s/g, "").match(/^(\d{7})-?(\d)$/);
      return m ? `${m[1]}-${m[2]}` : null;
    },
  },
  {
    iso: "FR",
    registry: { slug: "french-company-data", name: "INSEE / Registre du Commerce (France)", input_field: "siren" },
    identifier_help: "a 9-digit SIREN",
    normalise_identifier: exactDigits(9),
    insolvency: { kind: "separate", slug: "fr-bodacc-lookup", name: "BODACC (DILA)" },
  },
  {
    iso: "GB",
    registry: { slug: "uk-company-data", name: "Companies House (UK Government)", input_field: "company_number" },
    identifier_help: "a Companies House number: 8 characters, e.g. 00445790 or SC123456",
    normalise_identifier: (raw) => {
      // Same shape as uk-company-data.ts COMPANY_NUMBER_RE.
      const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
      return /^(SC|NI|OC|SO|NC|R|IP|SP|RS|NO|NP)?\d{6,8}$/.test(cleaned) ? cleaned.padStart(8, "0") : null;
    },
    insolvency: { kind: "separate", slug: "insolvency-check", name: "Companies House insolvency register" },
  },
  {
    iso: "GR",
    registry: { slug: "greek-company-data", name: "GEMI (Greek General Commercial Registry)", input_field: "gemi_number" },
    identifier_help: "a GEMI number (6 to 14 digits, but not exactly 9); a 9-digit tax ID (AFM) is not accepted",
    normalise_identifier: (raw) => {
      const d = digits(raw);
      // greek-company-data reads a 9-digit value as an AFM (tax ID) and a longer one as a GEMI number.
      return /^\d{6,14}$/.test(d) && d.length !== 9 ? d : null;
    },
  },
  {
    iso: "HR",
    registry: { slug: "croatian-company-data", name: "Sudski registar (Croatian Court Register)", input_field: "oib" },
    identifier_help: "an 11-digit OIB",
    normalise_identifier: exactDigits(11),
  },
  {
    iso: "IE",
    registry: { slug: "irish-company-data", name: "CRO (Companies Registration Office, Ireland)", input_field: "cro_number" },
    identifier_help: "a 5 or 6-digit CRO number",
    normalise_identifier: (raw) => {
      const d = digits(raw);
      return /^\d{5,6}$/.test(d) ? d : null;
    },
  },
  {
    iso: "LV",
    registry: { slug: "latvian-company-data", name: "Latvian Enterprise Register (Uzņēmumu reģistrs)", input_field: "reg_number" },
    identifier_help: "an 11-digit registration number",
    normalise_identifier: exactDigits(11),
  },
  {
    iso: "SE",
    registry: { slug: "swedish-company-data", name: "Bolagsverket (Swedish Companies Registration Office)", input_field: "org_number" },
    identifier_help: "a 10-digit organisationsnummer whose third digit is 2 or higher, e.g. 556703-7485; personal identity numbers are not accepted",
    normalise_identifier: (raw) => {
      const d = digits(raw);
      // Organisation numbers have a third digit >= 2; a personnummer has a month there (0 or 1).
      return /^\d{2}[2-9]\d{7}$/.test(d) ? `${d.slice(0, 6)}-${d.slice(6)}` : null;
    },
    insolvency: { kind: "same_record", name: "Bolagsverket (pending liquidation or restructuring proceedings)" },
  },
  {
    iso: "SG",
    registry: { slug: "singapore-company-data", name: "ACRA (Accounting and Corporate Regulatory Authority)", input_field: "uen" },
    identifier_help: "a 9 or 10-character UEN, e.g. 197200078R",
    normalise_identifier: (raw) => {
      const c = raw.replace(/[\s.-]/g, "").toUpperCase();
      return /^[A-Z0-9]{9,10}$/.test(c) ? c : null;
    },
  },
];

/**
 * Countries in production's `company_data_active_iso` that are deliberately not
 * routed, with the reason. Together with COUNTRY_ROUTES this must cover that
 * list exactly (see company-status-routing.test.ts).
 */
export const EXCLUDED_COUNTRIES: Readonly<Record<string, string>> = {
  BE: "data-access checks for the Belgian source (a vendor wrapper of KBO/BCE) are recorded as pending, and the executor reports status \"active\" when the source gives none",
  BR: "data-access checks for the Brazilian source (a vendor wrapper of the Receita Federal register) are recorded as pending",
  CA: "the Corporations Canada status vocabulary could not be verified in this build, and the numeric lookup returns it unmapped",
  CH: "the Zefix status vocabulary could not be verified in this build; Zefix needs credentials that were not available to test against",
  DE: "data-access checks for the German source (OpenRegister, a vendor register API) are recorded as pending, and its free tier is a small monthly quota that a composite call would spend",
  ES: "data-access checks for the Spanish source (a vendor aggregation of BORME) are recorded as pending",
  JP: "the Japanese source is a page scrape with checks recorded as pending",
  CZ: "the status field in the underlying executor does not report deleted / deregistered / liquidating entities; fix tracked separately",
  NO: "the status field in the underlying executor does not report deleted / deregistered / liquidating entities; fix tracked separately",
  PL: "the status field in the underlying executor does not report deleted / deregistered / liquidating entities; fix tracked separately",
  SI: "the Slovenian open dataset carries no status column",
  SK: "the Slovak register publishes no status flag; the executor infers one from validity dates",
  US: "the US executor reads SEC EDGAR, which is a filer index and has no company status; it sets \"active\" for any match",
};

export const SUPPORTED_COUNTRIES: readonly string[] = COUNTRY_ROUTES.map((r) => r.iso);

const BY_ISO: ReadonlyMap<string, CountryRoute> = new Map(COUNTRY_ROUTES.map((r) => [r.iso, r]));

/** "UK" is accepted as GB; anything else must already be an ISO alpha-2 code. */
export function canonicalCountry(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  if (c === "") return null;
  return c === "UK" ? "GB" : c;
}

export function getRoute(iso: string): CountryRoute | undefined {
  return BY_ISO.get(iso);
}
