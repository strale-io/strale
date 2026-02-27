import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Payment reference number generation — pure algorithmic ─────────────────
// Supports Swedish OCR, Norwegian KID, Finnish reference, ISO 11649 RF

/**
 * Luhn check digit calculation.
 * Double every second digit from right, sum digits, check = (10 - sum%10) % 10
 */
function luhnCheckDigit(digits: string): number {
  let sum = 0;
  // Process digits right-to-left; the check digit position is index 0 (rightmost)
  // So existing digits start at position 1 (odd = double)
  for (let i = digits.length - 1; i >= 0; i--) {
    const pos = digits.length - i; // 1-based position from right
    let d = parseInt(digits[i], 10);
    if (isNaN(d)) throw new Error(`Non-digit character at position ${i}: '${digits[i]}'`);
    if (pos % 2 === 1) {
      // Odd position from right (1st, 3rd, ...) = double
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Finnish reference check digit using weights 7, 3, 1 repeating from right.
 */
function finnishCheckDigit(digits: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = digits.length - 1, w = 0; i >= 0; i--, w++) {
    const d = parseInt(digits[i], 10);
    if (isNaN(d)) throw new Error(`Non-digit character at position ${i}: '${digits[i]}'`);
    sum += d * weights[w % 3];
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * ISO 11649 RF Creditor Reference.
 * "RF" + 2 check digits (mod 97) + base reference (up to 21 alphanumeric chars).
 * Algorithm: take base + "RF00", convert letters (A=10..Z=35), compute mod97, check = 98 - remainder.
 */
function iso11649CheckDigits(base: string): string {
  // Validate base: up to 21 alphanumeric characters
  const cleaned = base.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z0-9]{1,21}$/.test(cleaned)) {
    throw new Error("ISO 11649 base reference must be 1-21 alphanumeric characters.");
  }

  // Rearrange: base + "RF00"
  const rearranged = cleaned + "RF00";

  // Convert letters to numbers: A=10, B=11, ..., Z=35
  let numeric = "";
  for (const ch of rearranged) {
    if (ch >= "A" && ch <= "Z") {
      numeric += (ch.charCodeAt(0) - 55).toString();
    } else {
      numeric += ch;
    }
  }

  // Compute mod 97 using iterative method (for large numbers)
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  const check = 98 - remainder;
  return check.toString().padStart(2, "0");
}

/**
 * Generate a random numeric string of given length.
 */
function randomDigits(length: number): string {
  let result = "";
  // First digit should not be 0
  result += Math.floor(Math.random() * 9 + 1).toString();
  for (let i = 1; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/**
 * Format RF reference in groups of 4 for readability.
 */
function formatRfReference(ref: string): string {
  const groups: string[] = [];
  for (let i = 0; i < ref.length; i += 4) {
    groups.push(ref.slice(i, i + 4));
  }
  return groups.join(" ");
}

registerCapability("payment-reference-generate", async (input: CapabilityInput) => {
  const refType = (
    (input.type as string) ?? (input.task as string) ?? ""
  )
    .trim()
    .toLowerCase();

  if (!refType) {
    throw new Error(
      "'type' is required. Supported types: ocr_se, ocr_no, ocr_fi, iso11649, rf.",
    );
  }

  const baseNumber = ((input.base_number as string) ?? "").trim();

  let reference: string;
  let checkDigit: string;
  let formatted: string;
  let algorithmUsed: string;
  let type: string;

  switch (refType) {
    case "ocr_se": {
      // Swedish OCR: 2-25 digits + Luhn check digit
      type = "ocr_se";
      algorithmUsed = "luhn";
      let base: string;
      if (baseNumber) {
        if (!/^\d{1,24}$/.test(baseNumber)) {
          throw new Error("Swedish OCR base_number must be 1-24 digits.");
        }
        base = baseNumber;
      } else {
        base = randomDigits(8);
      }
      const check = luhnCheckDigit(base);
      checkDigit = check.toString();
      reference = base + checkDigit;
      formatted = reference;
      break;
    }

    case "ocr_no": {
      // Norwegian KID: variable length, mod10 (Luhn) check digit
      type = "ocr_no";
      algorithmUsed = "luhn (mod10)";
      let base: string;
      if (baseNumber) {
        if (!/^\d{1,24}$/.test(baseNumber)) {
          throw new Error("Norwegian KID base_number must be 1-24 digits.");
        }
        base = baseNumber;
      } else {
        base = randomDigits(9);
      }
      const check = luhnCheckDigit(base);
      checkDigit = check.toString();
      reference = base + checkDigit;
      formatted = reference;
      break;
    }

    case "ocr_fi": {
      // Finnish reference: base + check digit using weights 7,3,1
      type = "ocr_fi";
      algorithmUsed = "mod10 (weights 7,3,1)";
      let base: string;
      if (baseNumber) {
        if (!/^\d{1,19}$/.test(baseNumber)) {
          throw new Error("Finnish reference base_number must be 1-19 digits.");
        }
        base = baseNumber;
      } else {
        base = randomDigits(7);
      }
      const check = finnishCheckDigit(base);
      checkDigit = check.toString();
      reference = base + checkDigit;
      // Finnish references are formatted in groups of 5 from right
      const rev = reference.split("").reverse();
      const groups: string[] = [];
      for (let i = 0; i < rev.length; i += 5) {
        groups.push(rev.slice(i, i + 5).reverse().join(""));
      }
      formatted = groups.reverse().join(" ");
      break;
    }

    case "iso11649":
    case "rf": {
      // ISO 11649 RF Creditor Reference
      type = "iso11649";
      algorithmUsed = "mod97 (ISO 11649)";
      let base: string;
      if (baseNumber) {
        base = baseNumber.toUpperCase().replace(/\s/g, "");
        if (!/^[A-Z0-9]{1,21}$/.test(base)) {
          throw new Error(
            "ISO 11649 base_number must be 1-21 alphanumeric characters.",
          );
        }
      } else {
        base = randomDigits(10);
      }
      const checkDigits = iso11649CheckDigits(base);
      checkDigit = checkDigits;
      reference = "RF" + checkDigits + base;
      formatted = formatRfReference(reference);
      break;
    }

    default:
      throw new Error(
        `Unsupported reference type: '${refType}'. Supported: ocr_se, ocr_no, ocr_fi, iso11649, rf.`,
      );
  }

  return {
    output: {
      reference,
      type,
      check_digit: checkDigit,
      formatted,
      algorithm_used: algorithmUsed,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
