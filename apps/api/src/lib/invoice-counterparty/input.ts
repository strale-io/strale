import { COUNTRIES, resolveCountryAlpha2 } from "../../capabilities/lib/iso-3166.js";
import { validVat } from "../../capabilities/lib/entity-identifier.js";
import { TAX_FORMATS } from "../tax-id-formats.js";
import { getRoute } from "../company-status/routing.js";

export class InvoiceCheckError extends Error {
  constructor(public error_code: "invalid_request" | "execution_failed", message: string,
    public details: Record<string, unknown> = {}) {
    super(message);
    this.name = "InvoiceCheckError";
  }
}

export function parseInvoiceInput(input: Record<string, unknown>) {
  const invalid = (field: string, message: string): never => {
    throw new InvoiceCheckError("invalid_request", `'${field}' must be ${message}.`, { field });
  };
  const text = (key: string, max: number): string | undefined => {
    if (input[key] === undefined) return undefined;
    const v = input[key];
    if (typeof v !== "string" || v.trim().length < 2 || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v)) {
      return invalid(key, `a non-empty string of 2–${max} characters without control characters`);
    }
    return v.trim();
  };
  const raw = text("tax_id", 64) ?? invalid("tax_id", "supplied as a string");
  const suppliedCountry = text("country", 2)?.toUpperCase();
  if (suppliedCountry && (!/^[A-Z]{2}$/.test(suppliedCountry) || resolveCountryAlpha2(suppliedCountry) !== suppliedCountry)) {
    invalid("country", "an ISO 3166-1 alpha-2 code");
  }
  const taxId = raw.toUpperCase().replace(/\s/g, "");
  const prefix = taxId.startsWith("CHE") ? "CH" : taxId.startsWith("EL") ? "GR" : taxId.slice(0, 2);
  // Only recognise an actual tax prefix. A Mexican RFC or Indian GSTIN can
  // start with letters/digits that are not a country prefix.
  const suppliedNationalFormat = suppliedCountry && TAX_FORMATS[suppliedCountry]?.pattern.test(taxId)
    && !taxId.startsWith(suppliedCountry);
  const prefixCountry = !suppliedNationalFormat && TAX_FORMATS[prefix]
    && (TAX_FORMATS[prefix].pattern.test(taxId) || taxId.startsWith("CHE") || /^[A-Z]{2}\d/.test(taxId) || /^ATU/.test(taxId)) ? prefix : undefined;
  const country = suppliedCountry ?? prefixCountry ?? invalid("country", "supplied when tax_id has no country prefix");
  if (suppliedCountry && prefixCountry && suppliedCountry !== prefixCountry) invalid("country", "consistent with the tax_id prefix");
  const format = TAX_FORMATS[country];
  if (!format) invalid("country", "supported by tax-id-validate");
  const national = country === "FI" ? taxId.replace(/-/g, "") : taxId;
  const isEu = COUNTRIES.some(c => c.alpha_2 === country && c.eu_member);
  const full = format.pattern.test(taxId) && (!isEu || prefixCountry) ? taxId : `${country === "GR" ? "EL" : country}${national}`;
  if (!format.pattern.test(full)) invalid("tax_id", `in the ${country} format accepted by tax-id-validate`);
  const euVat = validVat(full) && !full.startsWith("XI");
  if (isEu && !euVat) invalid("tax_id", "a correctly formatted EU VAT number");
  // Reject malformed EU VAT before making any lookup. National non-EU IDs
  // go to the format-only executor, even where vat-validate has other providers.
  const companyName = text("company_name", 300);
  if (companyName && !/[\p{L}\p{N}]/u.test(companyName)) invalid("company_name", "a company name containing letters or digits");
  const companyId = text("company_id", 100);
  const route = getRoute(country);
  let registryId: string | undefined;
  if (companyId) {
    if (!/^[\p{L}\p{N} ./()-]+$/u.test(companyId)) invalid("company_id", "a registry identifier");
    registryId = route?.normalise_identifier(companyId) ?? undefined;
    if (route && !registryId) invalid("company_id", route.identifier_help);
  }
  return { taxId: full, country, euVat, companyName, companyId, registryId };
}

/** Identifier conversion only; this never asserts registration or VAT validity. */
export function registryIdFromTaxId(taxId: string): string | undefined {
  // Skatteverket: SE + 10 organisation digits + 01. Exclude personnummer.
  // https://www.skatteverket.se/foretag/moms/kopavarorochtjanster/inkopfranandraeulander/kopatjansterfranandraeulander
  if (/^SE\d{2}[2-9]\d{7}01$/.test(taxId)) return `${taxId.slice(2, 8)}-${taxId.slice(8, 12)}`;
  // Vero: FI + Business ID without its hyphen.
  // https://www.vero.fi/en/detailed-guidance/guidance/48090/vat-invoice-requirements/
  if (/^FI\d{8}$/.test(taxId)) return `${taxId.slice(2, 9)}-${taxId.slice(9)}`;
  // Altinn: organisation number followed by MVA; NO is the country prefix.
  // https://info.altinn.no/en/start-and-run-business/direct-and-indirect-taxes/indirect-taxes/value-added-tax/
  if (/^NO\d{9}MVA$/.test(taxId)) return taxId.slice(2, 11);
  // FPS Economy: enterprise number activated as VAT number. BE remains outside
  // company-status-check coverage; exposing this mapping does not enable it.
  // https://economie.fgov.be/en/themes/enterprises/starting-business/steps-starting-business/vat-identification
  if (/^BE[01]\d{9}$/.test(taxId)) return taxId.slice(2);
  // DK is deliberately absent: VAT can be an SE administrative-unit number,
  // not CVR. https://www.dst.dk/da/Statistik/dokumentation/Times/moduldata-for-arbejdsmarked/senr
  // NL BTW is not KVK. entity-resolve's VAT route uses a name search, so is
  // deliberately NOT called: https://www.kvk.nl/en/starting/everything-you-need-to-know-about-the-vat-identification-number/
  return undefined;
}
