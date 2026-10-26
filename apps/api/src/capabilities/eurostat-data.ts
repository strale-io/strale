import { registerCapability, type CapabilityInput } from "./index.js";

// Curated against recorded live metadata; see __fixtures__/eurostat/README.md.
export const EUROSTAT_ALLOWED_DATASETS: readonly string[] = Object.freeze([
  "demo_find",
  "demo_frate",
  "demo_gind",
  "demo_magec",
  "demo_minfind",
  "demo_mlexpec",
  "demo_mlifetable",
  "demo_nind",
  "demo_pjan",
  "demo_pjangroup",
  "demo_pjanind",
  "demo_r_d2jan",
  "demo_r_d3area",
  "demo_r_d3dens",
  "demo_r_find2",
  "demo_r_gind3",
  "demo_r_magec",
  "demo_r_mlifexp",
  "demo_r_pjanaggr3",
  "env_ac_mfa",
  "env_ac_rme",
  "env_wasmun",
  "gov_10a_exp",
  "gov_10a_main",
  "gov_10dd_edpt1",
  "gov_10q_ggdebt",
  "gov_10q_ggnfa",
  "ilc_di03",
  "ilc_di04",
  "ilc_di11",
  "ilc_di12",
  "ilc_li01",
  "ilc_li02",
  "ilc_li03",
  "lfsi_emp_a",
  "lfsi_emp_q",
  "lfst_r_lfe2eftpt",
  "lfst_r_lfe2emp",
  "lfst_r_lfe2emprt",
  "lfst_r_lfp2act",
  "lfst_r_lfu3pers",
  "lfst_r_lfu3rt",
  "nama_10_a10",
  "nama_10_gdp",
  "nama_10_lp_ulc",
  "nama_10_pc",
  "namq_10_a10",
  "namq_10_gdp",
  "nrg_pc_204",
  "nrg_pc_205",
  "prc_hicp_aind",
  "prc_hicp_inw",
  "prc_hicp_manr",
  "prc_hicp_midx",
  "prc_ppp_ind",
  "sdg_01_10",
  "sdg_01_20",
  "sdg_01_40",
  "sdg_01_41",
  "sdg_02_10",
  "sdg_02_20",
  "sdg_02_40",
  "sdg_03_20",
  "sdg_03_41",
  "sdg_03_60",
  "sdg_04_10",
  "sdg_04_20",
  "sdg_05_20",
  "sdg_05_30",
  "sdg_05_40",
  "sdg_06_10",
  "sdg_06_20",
  "sdg_07_10",
  "sdg_07_20",
  "sdg_07_30",
  "sdg_07_40",
  "sdg_08_10",
  "sdg_08_11",
  "sdg_08_20",
  "sdg_08_30",
  "sdg_08_40",
  "sdg_08_60",
  "sdg_09_10",
  "sdg_09_30",
  "sdg_10_10",
  "sdg_10_20",
  "sdg_10_30",
  "sdg_11_20",
  "sdg_11_60",
  "sdg_12_10",
  "sdg_16_10",
  "sdg_16_20",
  "sdg_16_30",
  "sts_copr_a",
  "sts_copr_m",
  "sts_inpr_a",
  "sts_inpr_m",
  "sts_intv_m",
  "sts_setu_m",
  "sts_trtu_a",
  "sts_trtu_m",
  "tour_cap_nat",
  "tour_cap_nuts2",
  "tour_cap_nuts3",
  "tour_occ_anor",
  "tour_occ_anor2",
  "tour_occ_mnor",
  "une_ltu_a",
  "une_rt_a",
  "une_rt_m",
]);

const API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
const TERMS = "https://ec.europa.eu/eurostat/help/copyright-notice";
export const EUROSTAT_LICENCE_NOTE = "Reused under Commission Decision 2011/833/EU; source: Eurostat. Strale reshapes the JSON-stat response into a flat list; Eurostat is not responsible for this rendering.";

