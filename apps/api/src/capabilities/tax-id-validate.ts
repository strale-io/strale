import { registerCapability, type CapabilityInput } from "./index.js";

import { TAX_FORMATS } from "../lib/tax-id-formats.js";

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
