import { registerCapability, type CapabilityInput } from "./index.js";

// Luhn checksum (used by Swedish personnummer)
function luhnCheck(digits: number[]): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

interface ValidationResult {
  valid: boolean;
  format_correct: boolean;
  checksum_valid: boolean | null;
  id_type: string;
  country_code: string;
  normalized: string;
  extracted_info: Record<string, unknown> | null;
  error?: string;
}

function validateSwedish(id: string): ValidationResult {
  // Swedish personnummer: YYMMDD-XXXX or YYYYMMDD-XXXX
  const cleaned = id.replace(/[\s-]/g, "");
  let digits = cleaned;

  if (digits.length === 12) digits = digits.slice(2); // YYYYMMDD → YYMMDD
  if (digits.length !== 10) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "personnummer", country_code: "SE", normalized: id, extracted_info: null, error: "Must be 10 or 12 digits" };
  }

  const nums = digits.split("").map(Number);
  if (nums.some(isNaN)) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "personnummer", country_code: "SE", normalized: id, extracted_info: null, error: "Non-numeric characters" };
  }

  const checksumValid = luhnCheck(nums);
  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const normalized = `${yy}${mm}${dd}-${digits.slice(6)}`;

  return {
    valid: checksumValid,
    format_correct: true,
    checksum_valid: checksumValid,
    id_type: "personnummer",
    country_code: "SE",
    normalized,
    extracted_info: { birth_date_part: `${yy}${mm}${dd}`, gender: parseInt(digits[8]) % 2 === 0 ? "female" : "male" },
  };
}

function validateFinnish(id: string): ValidationResult {
  // Finnish henkilötunnus: DDMMYY{-+A}XXXC
  const match = id.match(/^(\d{2})(\d{2})(\d{2})([-+A-F])(\d{3})([0-9A-Y])$/i);
  if (!match) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "henkilötunnus", country_code: "FI", normalized: id, extracted_info: null, error: "Invalid format" };
  }

  const [, dd, mm, yy, sep, num, check] = match;
  const remainder = parseInt(`${dd}${mm}${yy}${num}`) % 31;
  const checkChars = "0123456789ABCDEFHJKLMNPRSTUVWXY";
  const checksumValid = checkChars[remainder] === check.toUpperCase();
  const normalized = `${dd}${mm}${yy}${sep}${num}${check}`.toUpperCase();

  return {
    valid: checksumValid,
    format_correct: true,
    checksum_valid: checksumValid,
    id_type: "henkilötunnus",
    country_code: "FI",
    normalized,
    extracted_info: { birth_date_part: `${dd}${mm}${yy}` },
  };
}

function validateNorwegian(id: string): ValidationResult {
  const cleaned = id.replace(/[\s-]/g, "");
  if (cleaned.length !== 11 || !/^\d{11}$/.test(cleaned)) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "fødselsnummer", country_code: "NO", normalized: id, extracted_info: null, error: "Must be 11 digits" };
  }

  const d = cleaned.split("").map(Number);
  const w1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  const w2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += d[i] * w1[i];
  const check1 = 11 - (sum1 % 11);
  const c1 = check1 === 11 ? 0 : check1;

  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += d[i] * w2[i];
  const check2 = 11 - (sum2 % 11);
  const c2 = check2 === 11 ? 0 : check2;

  const checksumValid = c1 !== 10 && c2 !== 10 && d[9] === c1 && d[10] === c2;

  return {
    valid: checksumValid,
    format_correct: true,
    checksum_valid: checksumValid,
    id_type: "fødselsnummer",
    country_code: "NO",
    normalized: `${cleaned.slice(0, 6)} ${cleaned.slice(6)}`,
    extracted_info: { birth_date_part: cleaned.slice(0, 6) },
  };
}

