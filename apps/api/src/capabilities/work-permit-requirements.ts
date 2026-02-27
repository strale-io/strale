import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Work permit requirements — pure algorithmic rule engine ──────────────────

// EU/EEA member states
const EU_EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA (non-EU)
  "IS", "LI", "NO",
]);

// Nordic Passport Union countries
const NORDIC = new Set(["SE", "NO", "DK", "FI", "IS"]);

// Schengen visa-waiver countries (90 days visa-free for short stays)
const SCHENGEN_WAIVER = new Set([
  "US", "CA", "AU", "NZ", "JP", "KR", "SG", "IL", "BR", "MX",
  "AR", "CL", "CR", "UY", "CO", "PE", "PA", "HK", "TW", "MY",
  "AE", "BN", "GB", "UA",
]);

// Country names
const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
  CZ: "Czech Republic", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
  DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy",
  LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands",
  PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia", SI: "Slovenia",
  ES: "Spain", SE: "Sweden", IS: "Iceland", LI: "Liechtenstein", NO: "Norway",
  CH: "Switzerland", GB: "United Kingdom", UK: "United Kingdom",
  US: "United States", CA: "Canada", AU: "Australia", NZ: "New Zealand",
  JP: "Japan", KR: "South Korea", SG: "Singapore", IL: "Israel", BR: "Brazil",
  MX: "Mexico", AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
  IN: "India", CN: "China", RU: "Russia", TR: "Turkey", ZA: "South Africa",
  NG: "Nigeria", EG: "Egypt", PH: "Philippines", TH: "Thailand", VN: "Vietnam",
  ID: "Indonesia", MY: "Malaysia", AE: "United Arab Emirates", SA: "Saudi Arabia",
  PK: "Pakistan", BD: "Bangladesh", UA: "Ukraine", HK: "Hong Kong", TW: "Taiwan",
};

// Destination-specific guidance URLs
const GUIDANCE_URLS: Record<string, string> = {
  SE: "https://www.migrationsverket.se/English/Private-individuals/Working-in-Sweden.html",
  NO: "https://www.udi.no/en/want-to-apply/work-immigration/",
  DK: "https://nyidanmark.dk/en-GB/You-want-to-apply/Work",
  FI: "https://migri.fi/en/working-in-finland",
  DE: "https://www.make-it-in-germany.com/en/visa-residence/types/work",
  UK: "https://www.gov.uk/browse/visas-immigration/work-visas",
  NL: "https://ind.nl/en/work",
  FR: "https://www.service-public.fr/particuliers/vosdroits/N107",
  ES: "https://www.inclusion.gob.es/web/guest/w/permisos-de-trabajo",
  IT: "https://www.esteri.it/en/servizi-consolari-e-visti/",
  US: "https://www.uscis.gov/working-in-the-united-states",
  CA: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html",
  AU: "https://immi.homeaffairs.gov.au/visas/working-in-australia",
  IE: "https://www.irishimmigration.ie/coming-to-work-in-ireland/",
  CH: "https://www.sem.admin.ch/sem/en/home/themen/arbeit.html",
};

interface PermitResult {
  nationality: string;
  nationality_name: string;
  destination: string;
  destination_name: string;
  purpose: string;
  visa_required: boolean;
  permit_type: string;
  free_movement: boolean;
  eu_citizen: boolean;
  max_stay_days: number | null;
  eu_blue_card_eligible: boolean;
  requirements_summary: string;
  notes: string[];
  source_url: string | null;
}

function normalizeCountryCode(code: string): string {
  const upper = code.trim().toUpperCase();
  // Handle UK alias
  if (upper === "UK") return "GB";
  return upper;
}

