import { inputRefusal } from "../lib/capability-refusal.js";
import { IBAN_LENGTHS } from "../lib/iban-registry.js";
import { registerCapability, type CapabilityInput } from "./index.js";

// ─── IBAN validation — pure algorithmic, no external API ──────────────────────

// Country-specific IBAN lengths: lib/iban-registry.ts (SWIFT IBAN Registry).

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
  const rawIban = (input.iban as string) ?? "";
  if (typeof rawIban !== "string" || !rawIban.trim()) {
    throw inputRefusal("'iban' is required. Provide an IBAN to validate (e.g. SE3550000000054910000003).", "iban", "Send 'iban' as an IBAN string including its two-letter country prefix and check digits.");
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
