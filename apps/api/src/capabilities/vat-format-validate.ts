import { registerCapability, type CapabilityInput } from "./index.js";

// EU VAT number format validation — pure algorithmic, no external API
// Validates format against country-specific rules (does NOT check against VIES)
// Use vat-validate for full VIES verification

interface VatFormat {
  regex: RegExp;
  country: string;
  example: string;
}

const VAT_FORMATS: Record<string, VatFormat> = {
  AT: { regex: /^ATU\d{8}$/, country: "Austria", example: "ATU12345678" },
  BE: { regex: /^BE[01]\d{9}$/, country: "Belgium", example: "BE0123456789" },
  BG: { regex: /^BG\d{9,10}$/, country: "Bulgaria", example: "BG123456789" },
  CY: { regex: /^CY\d{8}[A-Z]$/, country: "Cyprus", example: "CY12345678A" },
  CZ: { regex: /^CZ\d{8,10}$/, country: "Czech Republic", example: "CZ12345678" },
  DE: { regex: /^DE\d{9}$/, country: "Germany", example: "DE123456789" },
  DK: { regex: /^DK\d{8}$/, country: "Denmark", example: "DK12345678" },
  EE: { regex: /^EE\d{9}$/, country: "Estonia", example: "EE123456789" },
  EL: { regex: /^EL\d{9}$/, country: "Greece", example: "EL123456789" },
  ES: { regex: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, country: "Spain", example: "ESA12345678" },
  FI: { regex: /^FI\d{8}$/, country: "Finland", example: "FI12345678" },
  FR: { regex: /^FR[A-Z0-9]{2}\d{9}$/, country: "France", example: "FRXX123456789" },
  HR: { regex: /^HR\d{11}$/, country: "Croatia", example: "HR12345678901" },
  HU: { regex: /^HU\d{8}$/, country: "Hungary", example: "HU12345678" },
  IE: { regex: /^IE(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/, country: "Ireland", example: "IE1234567A" },
  IT: { regex: /^IT\d{11}$/, country: "Italy", example: "IT12345678901" },
  LT: { regex: /^LT(\d{9}|\d{12})$/, country: "Lithuania", example: "LT123456789" },
  LU: { regex: /^LU\d{8}$/, country: "Luxembourg", example: "LU12345678" },
  LV: { regex: /^LV\d{11}$/, country: "Latvia", example: "LV12345678901" },
  MT: { regex: /^MT\d{8}$/, country: "Malta", example: "MT12345678" },
  NL: { regex: /^NL\d{9}B\d{2}$/, country: "Netherlands", example: "NL123456789B01" },
  PL: { regex: /^PL\d{10}$/, country: "Poland", example: "PL1234567890" },
  PT: { regex: /^PT\d{9}$/, country: "Portugal", example: "PT123456789" },
  RO: { regex: /^RO\d{2,10}$/, country: "Romania", example: "RO1234567890" },
  SE: { regex: /^SE\d{12}$/, country: "Sweden", example: "SE123456789012" },
  SI: { regex: /^SI\d{8}$/, country: "Slovenia", example: "SI12345678" },
  SK: { regex: /^SK\d{10}$/, country: "Slovakia", example: "SK1234567890" },
  // Non-EU but commonly validated
  GB: { regex: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, country: "United Kingdom", example: "GB123456789" },
  CH: { regex: /^CHE\d{9}(MWST|TVA|IVA)$/, country: "Switzerland", example: "CHE123456789MWST" },
  NO: { regex: /^NO\d{9}MVA$/, country: "Norway", example: "NO123456789MVA" },
};

registerCapability("vat-format-validate", async (input: CapabilityInput) => {
  const raw = (input.vat_number as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'vat_number' is required. Provide a VAT number including country prefix (e.g. SE556703748501).");
  }

  const cleaned = raw.trim().toUpperCase().replace(/[\s.-]/g, "");

  // Extract country code (first 2-3 letters)
  const countryMatch = cleaned.match(/^([A-Z]{2,3})/);
  if (!countryMatch) {
    return {
      output: {
        valid: false,
        vat_number: cleaned,
        error: "VAT number must start with a country code (e.g. SE, DE, FR).",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  // Handle CHE (Switzerland) and NO...MVA specially
  let countryKey = countryMatch[1].slice(0, 2);
  if (cleaned.startsWith("CHE")) countryKey = "CH";

  const format = VAT_FORMATS[countryKey];
  if (!format) {
    return {
      output: {
        valid: false,
        vat_number: cleaned,
        country_code: countryKey,
        error: `Unsupported country code: ${countryKey}. Supported: ${Object.keys(VAT_FORMATS).join(", ")}.`,
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  const formatValid = format.regex.test(cleaned);

  return {
    output: {
      valid: formatValid,
      vat_number: cleaned,
      country_code: countryKey,
      country_name: format.country,
      format_valid: formatValid,
      expected_format: format.example,
      note: formatValid
        ? "Format is valid. Use vat-validate for full VIES verification."
        : `Invalid format for ${format.country}. Expected pattern like: ${format.example}`,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