// Checked 2026-10-26: EU27, EFTA, and the nine official candidates (Kosovo is
// only a potential candidate). Eurostat uses EL for Greece, not ISO GR.
// https://enlargement.ec.europa.eu/enlargement-policy/candidate-countries-and-potential-candidates_en
// https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=LEGISSUM:enlargement
// Commercial-country restriction: https://ec.europa.eu/eurostat/help/copyright-notice
export const EUROSTAT_ALLOWED_COUNTRIES: readonly string[] = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "EL", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "CH", "AL", "BA", "GE", "MD", "ME", "MK", "RS", "TR", "UA",
]);
// Geo codelist checked 2026-10-26 (EA21 is euro area from 2026):
// https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=TSV&lang=en
export const EUROSTAT_ALLOWED_AGGREGATES: readonly string[] = Object.freeze([
  "EA", ...Array.from({ length: 11 }, (_, i) => `EA${i + 11}`),
  "EU", "EU_V", "EU_V_NO", "EU6", "EU9", "EU10", "EU12", "EU15", "EU25",
  "EU27_2007", "EU27_2020", "EU28", "EFTA", "EEA", "EEA18", "EEA28", "EEA30_2007", "EEA31", "EEA30_2020",
  "EU27_2020_EFTA", "EU28_EFTA",
]);
export const EUROSTAT_ALLOWED_GEOS: readonly string[] = Object.freeze([...EUROSTAT_ALLOWED_COUNTRIES, ...EUROSTAT_ALLOWED_AGGREGATES]);
// Snapshot checked 2026-10-26: all 249 ISO 3166-1 alpha-2 codes, plus
// Eurostat country/territory aliases and every XX_X_YY country variant in ESTAT GEO.
// ISO: https://www.iso.org/obp/ui/#search/code/
// GEO: https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=TSV&lang=en
// English GEO labels fetched 2026-10-26 from the codelist URL above.
// ISO codes absent from GEO use its equivalent entries: AX=FI20, GB=UK,
// GF=FRY3, GP=FRY1, GR=EL, MQ=FRY2, RE=FRY4. The code set is unchanged.
export const EUROSTAT_COUNTRY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  AD: "Andorra",
  AE: "United Arab Emirates",
  AF: "Afghanistan",
  AG: "Antigua and Barbuda",
  AI: "Anguilla",
  AL: "Albania",
  AM: "Armenia",
  AN: "Netherlands Antilles",
  AO: "Angola",
  AQ: "Antarctica",
  AR: "Argentina",
  AS: "American Samoa",
  AT: "Austria",
  AU: "Australia",
  AW: "Aruba",
  AX: "Åland",
  AZ: "Azerbaijan",
  BA: "Bosnia and Herzegovina",
  BB: "Barbados",
  BD: "Bangladesh",
  BE: "Belgium",
  BF: "Burkina Faso",
  BG: "Bulgaria",
  BH: "Bahrain",
  BI: "Burundi",
  BJ: "Benin",
  BL: "Saint Barthélemy",
  BM: "Bermuda",
  BN: "Brunei Darussalam",
  BO: "Bolivia",
  BQ: "Bonaire, Saint Eustatius and Saba",
  BR: "Brazil",
  BS: "Bahamas",
  BT: "Bhutan",
  BV: "Bouvet Island",
  BW: "Botswana",
  BY: "Belarus",
  BZ: "Belize",
  CA: "Canada",
  CC: "Cocos (Keeling) Islands",
  CD: "Democratic Republic of the Congo",
  CF: "Central African Republic",
  CG: "Congo",
  CH: "Switzerland",
  CI: "Côte d’Ivoire",
  CK: "Cook Islands",
  CL: "Chile",
  CM: "Cameroon",
  CN: "China",
  CN_X_HK: "China except Hong Kong",
  CO: "Colombia",
  CP: "Clipperton",
  CQ: "Sark",
  CR: "Costa Rica",
  CU: "Cuba",
  CV: "Cabo Verde",
  CW: "Curaçao",
  CX: "Christmas Island",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DJ: "Djibouti",
  DK: "Denmark",
  DM: "Dominica",
  DO: "Dominican Republic",
  DZ: "Algeria",
  EC: "Ecuador",
  EE: "Estonia",
  EG: "Egypt",
  EH: "Western Sahara",
  EL: "Greece",
  ER: "Eritrea",
  ES: "Spain",
  ET: "Ethiopia",
  FI: "Finland",
  FJ: "Fiji",
  FK: "Falkland Islands",
  FM: "Federated States of Micronesia",
  FO: "Faroes",
  FR: "France",
  FX: "Metropolitan France",
  GA: "Gabon",
  GB: "United Kingdom",
  GD: "Grenada",
  GE: "Georgia",
  GF: "Guyane",
  GG: "Guernsey",
  GH: "Ghana",
  GI: "Gibraltar",
  GL: "Greenland",
  GM: "Gambia, The",
  GN: "Guinea",
  GP: "Guadeloupe",
  GQ: "Equatorial Guinea",
  GR: "Greece",
  GS: "South Georgia and the South Sandwich Islands",
  GT: "Guatemala",
  GU: "Guam",
  GW: "Guinea-Bissau",
  GY: "Guyana",
  HK: "Hong Kong",
  HM: "Heard Island and McDonald Islands",
  HN: "Honduras",
  HR: "Croatia",
  HT: "Haiti",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IM: "Isle of Man",
  IN: "India",
  IO: "British Indian Ocean Territory",
  IQ: "Iraq",
  IR: "Iran",
  IS: "Iceland",
  IT: "Italy",
  JE: "Jersey",
  JM: "Jamaica",
  JO: "Jordan",
  JP: "Japan",
  KE: "Kenya",
  KG: "Kyrgyzstan",
  KH: "Cambodia",
  KI: "Kiribati",
  KM: "Comoros",
  KN: "Saint Kitts and Nevis",
  KP: "North Korea",
  KR: "South Korea",
  KW: "Kuwait",
  KY: "Cayman Islands",
  KZ: "Kazakhstan",
  LA: "Laos",
  LB: "Lebanon",
  LC: "Saint Lucia",
  LI: "Liechtenstein",
  LK: "Sri Lanka",
  LR: "Liberia",
  LS: "Lesotho",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  LY: "Libya",
  MA: "Morocco",
  MC: "Monaco",
  MD: "Moldova",
  ME: "Montenegro",
  MF: "Saint Martin",
  MG: "Madagascar",
  MH: "Marshall Islands",
  MK: "North Macedonia",
  ML: "Mali",
  MM: "Myanmar/Burma",
  MN: "Mongolia",
  MO: "Macao",
  MP: "Northern Mariana Islands",
  MQ: "Martinique",
  MR: "Mauritania",
  MS: "Montserrat",
  MT: "Malta",
  MU: "Mauritius",
  MV: "Maldives",
  MW: "Malawi",
  MX: "Mexico",
  MY: "Malaysia",
  MZ: "Mozambique",
  NA: "Namibia",
  NC: "New Caledonia",
  NE: "Niger",
  NF: "Norfolk Island",
  NG: "Nigeria",
  NI: "Nicaragua",
  NL: "Netherlands",
  NO: "Norway",
  NP: "Nepal",
  NR: "Nauru",
  NU: "Niue",
  NZ: "New Zealand",
  OM: "Oman",
  PA: "Panama",
  PE: "Peru",
  PF: "French Polynesia",
  PG: "Papua New Guinea",
  PH: "Philippines",
  PK: "Pakistan",
  PL: "Poland",
  PM: "Saint Pierre and Miquelon",
  PN: "Pitcairn Islands",
  PR: "Puerto Rico",
  PS: "Palestine*",
  PT: "Portugal",
  PW: "Palau",
  PY: "Paraguay",
  QA: "Qatar",
  RE: "La Réunion",
  RO: "Romania",
  RS: "Serbia",
  RU: "Russia",
  RW: "Rwanda",
  SA: "Saudi Arabia",
  SB: "Solomon Islands",
  SC: "Seychelles",
  SD: "Sudan",
  SE: "Sweden",
  SG: "Singapore",
  SH: "Saint Helena, Ascension and Tristan da Cunha",
  SI: "Slovenia",
  SJ: "Svalbard and Jan Mayen",
  SK: "Slovakia",
  SL: "Sierra Leone",
  SM: "San Marino",
  SN: "Senegal",
  SO: "Somalia",
  SR: "Suriname",
  SS: "South Sudan",
  ST: "São Tomé and Príncipe",
  SV: "El Salvador",
  SX: "Sint Maarten",
  SY: "Syria",
  SZ: "Eswatini",
  TC: "Turks and Caicos Islands",
  TD: "Chad",
  TF: "French Southern and Antarctic Lands",
  TG: "Togo",
  TH: "Thailand",
  TJ: "Tajikistan",
  TK: "Tokelau",
  TL: "Timor-Leste",
  TM: "Turkmenistan",
  TN: "Tunisia",
  TO: "Tonga",
  TR: "Türkiye",
  TT: "Trinidad and Tobago",
  TV: "Tuvalu",
  TW: "Taiwan",
  TZ: "Tanzania",
  UA: "Ukraine",
  UG: "Uganda",
  UK: "United Kingdom",
  UM: "United States Minor Outlying Islands",
  US: "United States",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VA: "Holy See",
  VC: "Saint Vincent and the Grenadines",
  VE: "Venezuela",
  VG: "British Virgin Islands",
  VI: "US Virgin Islands",
  VN: "Viet Nam",
  VU: "Vanuatu",
  WF: "Wallis and Futuna",
  WS: "Samoa",
  XK: "Kosovo*",
  YE: "Yemen",
  YT: "Mayotte (FR - part of EU as of 01.01.2014)",
  ZA: "South Africa",
  ZM: "Zambia",
  ZW: "Zimbabwe",
});
export const EUROSTAT_WORLD_COUNTRIES: ReadonlySet<string> = new Set(Object.keys(EUROSTAT_COUNTRY_LABELS));
export function allowedEurostatCountry(value: string): boolean {
  return EUROSTAT_ALLOWED_COUNTRIES.includes(value.toUpperCase());
}
export function allowedEurostatValue(dimension: string, value: string): boolean {
  if (dimension.toLowerCase() !== "geo") return true;
  const code = value.toUpperCase();
  return allowedEurostatCountry(code) || EUROSTAT_ALLOWED_AGGREGATES.includes(code) ||
    (/^[A-Z]{2}[0-9A-Z]{1,3}$/.test(code) && allowedEurostatCountry(code.slice(0, 2)));
}
// Compare words after case, whitespace and punctuation normalisation. A suffix
// is allowed at a word boundary, e.g. China (People's Republic of China).
function normaliseCountryLabel(label: string): string {
  return label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function eurostatCategoryIsCountry(code: string, label: string | undefined): boolean {
  const upper = code.toUpperCase();
  if (!EUROSTAT_WORLD_COUNTRIES.has(upper) || typeof label !== "string") return false;
  const expected = normaliseCountryLabel(EUROSTAT_COUNTRY_LABELS[upper]);
  const actual = normaliseCountryLabel(label);
  return actual === expected || actual.startsWith(`${expected} `);
}
function allowedReturnedCategory(dimension: string, code: string, label: string | undefined): boolean {
  if (dimension !== "geo") return true;
  // Label-aware country detection is defence in depth for geo alone.
  if (eurostatCategoryIsCountry(code, label) && !allowedEurostatCountry(code)) return false;
  return allowedEurostatValue(dimension, code);
}
// Deliberately exclude ALL trade datasets, covering both Swiss/Liechtenstein
// post-1995 commodity data (exception c) and Austrian CN8 declaring-country data.
export const EUROSTAT_REFUSED_DATASET_PREFIXES = ["ext_", "ds-", "comext", "itgs_", "trade_", "tet", "teiet", "tipsex", "cult_trd_", "sprt_trd_", "enpe_ext_", "bop_its", "for_trop", "ei_etea"] as const;
const TOKEN = /^[A-Za-z0-9_.-]{1,40}$/;
const PERIOD = /^\d{4}(?:-Q[1-4]|-(?:0[1-9]|1[0-2]))?$/;
const MAX_OBSERVATIONS = 5000;

export class EurostatError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EurostatError";
  }
  toJSON() {
    return { error_code: this.code, message: this.message, details: this.details, source: "Eurostat", licence_note: EUROSTAT_LICENCE_NOTE };
  }
}
function refuse(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new EurostatError(code, message, details);
}
function refuseTrade(dataset: string): never {
  return refuse("commercial_reuse_restricted", `Dataset '${sanitise(dataset)}' is excluded: international trade data are refused under Eurostat copyright exception (c), including Swiss/Liechtenstein trade and Austrian CN8 restrictions. Choose a domestic-activity or non-trade dataset.`, { dataset, terms_url: TERMS });
}

