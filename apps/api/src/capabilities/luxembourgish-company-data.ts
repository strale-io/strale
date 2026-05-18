// Luxembourg — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a Openapi resolver replication. Strong empirical coverage:
// 2026-05-11 LU-followup probe confirmed 5 entities (Aperam, BGL BNP
// Paribas, Cargolux, RTL Group, BCEE) + SES via gap-country-verify, all
// 200 via WW-Top with LU-prefix VAT. B-prefix RCS company numbers
// rejected with 406 — VAT is the canonical input.
//
// Note: no LU-* country-specific Openapi product exists (token scope
// rejected on v3 probe). WW-Top is the only path.
//
// Field coverage (Matrix row 34867c87-082c-81c8-a809-f2673f0e7ff3):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const LU_VAT_RE = /^LU\d{8}$/;

function normaliseLuIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  return LU_VAT_RE.test(cleaned) ? cleaned : null;
}

registerCapability(
  "luxembourgish-company-data",
  async (input: CapabilityInput) => {
    const rawInput =
      (input.vat_number as string) ??
      (input.identifier as string) ??
      "";
    if (typeof rawInput !== "string" || !rawInput.trim()) {
      throw new Error(
        "'vat_number' is required. Provide a Luxembourgish VAT (LU + 8 digits, e.g. LU18513414). RCS B-prefix company numbers are not accepted by the upstream API.",
      );
    }
    const normalised = normaliseLuIdentifier(rawInput.trim());
    if (!normalised) {
      throw new Error(
        `'${rawInput.trim()}' is not a valid Luxembourgish VAT. Expected format: LU + 8 digits (e.g. LU18513414).`,
      );
    }
    const __etResult = await executeOpenapiCapability(
      {
        countryCode: "LU",
        identifierRegex: LU_VAT_RE,
        openapiProduct: "ww-top",
        capabilitySlug: "luxembourgish-company-data",
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
      ubo_availability_reason: "RBE (Registre des bénéficiaires effectifs) access restricted post-CJEU 2022",
    },
  };
  },
);

export { LU_VAT_RE };
