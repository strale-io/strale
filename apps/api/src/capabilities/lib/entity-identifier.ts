import { resolveCountryAlpha2 } from "./iso-3166.js";

export type IdentifierType = "lei" | "bic" | "isin" | "vat" | "registry";

export class EntityResolveError extends Error {
  constructor(public error_code: "invalid_request" | "execution_failed", message: string,
    public details?: Record<string, unknown>) {
    super(message);
    this.name = "EntityResolveError";
  }
}

function expanded(value: string): string {
  return value.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
}
export function validLei(value: string): boolean {
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(value)) return false;
  let remainder = 0;
  for (const digit of expanded(value)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export function validIsin(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
  const digits = expanded(value);
  let total = 0;
  for (let i = digits.length - 1, n = 0; i >= 0; i--, n++) {
    const d = Number(digits[i]) * (n % 2 ? 2 : 1);
    total += d > 9 ? d - 9 : d;
  }
  return total % 10 === 0;
}
export function validBic(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value);
}
// National VAT shapes only: VIES, through vat-validate, establishes validity.
const VAT_SHAPES: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, HR: /^\d{11}$/,
  CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/,
  EE: /^\d{9}$/, EL: /^\d{9}$/, ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/, FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, HU: /^\d{8}$/,
  IE: /^(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/, IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/,
  RO: /^\d{2,10}$/, SE: /^\d{10}01$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
  XI: /^(\d{9}|\d{12}|(GD|HA)\d{3})$/,
};
export function validVat(value: string): boolean {
  return VAT_SHAPES[value.slice(0, 2)]?.test(value.slice(2)) ?? false;
}
const checks = { lei: validLei, isin: validIsin, bic: validBic, vat: validVat,
  registry: (s: string) => /^[A-Z0-9](?:[A-Z0-9 ./()-]{0,98}[A-Z0-9])?$/.test(s) };

export function parseIdentifier(input: Record<string, unknown>): { identifier: string; type: IdentifierType; country?: string } {
  if (typeof input.identifier !== "string" || !input.identifier.trim() || input.identifier.length > 100) {
    throw new EntityResolveError("invalid_request", "'identifier' must be a company identifier (1–100 characters).");
  }
  const identifier = input.identifier.trim().toUpperCase();
  let country: string | undefined;
  if (input.country !== undefined) {
    if (typeof input.country !== "string" || (!/^[A-Z]{2}$/i.test(input.country) || resolveCountryAlpha2(input.country) !== input.country.toUpperCase())) {
      throw new EntityResolveError("invalid_request", "'country' must be an ISO2 country code.");
    }
    country = input.country.toUpperCase();
  }
  if (input.type !== undefined) {
    if (typeof input.type !== "string" || !Object.hasOwn(checks, input.type)) {
      throw new EntityResolveError("invalid_request", "'type' must be lei, bic, isin, vat or registry.");
    }
    const type = input.type as IdentifierType;
    if (type === "registry" && !country) throw new EntityResolveError("invalid_request", "'country' must be supplied as ISO2 for a registry identifier.");
    if (!checks[type](identifier)) throw new EntityResolveError("invalid_request", `'identifier' must be a valid ${type} identifier. Check its format and check digits, where applicable.`);
    return { identifier, type, country };
  }
  const candidates = (Object.keys(checks) as IdentifierType[]).filter(type =>
    type !== "registry" && checks[type](identifier));
  if (!candidates.length && country && checks.registry(identifier)) candidates.push("registry");
  if (candidates.length !== 1) {
    throw new EntityResolveError("invalid_request", candidates.length > 1
      ? "'type' must be supplied for an ambiguous identifier: lei, bic, isin, vat or registry."
      : "'identifier' must be recognized and unambiguous. Check format and check digits, or provide type and country for a registry number.",
    { candidates });
  }
  return { identifier, type: candidates[0], country };
}