export function validateEurostatInput(input: CapabilityInput): URL {
  const { dataset, filters, since_period, until_period } = input;
  if (typeof dataset !== "string") refuse("invalid_request", "'dataset' must match ^[a-z0-9_]{3,40}$. Find codes in the Eurostat data browser.");
  if (!EUROSTAT_ALLOWED_DATASETS.includes(dataset)) refuse("dataset_not_supported", `Dataset '${dataset}' is not supported. Request an addition through Strale support with the dataset code and intended filters; additions require a Eurostat source and geography/terms metadata review.`, { dataset, allowed_datasets: EUROSTAT_ALLOWED_DATASETS });
  if (EUROSTAT_REFUSED_DATASET_PREFIXES.some(p => dataset.startsWith(p))) refuseTrade(dataset);
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) refuse("invalid_request", "'filters' must be an object with a required 'geo' filter.");
  const entries = Object.entries(filters);
  if (!entries.length || entries.length > 10) refuse("invalid_request", "Supply 1–10 filter dimensions, including geo.");
  const url = new URL(dataset, API);
  url.searchParams.set("lang", "EN");
  let count = 0;
  const seen = new Set<string>();
  for (const [rawKey, raw] of entries) {
    const key = rawKey.toLowerCase();
    if (seen.has(key)) refuse("invalid_request", `Duplicate filter dimension '${key}' (keys are case-insensitive).`);
    seen.add(key);
    // These are request options, not dimension filters; prevent query overrides.
    if (!TOKEN.test(key) || ["lang", "format", "sincetimeperiod", "untiltimeperiod", "lasttimeperiod"].includes(key)) refuse("invalid_request", "Invalid filter dimension; use a dimension code matching ^[A-Za-z0-9_.-]{1,40}$, not a request option.");
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.length) refuse("invalid_request", `Filter '${key}' needs at least one value.`);
    count += values.length;
    if (count > 50) refuse("invalid_request", "At most 50 filter values are allowed.");
    for (const value of values) {
      if (typeof value !== "string" || !TOKEN.test(value)) refuse("invalid_request", `Filter '${key}' values must match ^[A-Za-z0-9_.-]{1,40}$.`);
      if (!allowedEurostatValue(key, value)) refuse("commercial_reuse_restricted", `Eurostat's terms do not permit commercial reuse of category '${value}'. Choose an allowed EU, EFTA or official candidate country, or supported EU/euro-area aggregate.`, { dimension: key, geo: value, terms_url: TERMS });
      url.searchParams.append(key, key === "geo" ? value.toUpperCase() : value);
    }
  }
  if (!seen.has("geo")) refuse("invalid_request", "The 'geo' filter is required for commercial reuse.");
  for (const [key, value] of [["sinceTimePeriod", since_period], ["untilTimePeriod", until_period]] as const) {
    if (value !== undefined) {
      if (typeof value !== "string" || !PERIOD.test(value)) refuse("invalid_request", "Periods must be YYYY, YYYY-Q1…Q4 or YYYY-MM (01…12).");
      url.searchParams.set(key, value);
    }
  }
  if (typeof since_period === "string" && typeof until_period === "string") {
    const month = (period: string, upper: boolean) => {
      const year = Number(period.slice(0, 4));
      const suffix = period.slice(5);
      const offset = !suffix ? (upper ? 11 : 0)
        : suffix.startsWith("Q") ? (Number(suffix.slice(1)) - 1) * 3 + (upper ? 2 : 0)
        : Number(suffix) - 1;
      return year * 12 + offset;
    };
    if (month(since_period, false) > month(until_period, true)) refuse("invalid_request", "since_period must not follow until_period.");
  }
  return url;
}