function validateDanish(id: string): ValidationResult {
  const cleaned = id.replace(/[\s-]/g, "");
  if (cleaned.length !== 10 || !/^\d{10}$/.test(cleaned)) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "CPR-nummer", country_code: "DK", normalized: id, extracted_info: null, error: "Must be 10 digits" };
  }

  // Modern Danish CPR numbers (post-2007) don't always use modulus 11
  const normalized = `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
  return {
    valid: true,
    format_correct: true,
    checksum_valid: null, // modulus 11 no longer required
    id_type: "CPR-nummer",
    country_code: "DK",
    normalized,
    extracted_info: { birth_date_part: cleaned.slice(0, 6), gender: parseInt(cleaned[9]) % 2 === 0 ? "female" : "male" },
  };
}

function validateUKNI(id: string): ValidationResult {
  const cleaned = id.replace(/[\s-]/g, "").toUpperCase();
  const match = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(cleaned);
  return {
    valid: match,
    format_correct: match,
    checksum_valid: null,
    id_type: "National Insurance Number",
    country_code: "GB",
    normalized: match ? `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned[8]}` : id,
    extracted_info: null,
  };
}

function validateUSSSN(id: string): ValidationResult {
  const cleaned = id.replace(/[\s-]/g, "");
  if (cleaned.length !== 9 || !/^\d{9}$/.test(cleaned)) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "SSN", country_code: "US", normalized: id, extracted_info: null, error: "Must be 9 digits" };
  }
  const area = parseInt(cleaned.slice(0, 3));
  const group = parseInt(cleaned.slice(3, 5));
  const serial = parseInt(cleaned.slice(5));
  const formatValid = area > 0 && area !== 666 && area < 900 && group > 0 && serial > 0;
  const normalized = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`;

  return {
    valid: formatValid,
    format_correct: formatValid,
    checksum_valid: null,
    id_type: "SSN",
    country_code: "US",
    normalized,
    extracted_info: null,
  };
}

function validateGermanSteuerID(id: string): ValidationResult {
  const cleaned = id.replace(/[\s-]/g, "");
  if (cleaned.length !== 11 || !/^\d{11}$/.test(cleaned)) {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "Steuerliche Identifikationsnummer", country_code: "DE", normalized: id, extracted_info: null, error: "Must be 11 digits" };
  }
  if (cleaned[0] === "0") {
    return { valid: false, format_correct: false, checksum_valid: null, id_type: "Steuerliche Identifikationsnummer", country_code: "DE", normalized: id, extracted_info: null, error: "Cannot start with 0" };
  }

  return {
    valid: true,
    format_correct: true,
    checksum_valid: null,
    id_type: "Steuerliche Identifikationsnummer",
    country_code: "DE",
    normalized: cleaned,
    extracted_info: null,
  };
}

const VALIDATORS: Record<string, (id: string) => ValidationResult> = {
  SE: validateSwedish,
  FI: validateFinnish,
  NO: validateNorwegian,
  DK: validateDanish,
  GB: validateUKNI,
  UK: validateUKNI,
  US: validateUSSSN,
  DE: validateGermanSteuerID,
};

registerCapability("id-number-validate", async (input: CapabilityInput) => {
  const idNumber = ((input.id_number as string) ?? (input.task as string) ?? "").trim();
  if (!idNumber) throw new Error("'id_number' is required.");

  const countryCode = ((input.country_code as string) ?? "").trim().toUpperCase();
  if (!countryCode) throw new Error("'country_code' is required (ISO 2-letter code).");

  const validator = VALIDATORS[countryCode];
  if (!validator) {
    return {
      output: {
        valid: false,
        country_code: countryCode,
        id_type: "unknown",
        format_correct: false,
        checksum_valid: null,
        normalized: idNumber,
        extracted_info: null,
        error: `Country '${countryCode}' not supported. Supported: ${Object.keys(VALIDATORS).filter(k => k.length === 2).join(", ")}`,
      },
      provenance: { source: "strale-id-validator", fetched_at: new Date().toISOString() },
    };
  }

  const result = validator(idNumber);
  return {
    output: { ...result },
    provenance: { source: "strale-id-validator", fetched_at: new Date().toISOString() },
  };
});
