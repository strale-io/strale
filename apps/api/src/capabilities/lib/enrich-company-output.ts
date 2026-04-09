/**
 * Post-processing enrichment for company data outputs.
 *
 * Adds derived fields (like vat_number) to company data outputs
 * without modifying individual executors. Each executor calls
 * enrichCompanyOutput() before returning.
 */

import { deriveVatNumber } from "./vat-derivation.js";

/**
 * Map from country data capability slugs to their country code and
 * the output field containing the national identifier for VAT derivation.
 */
const COUNTRY_ID_MAP: Record<string, { countryCode: string; idField: string }> = {
  "swedish-company-data": { countryCode: "SE", idField: "org_number" },
  "danish-company-data": { countryCode: "DK", idField: "cvr_number" },
  "finnish-company-data": { countryCode: "FI", idField: "business_id" },
  "french-company-data": { countryCode: "FR", idField: "siren" },
  "belgian-company-data": { countryCode: "BE", idField: "registration_number" },
  "spanish-company-data": { countryCode: "ES", idField: "registration_number" },
  "portuguese-company-data": { countryCode: "PT", idField: "registration_number" },
  "italian-company-data": { countryCode: "IT", idField: "registration_number" },
  // Countries where VAT derivation is NOT possible:
  // german-company-data: HRB ≠ VAT
  // dutch-company-data: KVK ≠ VAT
  // norwegian-company-data: Not in EU
  // irish-company-data: CRO ≠ VAT
  // polish-company-data: KRS ≠ NIP
  // swiss-company-data: Not in EU
  // uk-company-data: Not in EU
  // austrian-company-data: Already has eu_vat_ids
};

/**
 * Enrich a company data output with derived fields.
 *
 * Currently adds vat_number for countries where it can be deterministically
 * derived from the national registration identifier.
 *
 * @param capabilitySlug - The capability that produced the output
 * @param output - The raw output from the capability executor
 * @returns Enriched output with vat_number added (if derivable)
 */
export function enrichCompanyOutput(
  capabilitySlug: string,
  output: Record<string, unknown>,
): Record<string, unknown> {
  const mapping = COUNTRY_ID_MAP[capabilitySlug];
  if (!mapping) return output;

  // Don't overwrite if vat_number is already present
  if (output.vat_number) return output;

  const nationalId = output[mapping.idField];
  if (typeof nationalId !== "string" || !nationalId) return output;

  const vatNumber = deriveVatNumber(mapping.countryCode, nationalId);
  if (vatNumber) {
    return { ...output, vat_number: vatNumber };
  }

  return output;
}
