// Portugal — Openapi.com PT-Advanced (Tier-3 vendor aggregator).
//
// Phase 2b Openapi resolver replication. REPLACES the prior northdata.com
// Browserless scraping path (Tier 1 violation per DEC-20260427-I-2,
// deactivated 2026-04-29). Openapi is the licensed multi-country
// aggregator path per DEC-20260507-C.
//
// Identifier shape: Portuguese NIPC (Número de Identificação de Pessoa
// Coletiva) — bare 9-digit, e.g. 504499777 for Galp Energia. The
// capability also accepts PT-prefix VAT (PT504499777) and strips the
// prefix.
//
// Field coverage (Matrix row 34867c87-082c-81ea-a495-d9b01e9da1d9):
// Tier 1 6/7 (no legal_form via *-Advanced),
// Tier 2 4/5 (no directors via *-Advanced — IT-only product line),
// Tier 3 2/6 (NACE + last_filing_date; share_capital NOT returned by
// PT-Advanced — Matrix's 3/6 claim with "share capital" is over-stated
// by 1; only IT-Advanced has shareCapital).
//
// Direct Registo Comercial / publicacoes.mj.pt integration queued as
// v1.1 quality upgrade per DEC-20260507-C (separate workstream).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const PT_NIPC_RE = /^\d{9}$/;

function normalisePtIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  // Strip PT-prefix VAT shape (PT504499777 → 504499777)
  const stripped = cleaned.startsWith("PT") ? cleaned.slice(2) : cleaned;
  return PT_NIPC_RE.test(stripped) ? stripped : null;
}

registerCapability("portuguese-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.nipc as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' or 'nipc' is required. Provide a Portuguese NIPC (9 digits, e.g. 504499777). PT-prefix VAT format is also accepted (e.g. PT504499777).",
    );
  }
  const normalised = normalisePtIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Portuguese NIPC. Expected format: 9 digits (e.g. 504499777).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "PT",
      identifierRegex: PT_NIPC_RE,
      openapiProduct: "pt-advanced",
      capabilitySlug: "portuguese-company-data",
    },
    normalised,
  );
});

export { PT_NIPC_RE };
