/**
 * Dilisense source attribution for the audit-grade `lists_queried` evidence
 * shape. Sourced from https://dilisense.com/en/sources/sanction-sources and
 * /en/sources/additional-sources (2026-04-27 snapshot).
 *
 * Used by sanctions-check and pep-check to populate a meaningful list of
 * underlying sources screened, even though the Dilisense screening API
 * doesn't expose per-list versioning per call.
 */

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
  "World Bank — Debarred Firms and Individuals",
  "African Development Bank — Debarred Entities",
  "Asian Development Bank — Sanction List",
  "Inter-American Development Bank — Sanctioned Firms and Individuals",
  "EBRD — Sanctions",
  // United States
  "OFAC — Specially Designated Nationals (SDN)",
  "OFAC — Non-SDN Sanction List",
  "BIS — Entity List",
  "BIS — Denied Persons List",
  "BIS — Military End User (MEU) List",
  "DOS — Foreign Terrorist Organizations",
  "DOS — Nonproliferation Sanctions",
  "DDTC — AECA Debarred List",
  "DOD — Section 1260H Chinese Military Companies",
  "DHS — UFLPA Entity List",
  // United Kingdom
  "HMT OFSI — Financial Sanctions",
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

/** ~135 named sanctions sources covered by Dilisense's consolidated endpoint */
const DILISENSE_SANCTIONS_SOURCE_COUNT = 134;

export const DILISENSE_SANCTIONS_LISTS_QUERIED: DilisenseListsQueried = {
  collection: "dilisense/consolidated-sanctions",
  source_count: DILISENSE_SANCTIONS_SOURCE_COUNT,
  major_lists: [...SANCTIONS_MAJOR_LISTS],
  freshness_note:
    "Dilisense aggregates 130+ sanctions, debarment, and restrictive-measure lists into a consolidated index. The publisher refreshes the consolidated index multiple times daily; per-list timestamps are not exposed via the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/sanction-sources",
  version: null,
  last_updated_at: null,
};

const PEP_MAJOR_SOURCES = [
  // International
  "EU C/2023/724 — Member-State PEP function definitions",
  "Wikidata — Politically-exposed persons",
  // National (a sample — Dilisense pulls government and parliament sources per jurisdiction)
  "DE Bundestag, Bundesrat, Bundespräsident, Bundesbank, state-owned enterprises (Bahn, Bundesdruckerei, BwConsulting)",
  "FR Assemblée Nationale, Sénat, Conseil constitutionnel, Banque de France",
  "UK Parliament, Cabinet Office, Bank of England, judiciary",
  "Sweden Riksdag, Regering, Sveriges Riksbank",
  "Norway Storting, Regjeringen, Norges Bank",
  "Switzerland Bundesversammlung, Bundesrat, Schweizerische Nationalbank",
  "Other EU27 + EEA + Switzerland — national parliaments, governments, central banks, supreme courts, and state-owned-enterprise boards",
  "International organizations — EU institutions, ECB, BIS, IMF, World Bank officials",
  "Relatives and Close Associates (RCAs) — derived from public records",
] as const;

export const DILISENSE_PEP_LISTS_QUERIED: DilisenseListsQueried = {
  collection: "dilisense/consolidated-pep",
  source_count: 230,
  major_lists: [...PEP_MAJOR_SOURCES],
  freshness_note:
    "Dilisense PEP coverage spans 230+ geopolitical territories and aligns with EU C/2023/724 PEP function definitions. The publisher refreshes the index multiple times daily; per-list timestamps are not exposed via the screening API.",
  source_catalog_url: "https://dilisense.com/en/sources/politically-exposed-persons-list",
  version: null,
  last_updated_at: null,
};
