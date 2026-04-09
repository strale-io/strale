/**
 * VAT Number Derivation from National Company Identifiers
 *
 * For EU countries where VAT numbers can be deterministically computed
 * from the national registration ID, this module provides the derivation.
 *
 * Returns the EU VAT number (e.g., "SE5560590308​01") or null if
 * derivation is not possible for the given country/ID combination.
 *
 * Reference: https://ec.europa.eu/taxation_customs/vies/faq.html
 */

/**
 * French VAT check digit calculation.
 * VAT key = (12 + 3 × (SIREN mod 97)) mod 97
 */
function frenchVatKey(siren: string): string {
  const sirenNum = parseInt(siren, 10);
  if (isNaN(sirenNum)) return "";
  const key = (12 + 3 * (sirenNum % 97)) % 97;
  return key.toString().padStart(2, "0");
}

/**
 * Derive EU VAT number from a national company identifier.
 *
 * @param countryCode - ISO 3166-1 alpha-2 (e.g., "SE", "DK", "FR")
 * @param nationalId - The national registration number (stripped of formatting)
 * @returns EU VAT number string or null if derivation is not possible
 */
export function deriveVatNumber(
  countryCode: string,
  nationalId: string | null | undefined,
): string | null {
  if (!nationalId) return null;
  const cc = countryCode.toUpperCase();
  // Strip common formatting
  const cleaned = nationalId.replace(/[\s\-\.]/g, "");

  switch (cc) {
    case "SE": {
      // Swedish: VAT = "SE" + 10-digit org number + "01"
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 10) return `SE${digits}01`;
      if (digits.length === 6) return null; // Short form, can't derive
      return null;
    }

    case "DK": {
      // Danish: VAT = "DK" + 8-digit CVR number
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 8) return `DK${digits}`;
      return null;
    }

    case "FI": {
      // Finnish: VAT = "FI" + 8-digit business ID (strip the dash)
      // Business ID format: 1234567-8 → FI12345678
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 8) return `FI${digits}`;
      if (digits.length === 7) return null; // Missing check digit
      return null;
    }

    case "FR": {
      // French: VAT = "FR" + 2-digit key + 9-digit SIREN
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 9) {
        const key = frenchVatKey(digits);
        return `FR${key}${digits}`;
      }
      if (digits.length === 14) {
        // SIRET: first 9 digits are the SIREN
        const siren = digits.substring(0, 9);
        const key = frenchVatKey(siren);
        return `FR${key}${siren}`;
      }
      return null;
    }

    case "BE": {
      // Belgian: VAT = "BE" + 10-digit enterprise number (with leading 0)
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 10) return `BE${digits}`;
      if (digits.length === 9) return `BE0${digits}`; // Add leading 0
      return null;
    }

    case "ES": {
      // Spanish: VAT = "ES" + NIF/CIF (8 digits + letter, or letter + 7 digits + letter)
      if (cleaned.length >= 9) return `ES${cleaned}`;
      return null;
    }

    case "PT": {
      // Portuguese: VAT = "PT" + 9-digit NIPC
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 9) return `PT${digits}`;
      return null;
    }

    case "IT": {
      // Italian: VAT = "IT" + 11-digit Partita IVA
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 11) return `IT${digits}`;
      return null;
    }

    // Countries where derivation is NOT possible from the available ID:
    // - NO: Not in EU (VIES won't validate)
    // - DE: HRB number ≠ VAT ID (separate Steuernummer system)
    // - NL: KVK number ≠ VAT (separate BTW system)
    // - IE: CRO number ≠ VAT
    // - PL: KRS number ≠ NIP (tax ID)
    // - CH: Not in EU
    // - UK: Not in EU
    // - AT: Already has eu_vat_ids in company data output

    default:
      return null;
  }
}

/**
 * Check if a country supports deterministic VAT derivation.
 */
export function canDeriveVat(countryCode: string): boolean {
  return ["SE", "DK", "FI", "FR", "BE", "ES", "PT", "IT"].includes(countryCode.toUpperCase());
}
