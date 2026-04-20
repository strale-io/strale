export function getAiDescription(slug: string, marker: string): string {
  if (marker === "algorithmic") return "Purely algorithmic — no AI/LLM involved in processing";
  if (marker === "ai_generated") return "LLM (Claude API) used for data extraction and normalization";
  if (marker === "mixed" || marker === "hybrid") return "Mixed — combines LLM extraction with algorithmic validation";
  return "Processing method not classified";
}

export function getDataSourceUrl(slug: string): string | null {
  const urls: Record<string, string> = {
    "us-company-data": "https://www.sec.gov/edgar",
    "swedish-company-data": "https://bolagsverket.se",
    "norwegian-company-data": "https://brreg.no",
    "danish-company-data": "https://datacvr.virk.dk",
    "finnish-company-data": "https://www.prh.fi",
    "uk-company-data": "https://find-and-update.company-information.service.gov.uk",
    "dutch-company-data": "https://www.kvk.nl",
    "german-company-data": "https://www.handelsregister.de",
    "french-company-data": "https://www.insee.fr",
    "estonian-company-data": "https://ariregister.rik.ee",
    "polish-company-data": "https://ekrs.ms.gov.pl",
    "vat-validate": "https://ec.europa.eu/taxation_customs/vies/",
    "sanctions-check": "https://sanctionssearch.ofac.treas.gov/",
    "exchange-rate": "https://www.ecb.europa.eu/stats/eurofxref/",
    "eu-ai-act-classify": "https://eur-lex.europa.eu/eli/reg/2024/1689",
    "data-protection-authority-lookup": "https://edpb.europa.eu/about-edpb/about-edpb/members_en",
    "lei-lookup": "https://www.gleif.org/en/lei-data",
    "eori-validate": "https://ec.europa.eu/taxation_customs/dds2/eos/eori_validation.jsp",
    "ted-procurement": "https://ted.europa.eu",
    "gdpr-fine-lookup": "https://www.enforcementtracker.com",
    "eu-court-case-search": "https://curia.europa.eu",
    "eu-trademark-search": "https://euipo.europa.eu",
    "cve-lookup": "https://osv.dev",
    "charity-lookup-uk": "https://register-of-charities.charitycommission.gov.uk",
    "food-safety-rating-uk": "https://ratings.food.gov.uk",
    "ecb-interest-rates": "https://sdw.ecb.europa.eu",
  };
  return urls[slug] ?? null;
}

// SA.2b.d: heuristic `detectPersonalData` was removed after migration 0050
// flipped `capabilities.processes_personal_data` to NOT NULL. All 307 rows
// have a manifest-declared value; the runtime reads the column directly
// in buildFullAudit / buildFreeTierAudit. F-A-003 + F-A-009 closed.
