// Spain — Openapi.com ES-Advanced (Tier-3 vendor aggregator).
//
// Phase 2b Openapi resolver replication. REPLACES the prior empresia.es +
// infocif.es Browserless scraping path (Tier 1 violation per
// DEC-20260427-I-4, deactivated 2026-04-29). Openapi is the licensed
// multi-country aggregator path per DEC-20260507-C.
//
// Identifier shape: Spanish CIF/NIF — letter + 7 digits + check character
// (letter or digit), e.g. A28015865 for Telefónica. The capability also
// accepts ES-prefix VAT (ESA28015865) and strips the prefix.
//
// Field coverage (Matrix row 34867c87-082c-8178-8061-eda241b42b63):
// Tier 1 6/7 (no legal_form via *-Advanced),
// Tier 2 4/5 (no directors via *-Advanced — IT-only product line),
// Tier 3 2/6 (NACE + last_filing_date; share_capital NOT returned by
// ES-Advanced — Matrix's 3/6 claim with "share capital" is over-stated
// by 1; only IT-Advanced has shareCapital).
//
// Direct Registradores / opendata.registradores.org integration queued
// as v1.1 quality upgrade per DEC-20260507-C (separate workstream).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

// CIF/NIF canonical: 1 letter + 7 digits + 1 check char (letter or digit).
const ES_NIF_RE = /^[A-Z]\d{7}[A-Z0-9]$/;

function normaliseEsIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  // Strip ES-prefix VAT shape (ESA28015865 → A28015865)
  const stripped = cleaned.startsWith("ES") ? cleaned.slice(2) : cleaned;
  return ES_NIF_RE.test(stripped) ? stripped : null;
}

registerCapability("spanish-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.nif as string) ??
    (input.cif as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' or 'nif' is required. Provide a Spanish CIF/NIF (letter + 7 digits + check character, e.g. A28015865). ES-prefix VAT format is also accepted (e.g. ESA28015865).",
    );
  }
  const normalised = normaliseEsIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Spanish CIF/NIF. Expected format: letter + 7 digits + check character (e.g. A28015865).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "ES",
      identifierRegex: ES_NIF_RE,
      openapiProduct: "es-advanced",
      capabilitySlug: "spanish-company-data",
    },
    normalised,
  );
});

export { ES_NIF_RE };
