import { registerCapability, type CapabilityInput } from "./index.js";

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
 * Source: data.brreg.no, NLOD 2.0, free, no auth.
 */

const BRREG_API = "https://data.brreg.no/enhetsregisteret/api";
const ORG_NUMBER_RE = /^\d{9}$/;

function normalizeOrgNumber(input: string): string {
  return input.replace(/[\s.-]/g, "").trim();
}

async function searchByName(name: string): Promise<string> {
  const res = await fetch(
    `${BRREG_API}/enheter?navn=${encodeURIComponent(name)}&size=1`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) {
    throw new Error(`Brønnøysundregistrene search returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as any;
  const entities = data?._embedded?.enheter;
  if (!entities || entities.length === 0) {
    throw new Error(`No Norwegian company found matching "${name}".`);
  }
  return String(entities[0].organisasjonsnummer);
}

registerCapability("no-bankruptcy-check", async (input: CapabilityInput) => {
  const orgInput = ((input.org_number as string) ?? "").trim();
  const companyName = ((input.company_name as string) ?? "").trim();

  if (!orgInput && !companyName) {
    throw new Error("'org_number' or 'company_name' is required. Provide a 9-digit Norwegian org number or a company name.");
  }

  let orgNumber: string;
  if (orgInput) {
    orgNumber = normalizeOrgNumber(orgInput);
    if (!ORG_NUMBER_RE.test(orgNumber)) {
      throw new Error(`Invalid org_number: "${orgInput}". Norwegian org numbers must be exactly 9 digits.`);
    }
  } else {
    orgNumber = await searchByName(companyName);
  }

  const res = await fetch(`${BRREG_API}/enheter/${orgNumber}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 404) {
    throw new Error(`Norwegian company with org number ${orgNumber} not found.`);
  }
  if (!res.ok) {
    throw new Error(`Brønnøysundregistrene returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as any;

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
    provenance: {
      source: "data.brreg.no",
      source_url: `${BRREG_API}/enheter/${orgNumber}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${BRREG_API}/enheter/${orgNumber}`,
      license: "NLOD 2.0",
      license_url: "https://data.norge.no/nlod/no/2.0",
      attribution: "Kilde: Brønnøysundregistrene",
    },
  };
});
