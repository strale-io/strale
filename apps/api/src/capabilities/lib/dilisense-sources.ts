/**
 * Dilisense source attribution for the audit-grade `lists_queried` evidence
 * shape. Checked on 2026-11-07 against the publisher's own catalogue pages,
 * https://dilisense.com/en/sources/sanction-sources and
 * https://dilisense.com/en/sources/politically-exposed-persons-list (robots.txt
 * allows them). The first snapshot (2026-04-27) also named World Bank, EBRD and
 * regional development bank debarment lists; those sit on Dilisense's separate
 * risk-intelligence page as paid add-ons "switched on and off per client", and
 * nothing here shows them switched on for Strale, so they are not claimed.
 * Re-check every 180 days (config/reference-data.yaml) and move this date.
 *
 * Used by sanctions-check and pep-check to populate a meaningful list of
 * underlying sources screened, even though the Dilisense screening API
 * doesn't expose per-list versioning per call.
 */

export const DILISENSE_SOURCES_AS_OF = "2026-11-07";

export type DilisenseListsQueried = {
  collection: string;
  source_count: number;
  major_lists: string[];
  freshness_note: string;
  source_catalog_url: string;
  /** null because Dilisense /v1/checkIndividual + /v1/checkEntity don't expose per-list timestamps */
  version: null;
  last_updated_at: null;
};

const SANCTIONS_MAJOR_LISTS = [
  // International (always queried via consolidated endpoint)
  "UN Security Council — Consolidated List",
  "UN Security Council — ISIL (Da'esh) & Al-Qaida Sanctions List",
  "UN Security Council — 1718 Designated Vessels List",
  "European Commission — Consolidated List of Financial Sanctions",
  "European Commission — Consolidated List of Travel Bans",
  "European Council — Decisions (CFSP)",
  "European Council — Regulations",
  // United States
  "OFAC — Specially Designated Nationals (SDN)",
  "OFAC — Non-SDN Sanction List",
  "BIS — Entity List",
  "BIS — Denied Persons List",
  "BIS — Military End User (MEU) List",
  "DOS — Foreign Terrorist Organizations",
  "DOS — Nonproliferation Sanctions",
  "DDTC — AECA Debarred Administrative List",
  "DDTC — AECA Debarred Statutory List",
  "DOD — Section 1260H Chinese Military Companies",
  "DHS — UFLPA Entity List",
  // United Kingdom
  "HMT OFSI — Ukraine Restrictive Measures",
  "UK Government — Sanctions List",
  "Home Office — Proscribed Terrorist Groups",
  // Switzerland / Norway / EU member states (a sample — full list in source_catalog_url)
  "SECO — Switzerland Sanctions",
  "Norwegian MFA — Sanctions and Restrictive Measures",
  "Bundesministerium des Innern — Verbotene Organisationen (DE)",
  "France Trésor — Registre des Gels",
  "Belgium FPS Finance — Consolidated List",
  "Estonian Government — Sanctions",
  "Latvia FIS — Sankciju subjekti",
  "Czech MFA — National Sanctions List",
  // Asia-Pacific
  "Australia DFAT — Consolidated List",
  "Japan MOF — Asset Freeze List",
  "Singapore MAS — Targeted Financial Sanctions",
] as const;

/**
 * Lists marked "Included" in Dilisense's sanctions catalogue on 2026-11-07.
 * The catalogue names 125 lists; five more (Russia's MFA Stop List and four
 * Turkish frozen-asset lists) are marked "Paid products", and whether Strale's
 * plan includes them is not confirmed, so they are not counted.
 */
const DILISENSE_SANCTIONS_SOURCE_COUNT = 120;

export const DILISENSE_SANCTIONS_LISTS_QUERIED: DilisenseListsQueried = {
  collection: "dilisense/consolidated-sanctions",
  source_count: DILISENSE_SANCTIONS_SOURCE_COUNT,
  major_lists: [...SANCTIONS_MAJOR_LISTS],
  freshness_note:
    "Dilisense consolidates 120 sanctions and restrictive-measure lists into one index, and states that it is updated every 60 minutes. Per-list timestamps are not exposed by the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/sanction-sources",
  version: null,
  last_updated_at: null,
};

const PEP_MAJOR_SOURCES = [
  // What the publisher's PEP catalogue states (2026-11-07). Its only named
  // national sources are its worked example for Germany, kept below as that.
  "EU C/2023/724 — public functions defining PEPs in each Member State",
  "Politicians",
  "Embassy, military, agency and international-organisation officials",
  "Judges and prosecution officials",
  "Central bank and state-owned enterprise board members",
  "Relatives and close associates (RCAs)",
  "Example given by the publisher for Germany: Federal President, Bundestag, Bundesrat, Bundesbank, and state-owned enterprises (Deutsche Bahn, Bundesdruckerei, BwConsulting)",
] as const;

export const DILISENSE_PEP_LISTS_QUERIED: DilisenseListsQueried = {
  collection: "dilisense/consolidated-pep",
  source_count: 230,
  major_lists: [...PEP_MAJOR_SOURCES],
  freshness_note:
    "Dilisense states PEP coverage of 230+ geopolitical territories in 12 categories, updated once a day by default and more often for highly important PEPs, and describes EU PEPs by the C/2023/724 public-function lists. Per-list timestamps are not exposed by the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/politically-exposed-persons-list",
  version: null,
  last_updated_at: null,
};
