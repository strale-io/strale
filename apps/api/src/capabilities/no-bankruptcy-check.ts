import { registerCapability, type CapabilityInput } from "./index.js";
import {
  BRREG_ORG_NUMBER_RE,
  brregProvenance,
  fetchBrregEntity,
  normalizeOrgNumber,
  searchBrregByName,
} from "../lib/brreg-fetch.js";

/**
 * Norwegian bankruptcy / dissolution status check via Brønnøysundregistrene
 * Enhetsregisteret. Surfaces the structured bankruptcy fields that the
 * registry exposes per entity:
 *
 *   konkurs                                  → has_bankruptcy_filing
 *   konkursdato                              → bankruptcy_date
 *   underAvvikling                           → is_under_dissolution
 *   underTvangsavviklingEllerTvangsopplosning → is_under_compulsory_dissolution
 *   paategninger                             → registry_annotations
 *
 * The companion `norwegian-company-data` capability returns the broader
 * registry record but exposes bankruptcy as a coarse `status` enum only.
 * This capability is the dedicated litigation/bankruptcy leg for Payee
 * Assurance — the boolean signals plus the bankruptcy filing date are
 * what risk-decisioning code needs.
 *
 * Shares the upstream Brreg fetch with norwegian-company-data via
 * lib/brreg-fetch.ts.
 */

registerCapability("no-bankruptcy-check", async (input: CapabilityInput) => {
  const orgInput = ((input.org_number as string) ?? "").trim();
  const companyName = ((input.company_name as string) ?? "").trim();

  if (!orgInput && !companyName) {
    throw new Error("'org_number' or 'company_name' is required. Provide a 9-digit Norwegian org number or a company name.");
  }

  let orgNumber: string;
  if (orgInput) {
    orgNumber = normalizeOrgNumber(orgInput);
    if (!BRREG_ORG_NUMBER_RE.test(orgNumber)) {
      throw new Error(`Invalid org_number: "${orgInput}". Norwegian org numbers must be exactly 9 digits.`);
    }
  } else {
    orgNumber = await searchBrregByName(companyName);
  }

  const data = await fetchBrregEntity(orgNumber);

  const hasBankruptcy = Boolean(data.konkurs);
  const isUnderDissolution = Boolean(data.underAvvikling);
  const isUnderCompulsoryDissolution = Boolean(data.underTvangsavviklingEllerTvangsopplosning);
  const annotations = Array.isArray(data.paategninger) ? data.paategninger : [];

  return {
    output: {
      org_number: orgNumber,
      company_name: data.navn ?? null,
      has_bankruptcy_filing: hasBankruptcy,
      bankruptcy_date: data.konkursdato ?? null,
      is_under_dissolution: isUnderDissolution,
      is_under_compulsory_dissolution: isUnderCompulsoryDissolution,
      has_any_distress_signal:
        hasBankruptcy || isUnderDissolution || isUnderCompulsoryDissolution,
      registry_annotations: annotations,
      data_source: "Brønnøysundregistrene Enhetsregisteret",
    },
    provenance: brregProvenance(orgNumber),
  };
});
