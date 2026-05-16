// Hungary — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a Openapi resolver replication. v2 probe (2026-05-15) initially
// reported HU as "format-rejected" because v2 used bare 8-digit
// Cégjegyzékszám (returns 406). v3 probe (same day) resolved this:
// Openapi WW-Top accepts HU-prefix VAT (^HU\d{8}$) and returns the
// underlying entity. OTP/MOL/Richter Gedeon all 200 via v3.
//
// Identifier shape: HU + 8 digits (Hungarian "általános forgalmi adó"
// VAT prefix). Cégjegyzékszám (10-digit hyphenated) NOT accepted by
// Openapi WW-Top — capability rejects pre-flight.
//
// Field coverage (Matrix row 34867c87-082c-810f-a5a9-ef73291fc0f3):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const HU_VAT_RE = /^HU\d{8}$/;

function normaliseHuIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  return HU_VAT_RE.test(cleaned) ? cleaned : null;
}

registerCapability("hungarian-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' is required. Provide a Hungarian VAT (HU + 8 digits, e.g. HU10537914). Cégjegyzékszám is not accepted by the upstream API.",
    );
  }
  const normalised = normaliseHuIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Hungarian VAT. Expected format: HU + 8 digits (e.g. HU10537914).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "HU",
      identifierRegex: HU_VAT_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "hungarian-company-data",
    },
    normalised,
  );
});

export { HU_VAT_RE };
