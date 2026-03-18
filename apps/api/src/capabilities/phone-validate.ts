import { registerCapability, type CapabilityInput } from "./index.js";
import {
  parsePhoneNumberFromString,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

// Country name lookup
const COUNTRY_NAMES: Record<string, string> = {
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", DE: "Germany",
  FR: "France", GB: "United Kingdom", US: "United States", NL: "Netherlands",
  BE: "Belgium", AT: "Austria", CH: "Switzerland", IE: "Ireland", ES: "Spain",
  IT: "Italy", PT: "Portugal", PL: "Poland", CZ: "Czech Republic",
  JP: "Japan", CN: "China", IN: "India", AU: "Australia", CA: "Canada",
  BR: "Brazil", MX: "Mexico", KR: "South Korea", SG: "Singapore",
};

registerCapability("phone-validate", async (input: CapabilityInput) => {
  const phoneNumber = ((input.phone_number as string) ?? (input.phone as string) ?? (input.task as string) ?? "").trim();
  if (!phoneNumber) {
    throw new Error("'phone_number' is required.");
  }

  const countryHint = ((input.country_code as string) ?? "").trim().toUpperCase() || undefined;

  const phone = parsePhoneNumberFromString(phoneNumber, countryHint as CountryCode | undefined);

  if (!phone) {
    return {
      output: {
        valid: false,
        input: phoneNumber,
        e164: null,
        national_format: null,
        international_format: null,
        country_code: null,
        country_name: null,
        phone_type: "unknown",
        carrier: null,
        is_possible: false,
        error: "Could not parse phone number. Provide a country_code hint for numbers without international prefix.",
      },
      provenance: { source: "libphonenumber-js", fetched_at: new Date().toISOString() },
    };
  }

  const phoneType = phone.getType() ?? "unknown";
  const country = phone.country ?? null;

  return {
    output: {
      valid: phone.isValid(),
      input: phoneNumber,
      e164: phone.format("E.164"),
      national_format: phone.formatNational(),
      international_format: phone.formatInternational(),
      country_code: country,
      country_name: country ? COUNTRY_NAMES[country] ?? country : null,
      phone_type: phoneType,
      carrier: null, // carrier data requires paid service
      is_possible: phone.isPossible(),
    },
    provenance: { source: "libphonenumber-js", fetched_at: new Date().toISOString() },
  };
});
