// Italy — Openapi.com IT-Advanced (Tier-3 vendor aggregator; richest
// Openapi product Strale ships in v1).
//
// Phase 2c Openapi resolver replication — the final EU30 country to
// reach code-side parity. REPLACES the prior registroimprese.it
// Browserless scraping path (Tier 1 violation per DEC-20260428-A,
// deactivated 2026-04-28). Openapi is the licensed multi-country
// aggregator path per DEC-20260507-C.
//
// Identifier shape: Italian codice fiscale for legal entities — 11
// digits (same as P.IVA / VAT number for IT companies). Openapi
// IT-Advanced accepts bare 11-digit; the capability also accepts
// IT-prefix VAT (IT00484960588) and strips the prefix.
//
// Field coverage (Matrix row 34867c87-082c-81c8-b080-ff1c566bfa73):
// Tier 1 7/7 (legal_form CLOSED via detailedLegalForm — UNIQUE to IT
// among Openapi-routed countries),
// Tier 2 4/5 (vat + source-as-of + source-name + authoritative-flag;
// legal_representatives null_via_vendor_limitation — IT-Full deferred),
// Tier 3 4/6 (shareholders + nace + share_capital + last_filing_date;
// ubos + establishments null_via_vendor_limitation).
//
// shareHolders[] field structurally always present per Openapi but
// EMPTY for widely-held entities (≥10% threshold). Per output_field_
// reliability: shareholders is "common" not "guaranteed" — Eni is
// widely-held and returns empty array; closely-held entities populate.
// Shape contract (Strale canonical, set by this PR): see
// `StraleShareHolder` in openapi-resolver.ts.
//
// v1.1+ deferrals:
//   - IT-Full product (€0.45+, 12s latency, async): adds managers[]
//     (T2 directors), subsidiaries[], affiliateCompanies[]. Breaks v1
//     sync contract.
//   - UBO-Italy product: not yet probed. Would close T3 ubos field.
//   - Strale-side direct InfoCamere integration: separate workstream.

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

// Italian codice fiscale for legal entities: bare 11-digit. P.IVA shares
// the format; both reach the same Openapi catalog record.
const IT_CF_RE = /^\d{11}$/;

function normaliseItIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  // Strip IT-prefix VAT shape (IT00484960588 → 00484960588).
  const stripped = cleaned.startsWith("IT") ? cleaned.slice(2) : cleaned;
  return IT_CF_RE.test(stripped) ? stripped : null;
}

registerCapability("italian-company-data", async (input: CapabilityInput) => {
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
      openapiProduct: "it-advanced",
      capabilitySlug: "italian-company-data",
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
      tier_2_available_reason: "IT-Advanced does not expose directors; legal representatives available via sibling capability italian-company-stakeholders (Openapi IT-Stakeholders product, paid per call).",
      ubo_availability: "restricted",
      ubo_availability_reason: "RIT (Registro dei Titolari Effettivi) access restricted; UBO-Italy product deferred to v1.1 per DEC-20260507-C",
    },
  };
});

export { IT_CF_RE };
