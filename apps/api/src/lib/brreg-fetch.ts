/**
 * Shared Brønnøysundregistrene Enhetsregisteret fetch helper.
 *
 * Used by both `norwegian-company-data` (registry verification leg) and
 * `no-bankruptcy-check` (litigation/bankruptcy leg). Dedupes the
 * upstream HTTP call shape and the search-by-name fallback.
 *
 * Source: data.brreg.no, NLOD 2.0 license, free, no auth.
 */

export const BRREG_API = "https://data.brreg.no/enhetsregisteret/api";
export const BRREG_ORG_NUMBER_RE = /^\d{9}$/;

export type BrregEntity = Record<string, unknown> & {
  organisasjonsnummer?: string | number;
  navn?: string;
  konkurs?: boolean;
  konkursdato?: string;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  paategninger?: unknown[];
  forretningsadresse?: Record<string, unknown>;
  postadresse?: Record<string, unknown>;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  registreringsdatoEnhetsregisteret?: string;
  antallAnsatte?: number;
};

export function normalizeOrgNumber(input: string): string {
  return input.replace(/[\s.-]/g, "").trim();
}

export function isOrgNumber(input: string): string | null {
  const cleaned = normalizeOrgNumber(input);
  return BRREG_ORG_NUMBER_RE.test(cleaned) ? cleaned : null;
}

export function findOrgNumberInText(input: string): string | null {
  const match = input.match(/\d{9}/);
  if (!match) return null;
  return isOrgNumber(match[0]);
}

/**
 * Resolve a Norwegian company name to an org number via Brreg's
 * name search endpoint. Returns the first hit (Brreg's relevance
 * ordering). Throws on no results.
 */
export async function searchBrregByName(name: string): Promise<string> {
  const url = `${BRREG_API}/enheter?navn=${encodeURIComponent(name)}&size=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Brønnøysundregistrene search returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as { _embedded?: { enheter?: Array<{ organisasjonsnummer?: string | number }> } };
  const entities = data?._embedded?.enheter ?? [];
  const first = entities[0];
  if (!first) {
    throw new Error(`No Norwegian company found matching "${name}".`);
  }
  return String(first.organisasjonsnummer);
}

/**
 * Fetch a Brreg entity record by org number.
 * Throws on 404 (not found) or other non-OK responses.
 */
export async function fetchBrregEntity(orgNumber: string): Promise<BrregEntity> {
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
  return (await res.json()) as BrregEntity;
}

/**
 * Provenance bundle for any Brreg-derived capability response.
 * Centralized so license / attribution stay consistent across capabilities.
 */
export function brregProvenance(orgNumber: string) {
  return {
    source: "data.brreg.no",
    source_url: `${BRREG_API}/enheter/${orgNumber}`,
    fetched_at: new Date().toISOString(),
    acquisition_method: "direct_api" as const,
    primary_source_reference: `${BRREG_API}/enheter/${orgNumber}`,
    license: "NLOD 2.0",
    license_url: "https://data.norge.no/nlod/no/2.0",
    attribution: "Kilde: Brønnøysundregistrene",
  };
}
