/**
 * Czech-specific ID validators.
 *
 * IČO — 8-digit company identifier issued by the Czech Statistical Office.
 * Mod-11 check on the 8th digit with weights [8,7,6,5,4,3,2] on the first 7.
 * Special cases: c=0 → check=1, c=1 → check=0, else check=11-c.
 */

export function normalizeIco(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "");
  if (!/^\d{1,8}$/.test(cleaned)) return null;
  return cleaned.padStart(8, "0");
}

export function isValidIcoChecksum(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += parseInt(ico[i], 10) * weights[i];
  const c = sum % 11;
  let expected: number;
  if (c === 0) expected = 1;
  else if (c === 1) expected = 0;
  else expected = 11 - c;
  return expected === parseInt(ico[7], 10);
}

/**
 * Czech birth number (rodné číslo) — YYMMDD/SSSC or YYMMDDSSSC.
 *  - Women: month is +50. Pre-2004 special: +20 for overflow allocations.
 *  - Pre-1954 birth numbers are 9 digits and have no check digit.
 *  - Post-1954 are 10 digits; mod-11 check on full 10-digit number.
 *    Historical edge: if number mod 11 == 10, the check digit may be 0
 *    (allowed pre-1985 for allocation-overflow cases).
 */
export type RcParsed = {
  year: number;
  month: number;
  day: number;
  gender: "male" | "female";
  is_valid_date: boolean;
  has_check_digit: boolean;
  checksum_ok: boolean;
  normalized: string;
};

export function parseBirthNumber(raw: string): RcParsed | null {
  const cleaned = raw.replace(/[\s/-]/g, "");
  if (!/^\d{9,10}$/.test(cleaned)) return null;

  const yy = parseInt(cleaned.slice(0, 2), 10);
  let mm = parseInt(cleaned.slice(2, 4), 10);
  const dd = parseInt(cleaned.slice(4, 6), 10);

  const gender: "male" | "female" = mm > 50 ? "female" : "male";
  if (mm > 70) mm -= 70; // post-2004 overflow (female)
  else if (mm > 50) mm -= 50; // standard female
  else if (mm > 20) mm -= 20; // post-2004 overflow (male)

  const hasCheck = cleaned.length === 10;
  // Century inference: 10-digit rodné číslo is post-1954. 9-digit is pre-1954.
  const fullYear = hasCheck
    ? yy < 54
      ? 2000 + yy
      : 1900 + yy
    : 1900 + yy;

  const date = new Date(fullYear, mm - 1, dd);
  const validDate =
    date.getFullYear() === fullYear &&
    date.getMonth() === mm - 1 &&
    date.getDate() === dd &&
    mm >= 1 &&
    mm <= 12 &&
    dd >= 1 &&
    dd <= 31;

  let checksumOk = true;
  if (hasCheck) {
    const body = parseInt(cleaned.slice(0, 9), 10);
    const check = parseInt(cleaned[9], 10);
    const mod = body % 11;
    checksumOk = mod === check || (mod === 10 && check === 0);
  }

  return {
    year: fullYear,
    month: mm,
    day: dd,
    gender,
    is_valid_date: validDate,
    has_check_digit: hasCheck,
    checksum_ok: checksumOk,
    normalized: cleaned,
  };
}

/**
 * Czech bank account (BBAN) validation.
 * Format: [prefix-]account/bank_code
 *  - prefix: up to 6 digits (optional)
 *  - account: up to 10 digits
 *  - bank_code: 4 digits
 * Weights: prefix [10,5,8,4,2,1], account [6,3,7,9,10,5,8,4,2,1].
 * Mod 11 sum of (digit*weight) must be 0 for both prefix and account.
 */
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const ACCOUNT_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

function weightedMod11(num: string, weights: number[]): number {
  const padded = num.padStart(weights.length, "0");
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += parseInt(padded[i], 10) * weights[i];
  return sum % 11;
}

export type CzBankAccountParts = {
  prefix: string;
  account: string;
  bank_code: string;
  prefix_checksum_ok: boolean;
  account_checksum_ok: boolean;
  is_valid: boolean;
};

export function parseCzBankAccount(raw: string): CzBankAccountParts | null {
  const cleaned = raw.replace(/\s/g, "");
  const m = cleaned.match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if (!m) return null;

  const prefix = m[1] ?? "";
  const account = m[2];
  const bankCode = m[3];

  const prefixOk = prefix === "" ? true : weightedMod11(prefix, PREFIX_WEIGHTS) === 0;
  const accountOk = weightedMod11(account, ACCOUNT_WEIGHTS) === 0;

  return {
    prefix,
    account,
    bank_code: bankCode,
    prefix_checksum_ok: prefixOk,
    account_checksum_ok: accountOk,
    is_valid: prefixOk && accountOk,
  };
}

/**
 * Czech data box (datová schránka) ID — 7-character alphanumeric.
 * Uppercase letters (excluding I, O) and digits 2-9 (excluding 0, 1).
 * Format check only; no checksum.
 */
export function isValidDataBoxId(raw: string): boolean {
  const cleaned = raw.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{7}$/.test(cleaned);
}
