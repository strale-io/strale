import { registerCapability, type CapabilityInput } from "./index.js";

// ISBN validation — pure algorithmic
// Supports ISBN-10 and ISBN-13

function validateIsbn10(digits: string): boolean {
  if (digits.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = parseInt(digits[i], 10);
    if (isNaN(d)) return false;
    sum += d * (10 - i);
  }
  const last = digits[9].toUpperCase();
  const check = last === "X" ? 10 : parseInt(last, 10);
  if (isNaN(check) && last !== "X") return false;
  sum += check;
  return sum % 11 === 0;
}

function validateIsbn13(digits: string): boolean {
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    if (isNaN(d)) return false;
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[12], 10);
}

function isbn10to13(isbn10: string): string {
  const base = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

function formatIsbn13(isbn: string): string {
  // Standard ISBN-13 grouping: prefix-group-publisher-title-check
  // Simplified: just format as XXX-X-XXXX-XXXX-X for common cases
  if (isbn.length !== 13) return isbn;
  return isbn; // Return unformatted — proper grouping requires range data
}

registerCapability("isbn-validate", async (input: CapabilityInput) => {
  const raw = (input.isbn as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'isbn' is required. Provide an ISBN-10 or ISBN-13.");
  }

  // Remove hyphens, spaces
  const cleaned = raw.trim().replace(/[-\s]/g, "");

  let type: "ISBN-10" | "ISBN-13" | "unknown" = "unknown";
  let valid = false;
  let isbn13: string | null = null;

  if (cleaned.length === 10) {
    type = "ISBN-10";
    valid = validateIsbn10(cleaned);
    if (valid) {
      isbn13 = isbn10to13(cleaned);
    }
  } else if (cleaned.length === 13) {
    type = "ISBN-13";
    valid = validateIsbn13(cleaned);
    isbn13 = valid ? cleaned : null;
  }

  // Extract EAN prefix for ISBN-13
  let eanPrefix: string | null = null;
  let registrationGroup: string | null = null;
  if (isbn13) {
    eanPrefix = isbn13.slice(0, 3); // 978 or 979
    registrationGroup = isbn13.slice(3, 4); // First digit of group (simplified)
  }

  return {
    output: {
      valid,
      isbn_input: raw.trim(),
      isbn_cleaned: cleaned,
      type,
      isbn13: isbn13,
      ean_prefix: eanPrefix,
      ...(type === "unknown"
        ? { error: `Invalid length: ${cleaned.length}. ISBN must be 10 or 13 digits.` }
        : {}),
      ...(!valid && type !== "unknown"
        ? { error: `Checksum validation failed for ${type}.` }
        : {}),
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
