/**
 * Status normaliser for company-status-check (portfolio plan 1C.1).
 *
 * Every registry executor already returns a `status` string, in its own
 * vocabulary. Some pass the registry's raw value through (IE, SG, AU), some
 * translate it first (SE, NO, FR, FI, ...). This module maps THAT string, per
 * registry slug, to one enum. It never guesses: a value with no row below is
 * `unknown`, and the caller still gets the raw string back.
 *
 * Enum meaning (kept deliberately narrow):
 *   active          registered and carrying on as a going concern in the registry
 *   inactive        the registry marks it inactive/closed without saying dissolved
 *   dissolved       the registry says dissolved / ceased to exist as a legal entity
 *   in_liquidation  winding-up under way, entity still on the register
 *   in_insolvency   bankruptcy, administration, receivership, examinership
 *   struck_off      removed (deregistered / deleted / struck) from the register
 *   unknown         no mapping row; see `registry_status_raw`
 *
 * "active" is a statement about the REGISTER, not about trading: a registered
 * company can be dormant. The manifest says so.
 *
 * Source of every row: `source` names where the raw value comes from. "executor"
 * rows cite the line of the executor that produces the string; "CRO open data"
 * rows come from a live distinct-value query on 2026-10-26 (see the IE block).
 */

export const COMPANY_STATUSES = [
  "active",
  "inactive",
  "dissolved",
  "in_liquidation",
  "in_insolvency",
  "struck_off",
  "unknown",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export interface StatusMapRow {
  /** Registry executor slug whose `status` output this row maps. */
  slug: string;
  /** Raw value as the executor returns it (matching is trim + case-insensitive). */
  raw: string;
  status: CompanyStatus;
  /** Where the raw value and its meaning come from. */
  source: string;
}

const AT = "austrian-company-data";
const AU = "au-company-data";
const CZ = "cz-company-data";
const EE = "estonian-company-data";
const FI = "finnish-company-data";
const FR = "french-company-data";
const GB = "uk-company-data";
const GR = "greek-company-data";
const HR = "croatian-company-data";
const IE = "irish-company-data";
const LV = "latvian-company-data";
const NO = "norwegian-company-data";
const PL = "polish-company-data";
const SE = "swedish-company-data";
const SG = "singapore-company-data";

const IE_SRC = "CRO open data, company_status distinct values queried live 2026-10-26 (opendata.cro.ie datastore_search_sql, resource 3fef41bc-b8f4-4b10-8434-ce51c29b1bba); executor passes the value through (irish-company-data.ts `status: clean(record.company_status)`)";

export const STATUS_MAP_ROWS: readonly StatusMapRow[] = [
  // Austria. The Firmenbuch has no status field; the executor derives one from
  // legal facts: dissolution fact present -> "dissolved", else "active"
  // (austrian-company-data.ts, "const status = dissolution ? \"dissolved\" : \"active\"").
  { slug: AT, raw: "active", status: "active", source: "executor: austrian-company-data.ts status derivation" },
  { slug: AT, raw: "dissolved", status: "dissolved", source: "executor: austrian-company-data.ts status derivation" },

  // Australia. ABR entityStatusCode, passed through (au-company-data.ts `status: statusCode`).
  // ABN Lookup web services define two codes: Active and Cancelled. Fixture: status "Active".
  { slug: AU, raw: "Active", status: "active", source: "ABR entityStatusCode; manifest au-company-data.yaml fixture" },
  { slug: AU, raw: "Cancelled", status: "inactive", source: "ABR entityStatusCode (ABN cancelled); not re-fetched in-session" },

  // Czechia. deriveStatus() in cz-company-data.ts: stavZdrojeRos AKTIVNI -> "active",
  // ZANIKLY -> "dissolved" (zanikly = ceased to exist), no ROS block -> "unknown".
  // Any other stavZdrojeRos is returned lower-cased by the executor and is left unmapped.
  { slug: CZ, raw: "active", status: "active", source: "executor: cz-company-data.ts deriveStatus (AKTIVNI)" },
  { slug: CZ, raw: "dissolved", status: "dissolved", source: "executor: cz-company-data.ts deriveStatus (ZANIKLY)" },
  { slug: CZ, raw: "unknown", status: "unknown", source: "executor: cz-company-data.ts deriveStatus (no ROS registration)" },

  // Estonia. statusMap in estonian-company-data.ts over the Business Register
  // (RIK) status codes: R registered, L in liquidation, K deleted, N bankrupt.
  { slug: EE, raw: "active", status: "active", source: "executor: estonian-company-data.ts statusMap R" },
  { slug: EE, raw: "in_liquidation", status: "in_liquidation", source: "executor: estonian-company-data.ts statusMap L" },
  { slug: EE, raw: "deleted", status: "struck_off", source: "executor: estonian-company-data.ts statusMap K (kustutatud, deleted from register)" },
  { slug: EE, raw: "in_bankruptcy", status: "in_insolvency", source: "executor: estonian-company-data.ts statusMap N (pankrotis)" },

  // Finland. finnish-company-data.ts: liquidation situation present -> "liquidation";
  // PRH tradeRegisterStatus "1" -> "active"; any other value -> "inactive".
  { slug: FI, raw: "active", status: "active", source: "executor: finnish-company-data.ts (tradeRegisterStatus 1)" },
  { slug: FI, raw: "liquidation", status: "in_liquidation", source: "executor: finnish-company-data.ts (companySituations liquidation)" },
  { slug: FI, raw: "inactive", status: "inactive", source: "executor: finnish-company-data.ts (tradeRegisterStatus other than 1)" },

  // France. french-company-data.ts maps INSEE etat_administratif: A -> "active", C -> "closed"
  // (cessee); any other code is returned as is and stays unmapped.
  { slug: FR, raw: "active", status: "active", source: "executor: french-company-data.ts (etat_administratif A)" },
  { slug: FR, raw: "closed", status: "inactive", source: "executor: french-company-data.ts (etat_administratif C, cessee)" },

  // United Kingdom. statusMap in uk-company-data.ts over Companies House company_status;
  // raw values not in the map are returned unchanged by the executor and stay unmapped here.
  { slug: GB, raw: "active", status: "active", source: "executor: uk-company-data.ts statusMap (active, open)" },
  { slug: GB, raw: "dissolved", status: "dissolved", source: "executor: uk-company-data.ts statusMap" },
  { slug: GB, raw: "in_liquidation", status: "in_liquidation", source: "executor: uk-company-data.ts statusMap (liquidation)" },
  { slug: GB, raw: "receivership", status: "in_insolvency", source: "executor: uk-company-data.ts statusMap" },
  { slug: GB, raw: "administration", status: "in_insolvency", source: "executor: uk-company-data.ts statusMap" },
  { slug: GB, raw: "insolvency", status: "in_insolvency", source: "executor: uk-company-data.ts statusMap (insolvency-proceedings)" },
  { slug: GB, raw: "voluntary_arrangement", status: "in_insolvency", source: "executor: uk-company-data.ts statusMap (voluntary-arrangement)" },
  { slug: GB, raw: "closed", status: "inactive", source: "executor: uk-company-data.ts statusMap (closed, converted-closed)" },

  // Greece. deriveStatus() in greek-company-data.ts over GEMI status.descr:
  // contains "ενεργ" -> "active"; "διαγραφ"/"λυσ" -> "dissolved"; "εκκαθ" -> "liquidation";
  // otherwise the Greek description itself is returned and stays unmapped.
  { slug: GR, raw: "active", status: "active", source: "executor: greek-company-data.ts deriveStatus" },
  { slug: GR, raw: "dissolved", status: "dissolved", source: "executor: greek-company-data.ts deriveStatus" },
  { slug: GR, raw: "liquidation", status: "in_liquidation", source: "executor: greek-company-data.ts deriveStatus" },

  // Croatia. croatian-company-data.ts: Sudski registar status code 1 -> "active",
  // null -> "unknown", any other code -> "inactive".
  { slug: HR, raw: "active", status: "active", source: "executor: croatian-company-data.ts (status code 1)" },
  { slug: HR, raw: "inactive", status: "inactive", source: "executor: croatian-company-data.ts (status code other than 1)" },
  { slug: HR, raw: "unknown", status: "unknown", source: "executor: croatian-company-data.ts (no status code)" },

  // Ireland. Raw CRO values, 23 distinct on 2026-10-26. Mapped only where the value's
  // meaning is unambiguous; the rest (Strike Off Listed, Deleted ..., De-Registered ...,
  // Conv. to IndProvSoc) stay unmapped on purpose: "listed for strike-off" is not
  // yet struck off, and merger/conversion deletions are not a dissolution of a going concern.
  { slug: IE, raw: "Normal", status: "active", source: IE_SRC },
  { slug: IE, raw: "Dissolved", status: "dissolved", source: IE_SRC },
  { slug: IE, raw: "Dissolved-20 years", status: "dissolved", source: IE_SRC },
  { slug: IE, raw: "Dissolved PostMerger", status: "dissolved", source: IE_SRC },
  { slug: IE, raw: "Dissolved by Divis", status: "dissolved", source: IE_SRC },
  { slug: IE, raw: "Struck Off", status: "struck_off", source: IE_SRC },
  { slug: IE, raw: "Liquidation", status: "in_liquidation", source: IE_SRC },
  { slug: IE, raw: "Liquidation (UK)", status: "in_liquidation", source: IE_SRC },
  { slug: IE, raw: "Liquidation stayed", status: "in_liquidation", source: IE_SRC },
  { slug: IE, raw: "Examinership", status: "in_insolvency", source: IE_SRC },
  { slug: IE, raw: "Administration", status: "in_insolvency", source: IE_SRC },
  { slug: IE, raw: "Administration (UK)", status: "in_insolvency", source: IE_SRC },
  { slug: IE, raw: "Ceased", status: "inactive", source: IE_SRC },
  { slug: IE, raw: "Ceased IRL", status: "inactive", source: IE_SRC },

  // Latvia. deriveStatus() in latvian-company-data.ts: terminated flag -> "Likvidēts"
  // (liquidated), a closed date -> "Slēgts" (closed), otherwise "Reģistrēts" (registered).
  { slug: LV, raw: "Reģistrēts", status: "active", source: "executor: latvian-company-data.ts deriveStatus; manifest fixture" },
  { slug: LV, raw: "Slēgts", status: "inactive", source: "executor: latvian-company-data.ts deriveStatus (closed date set)" },
  { slug: LV, raw: "Likvidēts", status: "dissolved", source: "executor: latvian-company-data.ts deriveStatus (terminated: liquidation completed)" },

  // Norway. norwegian-company-data.ts: konkurs -> "bankrupt", underAvvikling -> "dissolving",
  // else "active" (Brreg Enhetsregisteret flags).
  { slug: NO, raw: "active", status: "active", source: "executor: norwegian-company-data.ts (no konkurs/underAvvikling flag)" },
  { slug: NO, raw: "bankrupt", status: "in_insolvency", source: "executor: norwegian-company-data.ts (konkurs)" },
  { slug: NO, raw: "dissolving", status: "in_liquidation", source: "executor: norwegian-company-data.ts (underAvvikling)" },

  // Poland. polish-company-data.ts: a deregistration entry (czyWykreslony) -> "deregistered"
  // (wykreslony = struck from the KRS), else "active".
  { slug: PL, raw: "active", status: "active", source: "executor: polish-company-data.ts" },
  { slug: PL, raw: "deregistered", status: "struck_off", source: "executor: polish-company-data.ts (czyWykreslony)" },

  // Sweden. deriveStatus() in swedish-company-data.ts: Bolagsverket avregistrering date or
  // verksam = NEJ -> "deregistered"; verksam = JA -> "active"; neither -> "unknown".
  { slug: SE, raw: "active", status: "active", source: "executor: swedish-company-data.ts deriveStatus (verksam JA)" },
  { slug: SE, raw: "deregistered", status: "struck_off", source: "executor: swedish-company-data.ts deriveStatus (avregistrerad)" },
  { slug: SE, raw: "unknown", status: "unknown", source: "executor: swedish-company-data.ts deriveStatus" },

  // Singapore. ACRA uen_status_desc, passed through (singapore-company-data.ts `status: clean(record.uen_status_desc)`).
  // The executor itself treats exactly "Registered" as live (`is_active`); "Deregistered" was
  // observed on the first record of data.gov.sg resource d_3f960c10fed6145404ca7b821f263b87 on 2026-10-26.
  // Other ACRA values stay unmapped (the distinct-value query is not available on that API).
  { slug: SG, raw: "Registered", status: "active", source: "executor: singapore-company-data.ts is_active; manifest fixture" },
  { slug: SG, raw: "Deregistered", status: "inactive", source: "data.gov.sg ACRA dataset, observed value 2026-10-26" },
];

function key(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

const INDEX: ReadonlyMap<string, CompanyStatus> = new Map(
  STATUS_MAP_ROWS.map((r) => [`${r.slug}\u0000${key(r.raw)}`, r.status]),
);

export interface NormalisedStatus {
  status: CompanyStatus;
  /** The executor's value, trimmed; null when the executor returned none. */
  registry_status_raw: string | null;
  /** False when no mapping row matched (status is then "unknown"). */
  mapped: boolean;
}

/** Slugs this module has mapping rows for. */
export function mappedSlugs(): string[] {
  return [...new Set(STATUS_MAP_ROWS.map((r) => r.slug))];
}

export function normaliseStatus(slug: string, rawValue: unknown): NormalisedStatus {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return { status: "unknown", registry_status_raw: null, mapped: false };
  }
  const raw = rawValue.trim();
  const hit = INDEX.get(`${slug}\u0000${key(raw)}`);
  if (hit === undefined) return { status: "unknown", registry_status_raw: raw, mapped: false };
  return { status: hit, registry_status_raw: raw, mapped: true };
}
