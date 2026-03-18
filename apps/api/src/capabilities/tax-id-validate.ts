import { registerCapability, type CapabilityInput } from "./index.js";

interface TaxIdFormat {
  name: string;
  pattern: RegExp;
  checksum?: (id: string) => boolean;
}

const TAX_FORMATS: Record<string, TaxIdFormat> = {
  SE: { name: "Momsregistreringsnummer", pattern: /^SE\d{12}$/ },
  FI: { name: "ALV-numero", pattern: /^FI\d{8}$/ },
  NO: { name: "MVA-nummer", pattern: /^NO\d{9}MVA$|^\d{9}$/ },
  DK: { name: "CVR/SE-nummer", pattern: /^DK\d{8}$|^\d{8}$/ },
  DE: { name: "USt-IdNr", pattern: /^DE\d{9}$/ },
  FR: { name: "Numéro TVA", pattern: /^FR[A-Z0-9]{2}\d{9}$/ },
  GB: { name: "VAT Number", pattern: /^GB\d{9}$|^GB\d{12}$|^GBGD\d{3}$|^GBHA\d{3}$/ },
  NL: { name: "BTW-nummer", pattern: /^NL\d{9}B\d{2}$/ },
  BE: { name: "BTW-nummer", pattern: /^BE[01]\d{9}$/ },
  AT: { name: "UID-Nummer", pattern: /^ATU\d{8}$/ },
  IT: { name: "Partita IVA", pattern: /^IT\d{11}$/ },
  ES: { name: "NIF/CIF", pattern: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/ },
  PT: { name: "NIF", pattern: /^PT\d{9}$/ },
  PL: { name: "NIP", pattern: /^PL\d{10}$/ },
  CZ: { name: "DIČ", pattern: /^CZ\d{8,10}$/ },
  IE: { name: "VAT Number", pattern: /^IE\d{7}[A-Z]{1,2}$|^IE\d[A-Z+*]\d{5}[A-Z]$/ },
  HU: { name: "ANUM", pattern: /^HU\d{8}$/ },
  RO: { name: "CIF", pattern: /^RO\d{2,10}$/ },
  BG: { name: "ИН по ЗДДС", pattern: /^BG\d{9,10}$/ },
  HR: { name: "OIB", pattern: /^HR\d{11}$/ },
  EE: { name: "KMKR number", pattern: /^EE\d{9}$/ },
  LV: { name: "PVN reģistrācijas numurs", pattern: /^LV\d{11}$/ },
  LT: { name: "PVM mokėtojo kodas", pattern: /^LT\d{9}$|^LT\d{12}$/ },
  SI: { name: "Davčna številka", pattern: /^SI\d{8}$/ },
  SK: { name: "IČ DPH", pattern: /^SK\d{10}$/ },
  MT: { name: "VAT Number", pattern: /^MT\d{8}$/ },
  CY: { name: "ΦΠΑ", pattern: /^CY\d{8}[A-Z]$/ },
  LU: { name: "TVA", pattern: /^LU\d{8}$/ },
  GR: { name: "ΑΦΜ", pattern: /^EL\d{9}$/ },
  CH: { name: "MWST/TVA/IVA", pattern: /^CHE\d{9}(MWST|TVA|IVA)$|^CHE-\d{3}\.\d{3}\.\d{3}\s?(MWST|TVA|IVA)$/ },
  US: { name: "EIN", pattern: /^\d{2}-?\d{7}$/ },
  CA: { name: "BN/GST", pattern: /^\d{9}RT\d{4}$|^\d{9}$/ },
  AU: { name: "ABN", pattern: /^\d{11}$/ },
  IN: { name: "GSTIN", pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/ },
  BR: { name: "CNPJ", pattern: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/ },
  MX: { name: "RFC", pattern: /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/ },
  JP: { name: "Corporate Number", pattern: /^\d{13}$/ },
  KR: { name: "사업자등록번호", pattern: /^\d{3}-?\d{2}-?\d{5}$/ },
  SG: { name: "GST Registration", pattern: /^[A-Z]\d{8}[A-Z]$|^\d{9}[A-Z]$/ },
};

registerCapability("tax-id-validate", async (input: CapabilityInput) => {
  const taxId = ((input.tax_id as string) ?? (input.task as string) ?? "").trim();
  if (!taxId) throw new Error("'tax_id' is required.");

  let countryCode = ((input.country_code as string) ?? "").trim().toUpperCase();

  // Try to auto-detect country from prefix
  if (!countryCode) {
    const prefix = taxId.slice(0, 2).toUpperCase();
    if (TAX_FORMATS[prefix]) countryCode = prefix;
    else if (prefix === "EL") countryCode = "GR";
    else if (taxId.startsWith("CHE")) countryCode = "CH";
  }

  if (!countryCode) {
    throw new Error("'country_code' is required (or include the country prefix in the tax_id, e.g. 'SE556703748501').");
  }

  const format = TAX_FORMATS[countryCode];
  if (!format) {
    return {
      output: {
        valid: false,
        tax_id: taxId,
        country_code: countryCode,
        format_name: "unknown",
        normalized: taxId,
        error: `Country '${countryCode}' not supported. Supported: ${Object.keys(TAX_FORMATS).join(", ")}`,
      },
      provenance: { source: "strale-tax-validator", fetched_at: new Date().toISOString() },
    };
  }

  // Normalize: remove spaces, ensure prefix
  let normalized = taxId.replace(/\s/g, "").toUpperCase();

  const valid = format.pattern.test(normalized);
  const checksumValid = format.checksum ? format.checksum(normalized) : null;

  const suggestions: string[] = [];
  if (!valid && !normalized.startsWith(countryCode) && countryCode !== "US" && countryCode !== "AU" && countryCode !== "JP") {
    const withPrefix = countryCode + normalized;
    if (format.pattern.test(withPrefix)) {
      suggestions.push(`Try with country prefix: ${withPrefix}`);
      normalized = withPrefix;
    }
  }

  return {
    output: {
      valid: valid || (suggestions.length > 0),
      tax_id: taxId,
      country_code: countryCode,
      format_name: format.name,
      checksum_valid: checksumValid,
      normalized,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    },
    provenance: { source: "strale-tax-validator", fetched_at: new Date().toISOString() },
  };
});
