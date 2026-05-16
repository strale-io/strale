// Bulgaria — Openapi.com WW-Top (Tier-3 vendor aggregator).
//
// Phase 2a of the Openapi resolver replication (PR #121 was Phase 1 AT
// template). Strale's reactivation trigger for BG was "licensed
// aggregator" — Openapi.com is that aggregator. Resale addendum
// (Openapi case 151296) pending Moonlighter AB VAT confirmation +
// countersignature; double-gated until both land (OPENAPI_ENABLED env
// flag + DB is_active row).
//
// Identifier shape: BG UIC/EIK (Единен идентификационен код) is 9 bare
// digits. Openapi WW-Top accepts the bare form; the BG-prefix VAT
// (BGNNNNNNNNN) maps to the same upstream record but the canonical
// input is bare digits. Capability normalizes by stripping BG prefix.
//
// Field coverage (Matrix row 34867c87-082c-819b-afdb-dafdeca4f369):
// Tier 1 6/7 (no legal_form via WW-Top), Tier 2 4/5 (no directors),
// Tier 3 1/6 (NACE only).

import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";

const BG_INPUT_RE = /^(BG)?\d{9}$/;
const BG_CANONICAL_RE = /^\d{9}$/;

function normaliseBgIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  if (!BG_INPUT_RE.test(cleaned)) return null;
  return cleaned.replace(/^BG/, "");
}

registerCapability("bulgarian-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.eik as string) ??
    (input.uic as string) ??
    (input.identifier as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' is required. Provide a Bulgarian UIC/EIK (9 digits, optionally BG-prefixed; e.g. 831902088 or BG831902088).",
    );
  }
  const normalised = normaliseBgIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Bulgarian UIC/EIK. Expected format: 9 digits, optionally with BG prefix (e.g. 831902088).`,
    );
  }
  return executeOpenapiCapability(
    {
      countryCode: "BG",
      identifierRegex: BG_CANONICAL_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "bulgarian-company-data",
    },
    normalised,
  );
});

export { BG_INPUT_RE, BG_CANONICAL_RE };
