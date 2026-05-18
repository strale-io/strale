// Romania — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a Openapi resolver replication. PARTIAL coverage with a
// structural caveat: Openapi WW-Top regex requires ^RO\d{8}$ |
// ^\d{13}$ | ^\d{8}$. Entities with 7-digit CUI (Banca Transilvania
// RO5022670, OMV Petrom RO1590082) structurally rejected with 406 —
// confirmed across 4 probe attempts (2026-05-11 + v3 + v4 WW-Top + v4
// WW-start with padding). 8-digit-CUI entities (Hidroelectrica
// RO13267213) work fine. Anomaly bundled on Openapi case 151296.
//
// Identifier shape: union of RO + 8 digits | 13 digits | 8 digits.
// Capability validates the union shape; vendor 406s 7-digit-CUI inputs.
//
// Field coverage (Matrix row 34867c87-082c-81dd-b802-e5397b801133):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const RO_RE = /^(RO\d{8}|\d{13}|\d{8})$/;

function normaliseRoIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  return RO_RE.test(cleaned) ? cleaned : null;
}

registerCapability("romanian-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.cui as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' or 'cui' is required. Provide a Romanian VAT (RO + 8 digits, e.g. RO13267213) or CUI (8 or 13 digits). 7-digit CUI entities are not in the upstream catalog.",
    );
  }
  const normalised = normaliseRoIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Romanian identifier. Expected: RO + 8 digits (VAT), 13 digits (full CUI), or 8 digits (CUI). 7-digit CUI entities (legacy banks, older corporations) are not reachable.`,
    );
  }
  const __etResult = await executeOpenapiCapability(
    {
      countryCode: "RO",
      identifierRegex: RO_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "romanian-company-data",
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
      ubo_availability: "unavailable_no_registry",
      ubo_availability_reason: "Programmatic UBO access not yet operational at v1; verification pending public-source confirmation",
    },
  };
});

export { RO_RE };
