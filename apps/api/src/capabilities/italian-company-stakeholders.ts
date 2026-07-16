// Italy — Openapi.com IT-Stakeholders (Tier-3 vendor aggregator).
//
// Phase 7a sibling of italian-company-data. Lifts IT to binding-ready
// Tier 2 by surfacing directors / legal representatives that IT-Advanced
// does not expose. Per-call paid (€0.10-0.20 + 22% IT VAT); cost passes
// through to customer via bundle pricing (DEC-20260503-A). Split from
// italian-company-data so T1-only Counterparty Assurance calls don't
// incur the IT-Stakeholders charge — pattern matches
// uk-companies-house-officers (separate from uk-company-data) and
// gleif-l2-ubo-lookup (separate from lei-lookup).
//
// Identifier shape: 11-digit Italian codice fiscale / P.IVA — same as
// italian-company-data. IT-prefix VAT also accepted and stripped.
//
// Output: legal_representatives[] in Strale canonical shape (see
// StraleLegalRepresentative in openapi-resolver.ts). Filters out
// shareholder-only role codes (SOU); preserves all director-like roles
// (AUN, PP, AD, PCDA, LIQ, etc.) with vendor-asserted
// is_legal_representative flag for the consumer.

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const IT_CF_RE = /^\d{11}$/;

function normaliseItIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  const stripped = cleaned.startsWith("IT") ? cleaned.slice(2) : cleaned;
  return IT_CF_RE.test(stripped) ? stripped : null;
}

registerCapability("italian-company-stakeholders", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.codice_fiscale as string) ??
    (input.partita_iva as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' or 'codice_fiscale' is required. Provide an Italian codice fiscale / P.IVA (11 digits, e.g. 00484960588). IT-prefix VAT format is also accepted (e.g. IT00484960588).",
    );
  }
  const normalised = normaliseItIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Italian codice fiscale / P.IVA. Expected format: 11 digits (e.g. 00484960588).`,
    );
  }
  const __etResult = await executeOpenapiCapability(
    {
      countryCode: "IT",
      identifierRegex: IT_CF_RE,
      openapiProduct: "it-stakeholders",
      capabilitySlug: "italian-company-stakeholders",
    },
    normalised,
  );
  return {
    ...__etResult,
    output: {
      ...__etResult.output,
      // Evidence Tier framework labels (DEC-20260518-A) —
      // tier_2_available: true because legal_representatives[] is the T2
      // binding-readiness payload this capability exists to deliver.
      tier_2_available: true,
      tier_2_available_reason:
        "Legal representatives extracted from Italian business register via Openapi IT-Stakeholders product.",
    },
  };
});

export { IT_CF_RE };
