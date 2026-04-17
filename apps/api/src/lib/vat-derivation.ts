/**
 * Algorithmic VAT number derivation from national registry IDs.
 *
 * For 9 EU countries, the VAT number is a deterministic function of the
 * company registry ID. No external API call needed.
 *
 * Returns null if the registry ID format is unrecognized or the country
 * doesn't support algorithmic derivation (e.g. Germany, Netherlands).
 */

/**
 * France: FR + 2-digit key + SIREN (9 digits)
 * Key = (12 + 3 * (SIREN mod 97)) mod 97
 */
export function deriveVatFR(siren: string): string | null {
  const cleaned = siren.replace(/[\s.-]/g, "");
  if (!/^\d{9}$/.test(cleaned)) return null;
  const sirenNum = parseInt(cleaned, 10);
  const key = (12 + 3 * (sirenNum % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${cleaned}`;
}

/**
 * Sweden: SE + org number (10 digits, no hyphen) + 01
 */
export function deriveVatSE(orgNumber: string): string | null {
  const cleaned = orgNumber.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(cleaned)) return null;
  return `SE${cleaned}01`;
}

/**
 * Norway: NO + org number (9 digits) + MVA
 * Note: only VAT-registered entities have this. We derive the format
 * but can't confirm registration without checking the MVA registry.
 */
export function deriveVatNO(orgNumber: string): string | null {
  const cleaned = orgNumber.replace(/[\s.-]/g, "");
  if (!/^\d{9}$/.test(cleaned)) return null;
  return `NO${cleaned}MVA`;
}

/**
 * Denmark: DK + CVR number (8 digits)
 */
export function deriveVatDK(cvrNumber: string): string | null {
  const cleaned = cvrNumber.replace(/[\s.-]/g, "");
  if (!/^\d{8}$/.test(cleaned)) return null;
  return `DK${cleaned}`;
}

/**
 * Finland: FI + business ID (8 chars: 7 digits + check digit, no hyphen)
 */
export function deriveVatFI(businessId: string): string | null {
  const cleaned = businessId.replace(/[\s-]/g, "");
  if (!/^\d{7,8}$/.test(cleaned)) return null;
  return `FI${cleaned.padStart(8, "0")}`;
}

/**
 * Belgium: BE + enterprise number (10 digits, strip dots)
 */
export function deriveVatBE(enterpriseNumber: string): string | null {
  const cleaned = enterpriseNumber.replace(/[\s.-]/g, "");
  if (!/^\d{10}$/.test(cleaned)) return null;
  return `BE${cleaned}`;
}

/**
 * Italy: IT + Codice Fiscale / Partita IVA (11 digits for companies)
 */
export function deriveVatIT(codiceFiscale: string): string | null {
  const cleaned = codiceFiscale.replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(cleaned)) return null;
  return `IT${cleaned}`;
}

/**
 * Spain: ES + CIF/NIF (letter + 7 digits + letter/digit)
 */
export function deriveVatES(cif: string): string | null {
  const cleaned = cif.replace(/[\s.-]/g, "").toUpperCase();
  if (!/^[A-Z]\d{7}[A-Z0-9]$/.test(cleaned)) return null;
  return `ES${cleaned}`;
}

/**
 * Poland: PL + NIP (10 digits)
 * Note: NIP is the tax ID, which is different from KRS (court registry number).
 * KRS -> NIP requires the KRS API response to include the NIP field.
 */
export function deriveVatPL(nip: string): string | null {
  const cleaned = nip.replace(/[\s.-]/g, "");
  if (!/^\d{10}$/.test(cleaned)) return null;
  return `PL${cleaned}`;
}

/**
 * Czech Republic: CZ + IČO (8 digits) for most legal entities.
 * Natural persons' DIČ may be CZ + rodné číslo (9 or 10 digits); we don't
 * derive those here. ARES returns the authoritative DIČ directly when known.
 */
export function deriveVatCZ(ico: string): string | null {
  const cleaned = ico.replace(/[\s.-]/g, "");
  if (!/^\d{8}$/.test(cleaned)) return null;
  return `CZ${cleaned}`;
}
