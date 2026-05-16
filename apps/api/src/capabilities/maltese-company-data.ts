// Malta — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a Openapi resolver replication. PARTIAL coverage: GO P.L.C.
// (MT12826209) confirmed 200 via WW-Top by both 2026-05-11 + v4 probes,
// but Bank of Valletta and HSBC Malta returned 204 in v3 probes.
// Openapi catalog is thin for MT relative to other countries — some
// entities present, others not.
//
// Identifier shape: STRICT MT + 8 digits regex (single accepted format).
// MFSA C-prefix company numbers (e.g. C 2833) rejected with 406. No
// MT-* country-specific Openapi product exists (scope rejected).
//
// Field coverage (Matrix row 34867c87-082c-81b4-8d8a-ddc827ad6f96):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const MT_VAT_RE = /^MT\d{8}$/;

function normaliseMtIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  return MT_VAT_RE.test(cleaned) ? cleaned : null;
}

registerCapability("maltese-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' is required. Provide a Maltese VAT (MT + 8 digits, e.g. MT12826209). MFSA C-prefix company numbers are not accepted by the upstream API.",
    );
  }
  const normalised = normaliseMtIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Maltese VAT. Expected format: MT + 8 digits (e.g. MT12826209).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "MT",
      identifierRegex: MT_VAT_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "maltese-company-data",
    },
    normalised,
  );
});

export { MT_VAT_RE };
