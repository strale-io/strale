/**
 * Shared interface for VAT-validation providers.
 *
 * Each provider handles one or more country prefixes. The router in
 * `capabilities/vat-validate.ts` parses the input, dispatches to the right
 * provider, and wraps the call with the substrate-level cache + stale-fallback
 * + (future) rate-limit machinery.
 *
 * Adding a new country = add one provider module + one router branch.
 */

export interface ParsedVat {
  /** Country prefix as it appears on the VAT number (e.g. "SE", "GB", "EL"). */
  countryCode: string;
  /** Digits-only national number portion. */
  number: string;
  /** Full normalised VAT (countryCode + number, no spaces/dashes). */
  full: string;
}

export interface VatProviderResult {
  valid: boolean;
  /** Country the answer was looked up against. May differ from input prefix
   *  for edge cases (e.g. EL → GR for Greece). */
  country_code: string;
  vat_number: string;
  company_name: string;
  company_address: string;
  /** ISO timestamp from the upstream service if it exposes one, else our
   *  fetch time. */
  request_date: string;
  /**
   * Optional upstream-issued reference (e.g. HMRC's consultation reference
   * number). When present, gets surfaced in the audit artifact — this is one
   * of the strongest forms of provenance an agent can show a regulator.
   */
  source_reference?: string;
}

export interface VatProvider {
  /** Stable name used in provenance + telemetry. */
  name: string;
  /** Authority the data ultimately comes from — used in provenance.source. */
  source: string;
  /** Country prefixes this provider can answer for. */
  prefixes: readonly string[];
  validate(parsed: ParsedVat): Promise<VatProviderResult>;
}