registerCapability("work-permit-requirements", async (input: CapabilityInput) => {
  const natRaw = (input.nationality as string) ?? "";
  const destRaw = (input.destination as string) ?? "";
  const purpose = ((input.purpose as string) ?? "work").toLowerCase();

  if (!natRaw.trim()) {
    throw new Error(
      "'nationality' is required. Provide a 2-letter country code (e.g. 'SE', 'US').",
    );
  }
  if (!destRaw.trim()) {
    throw new Error(
      "'destination' is required. Provide a 2-letter country code (e.g. 'DE', 'UK').",
    );
  }

  if (!["work", "study", "visit"].includes(purpose)) {
    throw new Error("'purpose' must be 'work', 'study', or 'visit'.");
  }

  const nationality = normalizeCountryCode(natRaw);
  const destination = normalizeCountryCode(destRaw);

  const natName = COUNTRY_NAMES[nationality] ?? nationality;
  const destName = COUNTRY_NAMES[destination] ?? destination;

  const isNatEU = EU_EEA.has(nationality);
  const isDestEU = EU_EEA.has(destination);
  const isNatNordic = NORDIC.has(nationality);
  const isDestNordic = NORDIC.has(destination);
  const isNatSwiss = nationality === "CH";
  const isDestSwiss = destination === "CH";
  const isNatUK = nationality === "GB";
  const isDestUK = destination === "GB";
  const isSchengenWaiver = SCHENGEN_WAIVER.has(nationality);

  const notes: string[] = [];
  let visaRequired = true;
  let permitType = "work_visa_and_permit";
  let freeMovement = false;
  let maxStayDays: number | null = null;
  let euBlueCardEligible = false;
  let summary: string;

  // Same country
  if (nationality === destination) {
    visaRequired = false;
    permitType = "none";
    freeMovement = true;
    summary = `${natName} citizens have the right to work in their own country.`;
  }
  // EU/EEA citizen → EU/EEA destination (free movement)
  else if (isNatEU && isDestEU) {
    visaRequired = false;
    permitType = "none";
    freeMovement = true;
    summary = `EU/EEA citizens have free movement rights. ${natName} citizens can live and work in ${destName} without a visa or work permit under EU free movement rules.`;
    notes.push("Registration with local authorities may be required for stays over 3 months.");
    if (isNatNordic && isDestNordic) {
      notes.push("Nordic Passport Union: no passport required, national ID sufficient.");
    }
  }
  // EU/EEA citizen → Switzerland
  else if (isNatEU && isDestSwiss) {
    visaRequired = false;
    permitType = "registration_only";
    freeMovement = true;
    summary = `EU/EEA citizens can work in Switzerland under the bilateral agreement on free movement. A residence permit (L or B) must be obtained but is granted automatically.`;
    notes.push("Swiss L-permit for stays <1 year, B-permit for longer stays.");
  }
  // Swiss citizen → EU/EEA
  else if (isNatSwiss && isDestEU) {
    visaRequired = false;
    permitType = "registration_only";
    freeMovement = true;
    summary = `Swiss citizens have free movement rights in the EU/EEA under the bilateral agreement. Registration with local authorities required.`;
  }
  // EU citizen → UK (post-Brexit)
  else if (isNatEU && isDestUK) {
    if (purpose === "visit") {
      visaRequired = false;
      permitType = "none";
      maxStayDays = 180;
      summary = `EU citizens can visit the UK for up to 6 months without a visa but cannot work.`;
    } else {
      visaRequired = true;
      permitType = "skilled_worker_visa";
      summary = `Since Brexit, EU citizens need a Skilled Worker visa to work in the UK. A job offer from a licensed sponsor is required.`;
      notes.push("Skilled Worker visa requires a minimum salary threshold (typically GBP 26,200 or the going rate).");
      notes.push("Points-based immigration system applies.");
    }
  }
  // UK citizen → EU/EEA
  else if (isNatUK && isDestEU) {
    if (purpose === "visit") {
      visaRequired = false;
      permitType = "none";
      maxStayDays = 90;
      summary = `UK citizens can visit Schengen/EU countries for up to 90 days in any 180-day period without a visa, but cannot work.`;
    } else {
      visaRequired = true;
      permitType = "national_work_visa";
      euBlueCardEligible = true;
      summary = `Since Brexit, UK citizens need a work visa and/or permit to work in ${destName}. Requirements vary by destination country.`;
      notes.push("EU Blue Card may be available for highly qualified employment.");
    }
  }
  // Non-EU → EU/EEA
  else if (!isNatEU && isDestEU) {
    euBlueCardEligible = true;

    if (purpose === "visit" && isSchengenWaiver) {
      visaRequired = false;
      permitType = "none";
      maxStayDays = 90;
      summary = `${natName} citizens can visit Schengen/EU countries for up to 90 days visa-free, but cannot work without a permit.`;
    } else if (purpose === "visit") {
      visaRequired = true;
      permitType = "schengen_visa";
      maxStayDays = 90;
      summary = `${natName} citizens need a Schengen visa to visit ${destName}. Maximum stay: 90 days in any 180-day period.`;
    } else {
      visaRequired = true;
      permitType = "work_visa_and_permit";
      summary = `${natName} citizens need a work visa and residence permit to work in ${destName}. A job offer is typically required before applying.`;

      // Destination-specific notes
      if (destination === "SE") {
        notes.push("Sweden: Work permit requires a job offer with salary meeting collective agreement standards.");
        notes.push("Processing time: typically 1-6 months.");
      } else if (destination === "DE") {
        notes.push("Germany: EU Blue Card available for qualified professionals (min. salary EUR 45,300 / EUR 41,041.80 for shortage occupations in 2024).");
        notes.push("Opportunity Card (Chancenkarte) available for job seekers.");
      } else if (destination === "NL") {
        notes.push("Netherlands: Highly Skilled Migrant visa (Kennismigrant) available through recognized sponsors.");
        notes.push("30% ruling may provide tax advantage.");
      } else if (destination === "FR") {
        notes.push("France: Talent Passport visa available for skilled workers, researchers, and entrepreneurs.");
      } else if (destination === "DK") {
        notes.push("Denmark: Pay Limit Scheme for high-salary positions, Positive List for in-demand occupations.");
      } else if (destination === "FI") {
        notes.push("Finland: Specialist residence permit or EU Blue Card for skilled workers.");
      } else if (destination === "NO") {
        notes.push("Norway: Skilled worker permit requires relevant qualifications and a concrete job offer.");
      } else if (destination === "ES") {
        notes.push("Spain: Highly Qualified Professional visa and Digital Nomad visa available.");
      } else if (destination === "IT") {
        notes.push("Italy: Work visa subject to annual quota (decreto flussi). EU Blue Card also available.");
      } else if (destination === "IE") {
        notes.push("Ireland: Critical Skills Employment Permit for in-demand occupations, General Employment Permit for others.");
      }

      notes.push("EU Blue Card is an option for highly qualified workers with a qualifying job offer.");
    }
  }
  // Non-EU → Switzerland
  else if (!isNatEU && isDestSwiss) {
    if (purpose === "visit" && isSchengenWaiver) {
      visaRequired = false;
      permitType = "none";
      maxStayDays = 90;
      summary = `${natName} citizens can visit Switzerland for up to 90 days visa-free but cannot work.`;
    } else {
      visaRequired = true;
      permitType = "work_visa_and_permit";
      summary = `${natName} citizens need a work permit to work in Switzerland. Priority is given to Swiss/EU candidates (dual permit system).`;
      notes.push("Switzerland operates a dual permit system: EU/EFTA citizens have priority; third-country nationals face annual quotas.");
    }
  }
  // Non-EU → UK
  else if (!isNatEU && isDestUK) {
    if (purpose === "visit" && isSchengenWaiver) {
      visaRequired = false;
      permitType = "none";
      maxStayDays = 180;
      summary = `${natName} citizens can visit the UK for up to 6 months without a visa but cannot work.`;
    } else if (purpose === "visit") {
      visaRequired = true;
      permitType = "visitor_visa";
      maxStayDays = 180;
      summary = `${natName} citizens need a Standard Visitor visa for the UK.`;
    } else {
      visaRequired = true;
      permitType = "skilled_worker_visa";
      summary = `${natName} citizens need a Skilled Worker visa to work in the UK. Requires a job offer from a licensed sponsor.`;
      notes.push("Points-based system. Minimum salary threshold applies.");
      notes.push("Global Talent visa available for leaders/potential leaders in specific fields.");
    }
  }
  // Non-EU → US
  else if (destination === "US") {
    if (purpose === "visit" && isSchengenWaiver) {
      visaRequired = false;
      permitType = "esta_waiver";
      maxStayDays = 90;
      summary = `${natName} citizens may visit the US for up to 90 days under the Visa Waiver Program (ESTA).`;
      notes.push("ESTA authorization required before travel.");
    } else if (purpose === "visit") {
      visaRequired = true;
      permitType = "b1_b2_visa";
      maxStayDays = 180;
      summary = `${natName} citizens need a B-1/B-2 visitor visa for the US.`;
    } else {
      visaRequired = true;
      permitType = "work_visa";
      summary = `${natName} citizens need a work visa (H-1B, L-1, O-1, etc.) to work in the US. Employer sponsorship is required.`;
      notes.push("H-1B: specialty occupation, annual cap with lottery.");
      notes.push("L-1: intra-company transfer.");
      notes.push("O-1: extraordinary ability.");
      notes.push("E-2: treaty investor (if treaty exists with nationality country).");
    }
  }
  // Non-EU → Canada
  else if (destination === "CA") {
    if (purpose === "visit") {
      visaRequired = !["US", "GB", "AU", "NZ", "FR", "DE"].includes(nationality);
      permitType = visaRequired ? "visitor_visa" : "eta_waiver";
      maxStayDays = 180;
      summary = visaRequired
        ? `${natName} citizens need a visitor visa for Canada.`
        : `${natName} citizens can visit Canada with an eTA (Electronic Travel Authorization) for up to 6 months.`;
    } else {
      visaRequired = true;
      permitType = "work_permit";
      summary = `${natName} citizens need a work permit to work in Canada. LMIA-based or LMIA-exempt streams available.`;
      notes.push("Express Entry system for permanent immigration (Federal Skilled Worker, CEC, FST).");
      notes.push("Provincial Nominee Programs (PNP) offer additional pathways.");
      notes.push("Global Talent Stream for tech workers.");
    }
  }
  // Non-EU → Australia
  else if (destination === "AU") {
    if (purpose === "visit") {
      visaRequired = !["US", "CA", "GB", "NZ", "JP", "KR", "SG"].includes(nationality);
      permitType = visaRequired ? "visitor_visa" : "eta_waiver";
      maxStayDays = 90;
      summary = visaRequired
        ? `${natName} citizens need a visitor visa for Australia.`
        : `${natName} citizens can visit Australia with an ETA for up to 90 days.`;
    } else {
      visaRequired = true;
      permitType = "work_visa";
      summary = `${natName} citizens need a work visa to work in Australia. Employer-sponsored and points-based options available.`;
      notes.push("Subclass 482 (Temporary Skill Shortage) for employer-sponsored workers.");
      notes.push("Subclass 189/190 (Skilled Independent/Nominated) for points-based immigration.");
      notes.push("Working Holiday visa (subclass 417/462) for eligible nationalities aged 18-35.");
    }
  }
  // Default fallback
  else {
    if (purpose === "visit" && isSchengenWaiver) {
      visaRequired = false;
      permitType = "varies";
      maxStayDays = 90;
      summary = `${natName} citizens may have visa-free access for short visits to ${destName}. Work authorization is separate and typically requires a visa and permit.`;
    } else {
      visaRequired = true;
      permitType = "work_visa_and_permit";
      summary = `${natName} citizens likely need a work visa and permit to work in ${destName}. Check with the ${destName} embassy or immigration authority for specific requirements.`;
    }
  }

  const sourceUrl =
    GUIDANCE_URLS[destination === "GB" ? "UK" : destination] ?? null;

  const result: Record<string, unknown> = {
    nationality,
    nationality_name: natName,
    destination,
    destination_name: destName,
    purpose,
    visa_required: visaRequired,
    permit_type: permitType,
    free_movement: freeMovement,
    eu_citizen: isNatEU,
    max_stay_days: maxStayDays,
    eu_blue_card_eligible: euBlueCardEligible,
    requirements_summary: summary,
    notes,
    source_url: sourceUrl,
  };

  return {
    output: result,
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
