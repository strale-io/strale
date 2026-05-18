// Netherlands — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a Openapi resolver replication. REPLACES the prior northdata.com
// scraping path (Tier 1 violation per DEC-20260427-I-1, deactivated
// 2026-04-29). KVK Option B closed 2026-05-12 (DEC-20260512-A: Mirjam
// Boele confirmed KVK partner status is closed to foreign EU entities).
// Openapi is the licensed-aggregator path per DEC-20260507-B.
//
// Identifier shape: NL VAT (omzetbelasting) is NL + 9 digits + B + 2
// digits (e.g. NL803441526B01). KvK 8-digit registration numbers
// rejected by Openapi WW-Top — VAT is the canonical input. No NL-*
// country-specific Openapi product exists (scope rejected).
//
// Field coverage (Matrix row 34867c87-082c-81f7-bb3b-f242c2d6edb2):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const NL_VAT_RE = /^NL\d{9}B\d{2}$/;

function normaliseNlIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  return NL_VAT_RE.test(cleaned) ? cleaned : null;
}

registerCapability("dutch-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' is required. Provide a Dutch VAT/BTW number (NL + 9 digits + B + 2 digits, e.g. NL803441526B01). KvK numbers are not accepted by the upstream API.",
    );
  }
  const normalised = normaliseNlIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Dutch VAT/BTW number. Expected format: NL + 9 digits + B + 2 digits (e.g. NL803441526B01).`,
    );
  }
  const __etResult = await executeOpenapiCapability(
    {
      countryCode: "NL",
      identifierRegex: NL_VAT_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "dutch-company-data",
    },
    normalised,
  );
  return {
    ...__etResult,
    output: {
      ...__etResult.output,
      // Evidence Tier 1 canonical aliases (DEC-20260518-A)
      legal_name: (__etResult.output as Record<string, unknown>).company_name,
      primary_registration_id: (__etResult.output as Record<string, unknown>).registration_number,
      date_incorporated: (__etResult.output as Record<string, unknown>).registered_date,
      // Evidence Tier framework labels (DEC-20260518-A)
      tier_2_available: false,
      tier_2_available_reason: "Openapi-served endpoint does not expose directors at current tier (universal caveat for WW-Top + *-Advanced products; IT-Full deferred to v1.1)",
      ubo_availability: "restricted",
      ubo_availability_reason: "UBO register access restricted post-CJEU 2022 Wwft ruling",
    },
  };
});

export { NL_VAT_RE };
