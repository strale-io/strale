import { registerCapability, type CapabilityInput } from "./index.js";
import { parsePhoneNumberFromString, type PhoneNumber } from "libphonenumber-js";

registerCapability("phone-normalize", async (input: CapabilityInput) => {
  const phoneString = ((input.phone_string as string) ?? (input.phone as string) ?? (input.task as string) ?? "").trim();
  if (!phoneString) throw new Error("'phone_string' is required.");

  const defaultCountry = ((input.default_country as string) ?? "").toUpperCase().trim() || undefined;

  const phone: PhoneNumber | undefined = parsePhoneNumberFromString(
    phoneString,
    defaultCountry as any,
  );

  if (!phone) {
    return {
      output: {
        input: phoneString,
        valid: false,
        error: "Could not parse phone number. Provide a default_country code (e.g. 'SE') for numbers without international prefix.",
      },
      provenance: { source: "libphonenumber-js", fetched_at: new Date().toISOString() },
    };
  }

  return {
    output: {
      input: phoneString,
      valid: phone.isValid(),
      e164: phone.format("E.164"),
      national_format: phone.formatNational(),
      international_format: phone.formatInternational(),
      country_code: phone.country ?? null,
      calling_code: phone.countryCallingCode ? `+${phone.countryCallingCode}` : null,
      type: phone.getType() ?? null,
      is_possible: phone.isPossible(),
    },
    provenance: { source: "libphonenumber-js", fetched_at: new Date().toISOString() },
  };
});
