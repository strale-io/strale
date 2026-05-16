// Austria — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Replaces the prior FinAPU + WKO Browserless scraping path (deactivated
// 2026-04-29 per DEC-20260427-I-6 as a Tier-1 violation). Reactivation
// trigger named in that DEC: "licensed contract with the Austrian
// Justizministerium for direct Firmenbuch API access, or a multi-country
// licensed aggregator." Openapi.com is the multi-country licensed
// aggregator path; resale addendum issued 2026-05-08 via case 151296,
// gated on Moonlighter AB VAT + countersignature. Execution is double-
// gated: this executor will refuse to run unless OPENAPI_ENABLED=true
// AND the capability row in the DB is active.
//
// Identifier shape: AT VAT (UID-Nummer) in the form `ATU` + 8 digits.
// Openapi WW-Top rejects Firmenbuchnummer (FN) format with 406 — VAT only.
// Verified empirically by the 2026-05-15 v4 probe: OMV ATU14189108 → 200,
// FN 93363z → 406.
//
// Field coverage per the 2026-05-15 BR Coverage Matrix row
// (34867c87-082c-8165-9fcd-d01bc75c9766): Tier 1 6/7 (no legal_form via
// WW-Top), Tier 2 3/5 (vatCode + source-as-of + source-name; no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const AT_VAT_RE = /^ATU\d{8}$/;

function normaliseAtIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  return AT_VAT_RE.test(cleaned) ? cleaned : null;
}

registerCapability("austrian-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.uid as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' is required. Provide an Austrian UID-Nummer (e.g. ATU14189108). Firmenbuchnummer (FN) is not accepted by the upstream API; use the VAT format.",
    );
  }
  const normalised = normaliseAtIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Austrian UID-Nummer. Expected format: ATU + 8 digits (e.g. ATU14189108).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "AT",
      identifierRegex: AT_VAT_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "austrian-company-data",
    },
    normalised,
  );
});

export { AT_VAT_RE };