type Metadata = Record<string, unknown>;
function record(value: unknown): value is Metadata { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** No generic catalogue endpoint is assumed: inspect the JSON-stat metadata
 * returned with this exact query. Linked ESMS documents are not fetched. */
export function checkEurostatMetadata(data: Metadata, dataset: string): boolean {
  if (EUROSTAT_REFUSED_DATASET_PREFIXES.some(p => dataset.toLowerCase().startsWith(p))) refuseTrade(dataset);
  let sourceFound = false;
  function source(value: unknown) {
    sourceFound = true;
    const sources = Array.isArray(value) ? value : [value];
    if (!sources.length || sources.some(v => typeof v !== "string" || !/^(?:Eurostat|ESTAT|European Commission[, /-]+Eurostat)$/i.test(v.trim()))) {
      refuse("commercial_reuse_restricted", `Dataset '${dataset}' identifies a source other than Eurostat or an unrecognised source declaration. Commercial reuse is refused under exception (a).`, { dataset, terms_url: TERMS });
    }
  }
  function tradeLabels(value: unknown) {
    if (typeof value === "string") {
      // Remove only domestic activity phrases; any remaining trade/import/export
      // word still refuses mixed domestic/international titles.
      if (/\b(?:international|foreign|extra[ -]EU|intra[ -]EU)\b/i.test(value) && /\btrade\b/i.test(value)) refuseTrade(dataset);
      const remaining = value.replace(/\b(?:(?:retail|wholesale|distributive)\s+trade|trade\s+sector)\b/gi, "");
      if (/\b(?:trade|imports?|exports?)\b/i.test(remaining)) refuseTrade(dataset);
    }
    if (Array.isArray(value)) value.forEach(tradeLabels);
    else if (record(value)) Object.values(value).forEach(tradeLabels);
  }
  // Dimension category labels (e.g. citizen "European Free Trade Association") describe values,
  // not the dataset: the trade-word rule applies to dataset-level metadata only.
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach((v) => visit(v)); return; }
    if (!record(value)) return;
    const type = String(value.type ?? "");
    // A source DATASET is a lineage link, not a source institution.
    if (/^DISSEMINATION_SOURCE_DATASET$/i.test(type) && typeof value.title === "string" && /^(?:ext_|ds-|comext)/i.test(value.title)) refuseTrade(dataset);
    if (/^(?:source|sources|source_institutions|data_source|copyright_holder|owner|copyright|rights|licen[cs]e)$/i.test(type)) {
      const declaration = value.text ?? value.title ?? value.value;
      if (declaration !== undefined) {
        if (/source|owner/i.test(type)) source(declaration);
        else if (!/^(?:Eurostat|ESTAT|European Union|© European Union)$/i.test(String(declaration).trim())) {
          refuse("commercial_reuse_restricted", `Dataset '${dataset}' carries a rights notice requiring separate assessment; commercial reuse is refused.`, { dataset, terms_url: TERMS });
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      // JSON-stat extension maps positions by dimension id, including owner.
      if (key === "positions-with-no-data") continue;
      if (/^(?:source|sources|source_institutions|data_source|copyright_holder|owner)$/i.test(key) && child !== undefined && child !== null) source(child);
      if (/^(?:theme|label|title|category|subject|text)$/i.test(key)) tradeLabels(child);
      if (/^(?:copyright|rights|licen[cs]e)$/i.test(key) && child !== undefined && child !== null && !/^(?:Eurostat|ESTAT|European Union|© European Union)$/i.test(String(child).trim())) {
        refuse("commercial_reuse_restricted", `Dataset '${dataset}' carries a rights notice requiring separate assessment; commercial reuse is refused.`, { dataset, terms_url: TERMS });
      }
      visit(child);
    }
  }
  visit({ source: data.source, title: data.title, theme: data.theme, category: data.category, label: data.label, extension: data.extension, annotation: data.annotation, annotations: data.annotations });
  // Dimension ids and category codes are data, never ownership declarations.
  // Dataset-level source/rights annotations above remain checked.
  // Structural marker: trade tables carry a stk_flow (imports / exports) dimension.
  if (record(data.dimension) && Object.keys(data.dimension).some((id) => id.toLowerCase() === "stk_flow")) refuseTrade(dataset);
  return sourceFound;
}

export interface JsonStat {
  version: string; class: string; label: string; updated?: string;
  id: string[]; size: number[];
  dimension: Record<string, { label?: string; category: { index: Record<string, number> | string[]; label?: Record<string, string> } }>;
  value: Record<string, number | null> | (number | null)[];
  status?: Record<string, string> | string[];
  [key: string]: unknown;
}

export function flattenEurostat(data: JsonStat) {
  if (data.class !== "dataset" || data.version !== "2.0" || !Array.isArray(data.id) || !Array.isArray(data.size) || data.id.length !== data.size.length || !data.id.includes("geo") || !data.id.includes("time") || new Set(data.id).size !== data.id.length || !data.value || typeof data.value !== "object") refuse("upstream_invalid_response", "Eurostat returned an unsupported JSON-stat dataset.");
  let total = 1;
  for (const size of data.size) {
    if (!Number.isSafeInteger(size) || size < 0) refuse("upstream_invalid_response", "Eurostat returned invalid dimension sizes.");
    total *= size;
  }
  if (!Number.isSafeInteger(total) || total > MAX_OBSERVATIONS || Object.keys(data.value).length > MAX_OBSERVATIONS) refuse("observation_limit_exceeded", "Response exceeds 5,000 observations. Narrow filters or period bounds.", { max_observations: MAX_OBSERVATIONS });
  // Reserved output keys cannot be overwritten by dimension ids.
  if (data.id.some(id => ["period", "value", "status", "__proto__", "constructor", "prototype"].includes(id))) refuse("upstream_invalid_response", "Eurostat returned a reserved dimension id.");
  const codes = data.id.map((id, i) => {
    const category = data.dimension?.[id]?.category;
    if (!category || !category.index) refuse("upstream_invalid_response", `Eurostat omitted categories for '${id}'.`);
    const ordered = Array.isArray(category.index) ? category.index : Object.entries(category.index).sort((a, b) => a[1] - b[1]).map(([code]) => code);
    if (ordered.length !== data.size[i] || (!Array.isArray(category.index) && ordered.some((code, position) => (category.index as Record<string, number>)[code] !== position))) refuse("upstream_invalid_response", "Eurostat returned inconsistent category positions.");
    return ordered;
  });
  const observations: Record<string, string | number | null>[] = [];
  let dropped = 0;
  const droppedByDimension = new Map<string, number>();
  for (let index = 0; index < total; index++) {
    let remainder = index;
    const row: Record<string, string | number | null> = {};
    for (let dim = data.id.length - 1; dim >= 0; dim--) {
      row[data.id[dim]] = codes[dim][remainder % data.size[dim]];
      remainder = Math.floor(remainder / data.size[dim]);
    }
    const restricted = data.id.filter(id => !allowedReturnedCategory(id, String(row[id]), data.dimension[id].category.label?.[String(row[id])]));
    if (restricted.length) {
      dropped++;
      // A cell restricted in multiple dimensions counts once overall, once per dimension.
      for (const id of restricted) droppedByDimension.set(id, (droppedByDimension.get(id) ?? 0) + 1);
      continue;
    }
    row.period = row.time;
    const value = Array.isArray(data.value) ? data.value[index] : data.value[String(index)];
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value))) refuse("upstream_invalid_response", "Eurostat returned a non-numeric observation.");
    row.value = value ?? null;
    const status = Array.isArray(data.status) ? data.status[index] : data.status?.[String(index)];
    if (status !== undefined && status !== null) row.status = String(status);
    observations.push(row);
  }
  // Only categories actually present in permitted observations are returned.
  const dimensions = data.id.map((id, i) => ({ id, label: data.dimension[id].label ?? id, categories: codes[i].filter(code => observations.some(row => row[id] === code)).map(code => ({ code, label: data.dimension[id].category.label?.[code] ?? code })) }));
  return { dimensions, observations, dropped_observation_count: dropped, dropped_observation_count_by_dimension: Object.fromEntries(droppedByDimension) };
}

