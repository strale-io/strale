/**
 * Brønnøysundregistrene provider — Norwegian MVA validation.
 *
 * Free, no auth, NLOD open-data license. Returns the entity if it exists in
 * Enhetsregisteret and exposes a `registrertIMvaregisteret` boolean for VAT
 * registration status.
 *
 * Norwegian VAT format: NO + 9 digits + "MVA" (e.g. NO123456789MVA).
 * The 9-digit core IS the organisasjonsnummer used by Brreg.
 */

import type { ParsedVat, VatProvider, VatProviderResult } from "./types.js";

const BRREG_URL = "https://data.brreg.no/enhetsregisteret/api/enheter";

interface BrregEntity {
  organisasjonsnummer: string;
  navn?: string;
  registrertIMvaregisteret?: boolean;
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
    land?: string;
  };
  slettedato?: string;
  konkurs?: boolean;
}

function formatAddress(entity: BrregEntity): string {
  const a = entity.forretningsadresse;
  if (!a) return "";
  const street = (a.adresse ?? []).filter((x) => x).join(", ");
  const cityLine = [a.postnummer, a.poststed].filter((x) => x).join(" ");
  return [street, cityLine, a.land].filter((x) => x).join(", ");
}

async function callBrreg(parsed: ParsedVat): Promise<VatProviderResult> {
  // Norwegian VAT numbers carry an "MVA" suffix that the parser leaves in the
  // .number field as digits only — but if a caller passes the raw form, strip
  // the trailing "MVA" defensively.
  const orgNumber = parsed.number.replace(/MVA$/i, "");

  if (!/^\d{9}$/.test(orgNumber)) {
    throw new Error(
      `Norwegian organisation numbers are 9 digits — got "${orgNumber}".`,
    );
  }

  const response = await fetch(`${BRREG_URL}/${orgNumber}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404 || response.status === 410) {
    // 410 Gone = deleted entity. Treat both as "not found in registry".
    return {
      valid: false,
      country_code: "NO",
      vat_number: `NO${orgNumber}MVA`,
      company_name: "",
      company_address: "",
      request_date: new Date().toISOString(),
    };
  }

  if (!response.ok) {
    throw new Error(
      `Brreg returned HTTP ${response.status}. This is usually a temporary issue — please try again.`,
    );
  }

  const entity = (await response.json()) as BrregEntity;

  // VAT is valid only if the entity is registered in the VAT register AND
  // hasn't been deleted/dissolved.
  const registered = entity.registrertIMvaregisteret === true;
  const dissolved = Boolean(entity.slettedato);
  const valid = registered && !dissolved;

  return {
    valid,
    country_code: "NO",
    vat_number: `NO${orgNumber}MVA`,
    company_name: entity.navn ?? "",
    company_address: formatAddress(entity),
    request_date: new Date().toISOString(),
  };
}

export const brregProvider: VatProvider = {
  name: "brreg",
  source: "data.brreg.no/enhetsregisteret",
  prefixes: ["NO"],
  validate: callBrreg,
};
