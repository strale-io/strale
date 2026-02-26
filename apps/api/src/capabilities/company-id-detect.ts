import { registerCapability, type CapabilityInput } from "./index.js";

// Company ID detection — identifies the type and country of a company registration number
// Pure algorithmic — no external API calls

interface IdPattern {
  country: string;
  countryCode: string;
  type: string;
  regex: RegExp;
  description: string;
  example: string;
  confidence: "high" | "medium" | "low";
}

const PATTERNS: IdPattern[] = [
  // Nordic
  { country: "Sweden", countryCode: "SE", type: "org_number", regex: /^\d{6}-?\d{4}$/, description: "Swedish organization number", example: "556703-7485", confidence: "high" },
  { country: "Norway", countryCode: "NO", type: "org_number", regex: /^\d{9}$/, description: "Norwegian organization number", example: "923609016", confidence: "medium" },
  { country: "Denmark", countryCode: "DK", type: "cvr_number", regex: /^\d{8}$/, description: "Danish CVR number", example: "24256790", confidence: "medium" },
  { country: "Finland", countryCode: "FI", type: "business_id", regex: /^\d{7}-\d$/, description: "Finnish Business ID (Y-tunnus)", example: "0112038-9", confidence: "high" },

  // Western Europe
  { country: "United Kingdom", countryCode: "GB", type: "company_number", regex: /^(SC|NI|OC|SO|NC|R|IP|SP|RS|NO|NP)?\d{6,8}$/, description: "UK Companies House number", example: "00445790", confidence: "medium" },
  { country: "Netherlands", countryCode: "NL", type: "kvk_number", regex: /^\d{8}$/, description: "Dutch KVK number", example: "33214540", confidence: "medium" },
  { country: "Germany", countryCode: "DE", type: "hrb_number", regex: /^(HRA|HRB|GnR|PR|VR)\s?\d+\s?[A-Z]?$/i, description: "German Handelsregister number", example: "HRB 86891", confidence: "high" },
  { country: "France", countryCode: "FR", type: "siren", regex: /^\d{9}$/, description: "French SIREN number", example: "443061841", confidence: "medium" },
  { country: "France", countryCode: "FR", type: "siret", regex: /^\d{14}$/, description: "French SIRET number", example: "44306184100047", confidence: "high" },
  { country: "Belgium", countryCode: "BE", type: "enterprise_number", regex: /^0?\d{3}\.?\d{3}\.?\d{3}$/, description: "Belgian enterprise number (KBO/BCE)", example: "0404.616.494", confidence: "high" },
  { country: "Switzerland", countryCode: "CH", type: "uid", regex: /^CHE-?\d{3}\.?\d{3}\.?\d{3}$/, description: "Swiss UID number", example: "CHE-100.155.212", confidence: "high" },
  { country: "Austria", countryCode: "AT", type: "fn_number", regex: /^\d{6}[a-z]$/i, description: "Austrian Firmenbuchnummer", example: "150913f", confidence: "high" },

  // Southern Europe
  { country: "Spain", countryCode: "ES", type: "cif", regex: /^[A-Z]\d{7}[A-Z0-9]$/, description: "Spanish CIF/NIF", example: "A28015865", confidence: "high" },
  { country: "Italy", countryCode: "IT", type: "fiscal_code", regex: /^\d{11}$/, description: "Italian Codice Fiscale (company)", example: "00905811006", confidence: "medium" },
  { country: "Portugal", countryCode: "PT", type: "nipc", regex: /^\d{9}$/, description: "Portuguese NIPC", example: "500299698", confidence: "medium" },

  // Eastern Europe
  { country: "Poland", countryCode: "PL", type: "krs", regex: /^\d{10}$/, description: "Polish KRS number", example: "0000019193", confidence: "medium" },
  { country: "Poland", countryCode: "PL", type: "nip", regex: /^\d{10}$/, description: "Polish NIP (tax ID)", example: "5260250995", confidence: "low" },
  { country: "Estonia", countryCode: "EE", type: "registry_code", regex: /^\d{8}$/, description: "Estonian registry code", example: "10421629", confidence: "medium" },
  { country: "Latvia", countryCode: "LV", type: "reg_number", regex: /^\d{11}$/, description: "Latvian registration number", example: "40003000642", confidence: "medium" },
  { country: "Lithuania", countryCode: "LT", type: "company_code", regex: /^\d{7,9}$/, description: "Lithuanian company code", example: "110755243", confidence: "medium" },
  { country: "Ireland", countryCode: "IE", type: "cro_number", regex: /^\d{5,6}$/, description: "Irish CRO number", example: "616862", confidence: "low" },

  // International
  { country: "International", countryCode: "XX", type: "lei", regex: /^[A-Z0-9]{20}$/, description: "Legal Entity Identifier (LEI)", example: "549300QNWPHIJL0CKP29", confidence: "high" },
  { country: "International", countryCode: "XX", type: "duns", regex: /^\d{2}-\d{3}-\d{4}$/, description: "D-U-N-S Number", example: "36-263-8769", confidence: "high" },
];

function detectId(input: string): Array<{ pattern: IdPattern; matched: string }> {
  const cleaned = input.trim();
  const matches: Array<{ pattern: IdPattern; matched: string }> = [];

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(cleaned)) {
      matches.push({ pattern, matched: cleaned });
    }
  }

  // Sort by confidence
  const order = { high: 0, medium: 1, low: 2 };
  matches.sort((a, b) => order[a.pattern.confidence] - order[b.pattern.confidence]);

  return matches;
}

registerCapability("company-id-detect", async (input: CapabilityInput) => {
  const raw = (input.id as string) ?? (input.company_id as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'id' is required. Provide a company registration number to identify.");
  }

  const trimmed = raw.trim();
  const matches = detectId(trimmed);

  if (matches.length === 0) {
    return {
      output: {
        input: trimmed,
        detected: false,
        matches: [],
        message: "Could not identify the format of this company ID.",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  return {
    output: {
      input: trimmed,
      detected: true,
      best_match: {
        country: matches[0].pattern.country,
        country_code: matches[0].pattern.countryCode,
        id_type: matches[0].pattern.type,
        description: matches[0].pattern.description,
        confidence: matches[0].pattern.confidence,
        example: matches[0].pattern.example,
      },
      all_matches: matches.map((m) => ({
        country: m.pattern.country,
        country_code: m.pattern.countryCode,
        id_type: m.pattern.type,
        description: m.pattern.description,
        confidence: m.pattern.confidence,
      })),
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
