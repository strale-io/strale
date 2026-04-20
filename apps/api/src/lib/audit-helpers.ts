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

/**
 * Heuristic PII detector — deprecated fallback.
 *
 * Prefer `capability.processesPersonalData` from the DB (declared in manifest
 * per SA.2b F-A-003 / F-A-009). This function is only invoked when the
 * manifest-declared value is NULL (grandfathered pre-backfill capability).
 *
 * F-A-003 fix: now scans both input AND output field names. An input-PII
 * capability (pep-check, email-validate) whose output is a verdict boolean
 * was previously misclassified as "no PII processed."
 *
 * F-A-009 gap acknowledged: field-name keyword matching still produces
 * false positives (e.g. `entity_name`, `brand_name`) and false negatives
 * (e.g. `beneficial_owner`, `signatory`). The manifest declaration is the
 * authoritative path. Heuristic stays as a floor until SA.2b.c flips
 * `processes_personal_data` to NOT NULL and this function is deleted.
 */
export function detectPersonalData(input: unknown, output: unknown): boolean {
  const piiFields = ["name", "email", "phone", "address", "ssn", "date_of_birth", "person"];
  const scanBag = (bag: unknown): boolean => {
    if (!bag || typeof bag !== "object") return false;
    const keys = Object.keys(bag as Record<string, unknown>).map((k) => k.toLowerCase());
    return keys.some((k) => piiFields.some((p) => k.includes(p)));
  };
  return scanBag(input) || scanBag(output);
}
