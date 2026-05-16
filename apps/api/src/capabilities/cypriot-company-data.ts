// Cyprus — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a Openapi resolver replication. PARTIAL coverage: Openapi
// catalog has some CY entities (Bank of Cyprus on C-format `C165`
// confirmed 200 by 2026-05-11 probe) but returned 204 for Wargaming
// (CY99000230P) on 2026-05-15 v4 — anomaly bundled on Openapi case
// 151296. The capability accepts the shape; vendor returns not-found
// for some entities.
//
// Identifier shape: Openapi WW-Top accepts THREE regex variants for
// CY: ^CY\d{8}[A-Z]$ (CY-prefix VAT), ^\d{8}[A-Z]$ (bare VAT, no
// prefix), or ^C\d+$ (CRO company number, e.g. C165). The capability
// validates against the union shape and passes through to Openapi.
//
// Field coverage (Matrix row 34867c87-082c-8115-8442-e152ede99b8c):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const CY_RE = /^(CY\d{8}[A-Z]|\d{8}[A-Z]|C\d+)$/;

function normaliseCyIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, "").toUpperCase();
  return CY_RE.test(cleaned) ? cleaned : null;
}

registerCapability("cypriot-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.identifier as string) ??
    (input.company_number as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' or 'identifier' is required. Provide a Cypriot VAT (CY-prefix or bare 8-digit-plus-letter) or company number (C-prefix, e.g. C165).",
    );
  }
  const normalised = normaliseCyIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Cypriot identifier. Expected: CY + 8 digits + 1 letter (VAT), 8 digits + 1 letter (bare VAT), or C + digits (company number).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "CY",
      identifierRegex: CY_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "cypriot-company-data",
    },
    normalised,
  );
});

export { CY_RE };
