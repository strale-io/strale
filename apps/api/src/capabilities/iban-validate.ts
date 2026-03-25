import { registerCapability, type CapabilityInput } from "./index.js";

// ─── IBAN validation — pure algorithmic, no external API ──────────────────────

// Country-specific IBAN lengths
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20,
  BR: 29, BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28,
  TL: 23, EG: 29, SV: 28, EE: 20, FO: 18, FI: 18, FR: 27, GE: 22,
  DE: 22, GI: 23, GR: 27, GL: 18, GT: 28, HU: 28, IS: 26, IQ: 23,
  IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21,
  LB: 28, LY: 25, LI: 21, LT: 20, LU: 20, MK: 19, MT: 31, MR: 27,
  MU: 30, MC: 27, MD: 24, ME: 22, NL: 18, NO: 15, PK: 24, PS: 29,
  PL: 28, PT: 25, QA: 29, RO: 24, LC: 32, SM: 27, ST: 25, SA: 24,
  RS: 22, SC: 31, SK: 24, SI: 19, ES: 24, SD: 18, SE: 24, CH: 21,
  TN: 24, TR: 26, UA: 29, AE: 23, GB: 22, VA: 22, VG: 24,
};

// BIC/SWIFT bank identifiers per country (partial — common banks)
// In production this would be a full SWIFT directory lookup
function extractBankInfo(countryCode: string, bban: string): { bank_code: string; branch_code: string | null } {
  // Most countries encode bank code in the first 4-8 chars of BBAN
  // Country-specific parsing
  switch (countryCode) {
    case "DE": return { bank_code: bban.slice(0, 8), branch_code: null };
    case "GB": return { bank_code: bban.slice(0, 4), branch_code: bban.slice(4, 10) };
    case "FR": return { bank_code: bban.slice(0, 5), branch_code: bban.slice(5, 10) };
    case "SE": return { bank_code: bban.slice(0, 3), branch_code: null };
    case "NO": return { bank_code: bban.slice(0, 4), branch_code: null };
    case "DK": return { bank_code: bban.slice(0, 4), branch_code: null };
    case "FI": return { bank_code: bban.slice(0, 3), branch_code: null };
    case "NL": return { bank_code: bban.slice(0, 4), branch_code: null };
    case "ES": return { bank_code: bban.slice(0, 4), branch_code: bban.slice(4, 8) };
    case "IT": return { bank_code: bban.slice(1, 6), branch_code: bban.slice(6, 11) };
    case "AT": return { bank_code: bban.slice(0, 5), branch_code: null };
    case "CH": return { bank_code: bban.slice(0, 5), branch_code: null };
    default: return { bank_code: bban.slice(0, 4), branch_code: null };
  }
}

/**
 * Validate IBAN using ISO 13616 mod-97 algorithm.
 */
function validateIban(iban: string): {
  valid: boolean;
  country_code: string;
  check_digits: string;
  bban: string;
  bank_code: string;
  branch_code: string | null;
  expected_length: number | null;
  error?: string;
} {
  // Clean input
  const cleaned = iban.replace(/[\s-]/g, "").toUpperCase();

  // Basic format: 2 letters + 2 digits + alphanumeric BBAN
  const formatMatch = cleaned.match(/^([A-Z]{2})(\d{2})([A-Z0-9]+)$/);
  if (!formatMatch) {
    return {
      valid: false,
      country_code: "",
      check_digits: "",
      bban: "",
      bank_code: "",
      branch_code: null,
      expected_length: null,
      error: "Invalid IBAN format. Must start with 2-letter country code + 2 check digits.",
    };
  }

  const [, countryCode, checkDigits, bban] = formatMatch;
  const expectedLength = IBAN_LENGTHS[countryCode] ?? null;

  if (expectedLength && cleaned.length !== expectedLength) {
    return {
      valid: false,
      country_code: countryCode,
      check_digits: checkDigits,
      bban,
      bank_code: "",
      branch_code: null,
      expected_length: expectedLength,
      error: `Invalid length for ${countryCode}: expected ${expectedLength}, got ${cleaned.length}.`,
    };
  }

  // Mod-97 check: move first 4 chars to end, convert letters to numbers (A=10, B=11...)
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // BigInt mod 97 (IBAN can be up to 34 chars, too large for regular numbers)
  const remainder = BigInt(numeric) % 97n;
  const valid = remainder === 1n;

  const bankInfo = extractBankInfo(countryCode, bban);

  return {
    valid,
    country_code: countryCode,
    check_digits: checkDigits,
    bban,
    bank_code: bankInfo.bank_code,
    branch_code: bankInfo.branch_code,
    expected_length: expectedLength,
    ...(valid ? {} : { error: "IBAN check digits are invalid (mod-97 check failed)." }),
  };
}

registerCapability("iban-validate", async (input: CapabilityInput) => {
  const rawIban = (input.iban as string) ?? (input.task as string) ?? "";
  if (typeof rawIban !== "string" || !rawIban.trim()) {
    throw new Error("'iban' is required. Provide an IBAN to validate (e.g. SE3550000000054910000003).");
  }

  // Extract IBAN from input — only use regex if input looks like free text
  let ibanStr = rawIban.trim();
  const looksLikeFreeText = ibanStr.length > 34 || /\s{2,}|\b(validate|check|iban is|iban:)\b/i.test(ibanStr);
  if (looksLikeFreeText) {
    // Strict extraction: 2 letters + 2 digits + only alphanumeric (no trailing words)
    const ibanMatch = ibanStr.match(/[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}/);
    if (ibanMatch) {
      ibanStr = ibanMatch[0];
    }
  }

  const result = validateIban(ibanStr);

  return {
    output: result,
    provenance: {
      source: "iban-validate:algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});

// ─── Self-check (runs on startup in dev/test) ────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const SELF_CHECK_CASES: Array<{ iban: string; expectedValid: boolean }> = [
    { iban: "DE89370400440532013000", expectedValid: true },
    { iban: "GB82WEST12345698765432", expectedValid: true },
    { iban: "SE3550000000054910000003", expectedValid: true },
    { iban: "NO9386011117947", expectedValid: true },
    { iban: "SE0000000000000000000000", expectedValid: false },
    { iban: "XX1234567890", expectedValid: false },
  ];
  for (const { iban, expectedValid } of SELF_CHECK_CASES) {
    const result = validateIban(iban);
    if (result.valid !== expectedValid) {
      throw new Error(
        `[iban-validate] Self-check failed: ${iban} — expected valid=${expectedValid}, got ${result.valid}`,
      );
    }
  }
}
