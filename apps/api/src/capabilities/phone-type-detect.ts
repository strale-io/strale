import { registerCapability, type CapabilityInput } from "./index.js";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

registerCapability("phone-type-detect", async (input: CapabilityInput) => {
  const phoneNumber = ((input.phone_number as string) ?? (input.phone as string) ?? (input.task as string) ?? "").trim();
  if (!phoneNumber) {
    throw new Error("'phone_number' is required.");
  }

  const countryHint = ((input.country_code as string) ?? "").trim().toUpperCase() || undefined;

  const phone = parsePhoneNumberFromString(phoneNumber, countryHint as CountryCode | undefined);

  if (!phone) {
    return {
      output: {
        input: phoneNumber,
        phone_type: "unknown",
        is_mobile: false,
        is_landline: false,
        is_voip: false,
        sms_capable: false,
        country_code: null,
        error: "Could not parse phone number.",
      },
      provenance: { source: "libphonenumber-js", fetched_at: new Date().toISOString() },
    };
  }

  const phoneType = phone.getType() ?? "unknown";
  const isMobile = phoneType === "MOBILE" || phoneType === "FIXED_LINE_OR_MOBILE";
  const isLandline = phoneType === "FIXED_LINE" || phoneType === "FIXED_LINE_OR_MOBILE";
  const isVoip = phoneType === "VOIP";
  const isTollFree = phoneType === "TOLL_FREE";
  const isPremium = phoneType === "PREMIUM_RATE";

  return {
    output: {
      input: phoneNumber,
      phone_type: phoneType.toLowerCase().replace(/_/g, "_"),
      is_mobile: isMobile,
      is_landline: isLandline,
      is_voip: isVoip,
      sms_capable: isMobile || isVoip,
      is_toll_free: isTollFree,
      is_premium: isPremium,
      country_code: phone.country ?? null,
    },
    provenance: { source: "libphonenumber-js", fetched_at: new Date().toISOString() },
  };
});