function sanitise(value: unknown): string {
  return String(value ?? "Eurostat rejected the request").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}

export async function executeEurostat(input: CapabilityInput) {
  const url = validateEurostatInput(input);
  const dataset = input.dataset as string;
  try {
    const response = await fetch(url.toString(), { headers: { Accept: "application/json", "User-Agent": "Strale/1.0 (+https://strale.dev)" }, signal: AbortSignal.timeout(20000), redirect: "error" });
    if (response.status === 404) refuse("not_found", `Unknown Eurostat dataset '${dataset}'. Check the Eurostat data browser.`, { dataset });
    let body: Metadata;
    try { body = await response.json() as Metadata; } catch (error) {
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw error;
      if (response.status === 413) refuse("observation_limit_exceeded", "Eurostat extraction is too big. Narrow filters or period bounds.", { dataset, upstream_status: 413 });
      refuse("upstream_invalid_response", `Eurostat returned a non-JSON response for '${dataset}' (HTTP ${response.status}).`);
    }
    if (!record(body)) {
      if (response.status === 413) refuse("observation_limit_exceeded", "Eurostat extraction is too big. Narrow filters or period bounds.", { dataset, upstream_status: 413 });
      refuse("upstream_invalid_response", "Eurostat returned an invalid response.");
    }
    if (!response.ok || body.error) {
      const errors = Array.isArray(body.error) ? body.error.filter(record) : record(body.error) ? [body.error] : [body];
      const error = errors[0] ?? body;
      const message = sanitise(errors.map(e => e.label ?? e.message).filter(v => v !== undefined).join("; ") || body.message);
      if (response.status === 413 || /EXTRACTION_TOO_BIG|ASYNCHRONOUS_RESPONSE/i.test(message)) refuse("observation_limit_exceeded", `Eurostat: ${message}. Narrow filters or period bounds.`, { dataset, upstream_status: response.status });
      const unknown = Number(error.status) === 404 || /not found|unknown dataset|invalid dataset|does not exist|ERR_DATA_NOT_FOUND/i.test(message);
      refuse(unknown ? "not_found" : "upstream_error", `Eurostat dataset '${dataset}': ${message}`, { dataset, upstream_status: response.status });
    }
    const sourceFound = checkEurostatMetadata(body, dataset);
    const flat = flattenEurostat(body as unknown as JsonStat);
    if (!flat.observations.some(row => row.value !== null)) refuse("no_observations", "No observations for these filters. Choose different filters or period bounds.", { dataset, dropped_observation_count: flat.dropped_observation_count, dropped_observation_count_by_dimension: flat.dropped_observation_count_by_dimension });
    const asOf = new Date().toISOString();
    const updatedDate = typeof body.updated === "string" ? new Date(body.updated) : null;
    const units = flat.dimensions.find(d => d.id === "unit")?.categories;
    return {
      output: { dataset, label: typeof body.label === "string" ? body.label : dataset, updated: updatedDate && Number.isFinite(updatedDate.getTime()) ? updatedDate.toISOString() : null,
        ...(units?.length === 1 ? { unit: units[0].code } : {}), ...flat, observation_count: flat.observations.length,
        source: "Eurostat", licence_note: EUROSTAT_LICENCE_NOTE, source_url: url.toString(), dataset_doi: `10.2908/${dataset.toUpperCase()}`, accessed_at: asOf.slice(0, 10), as_of: asOf,
        metadata_limitations: sourceFound ? "Source declarations checked in the returned JSON-stat metadata; separately linked ESMS documents and catalogue rights notices are not inspected." : "No source declaration exposed in the returned JSON-stat metadata. Third-party restrictions may be unexposed; separately linked ESMS documents and catalogue rights notices are not inspected. Explicit dataset-prefix and trade-theme refusals still apply.",
      },
      provenance: { source: "Eurostat", fetched_at: asOf, upstream_vendor: "Eurostat", acquisition_method: "direct_api", source_url: url.toString() },
    };
  } catch (error) {
    if (error instanceof EurostatError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) refuse("timeout_exceeded", `Eurostat request for '${dataset}' timed out. Retry with narrower filters.`);
    refuse("upstream_unavailable", `Eurostat request for '${dataset}' failed. Retry later.`);
  }
}
registerCapability("eurostat-data", executeEurostat);
