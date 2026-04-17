import { registerCapability, type CapabilityInput } from "./index.js";
import { parseBirthNumber } from "../lib/cz-validation.js";

registerCapability("cz-birth-number-validate", async (input: CapabilityInput) => {
  const raw = (input.birth_number as string) ?? (input.rodne_cislo as string) ?? "";
  if (!raw || !raw.trim()) {
    throw new Error("'birth_number' is required. Provide a Czech rodné číslo (9 or 10 digits, optional slash).");
  }

  const parsed = parseBirthNumber(raw);
  if (!parsed) {
    return {
      output: {
        input: raw,
        is_valid: false,
        reason: "Format invalid — expected 9 or 10 digits (optionally with slash/hyphen), e.g. '800101/1234'.",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  const isValid = parsed.is_valid_date && parsed.checksum_ok;
  return {
    output: {
      input: raw,
      normalized: parsed.normalized,
      is_valid: isValid,
      birth_year: parsed.year,
      birth_month: parsed.month,
      birth_day: parsed.day,
      gender: parsed.gender,
      date_valid: parsed.is_valid_date,
      has_check_digit: parsed.has_check_digit,
      checksum_ok: parsed.checksum_ok,
      reason: !parsed.is_valid_date
        ? "Embedded date is not a real calendar date."
        : !parsed.checksum_ok
          ? "Mod-11 checksum on 10-digit number failed."
          : "Birth number is well-formed.",
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
