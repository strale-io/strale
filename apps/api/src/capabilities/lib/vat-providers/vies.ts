/**
 * VIES provider — EU27 VAT validation via the European Commission's
 * checkVatService SOAP endpoint.
 *
 * Free, no auth. Rate limits are not published and are shared globally per
 * member state — bursts can return MS_MAX_CONCURRENT_REQ. We retry once on
 * transient SOAP faults; the substrate-level cache + stale-fallback in the
 * vat-validate router handles the rest.
 */

import type { ParsedVat, VatProvider, VatProviderResult } from "./types.js";

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

const EU27_PREFIXES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
  "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  "XI", // Northern Ireland (post-Brexit protocol — VIES handles XI)
] as const;

/** Convert cryptic VIES SOAP fault strings to human-readable errors. */
function humanizeViesError(faultString: string): string {
  const upper = faultString.toUpperCase();
  if (upper.includes("MS_UNAVAILABLE"))
    return "The EU VAT validation service (VIES) reports that this country's tax authority is temporarily unavailable. This is an upstream issue — please try again later.";
  if (upper.includes("MS_MAX_CONCURRENT_REQ"))
    return "The EU VAT validation service (VIES) is overloaded with requests. Please try again in a few seconds.";
  if (upper.includes("TIMEOUT"))
    return "The EU VAT validation service (VIES) timed out. Please try again.";
  if (upper.includes("SERVER_BUSY"))
    return "The EU VAT validation service (VIES) is busy. Please try again in a few seconds.";
  if (upper.includes("INVALID_INPUT"))
    return "The VAT number format is not valid for this country. Check the country prefix and number format.";
  return `The EU VAT validation service (VIES) returned an error: ${faultString}. This is usually a temporary issue — please try again.`;
}

function buildSoapRequest(countryCode: string, vatNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${countryCode}</urn:countryCode>
      <urn:vatNumber>${vatNumber}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(
    `<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`,
    "i",
  );
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

async function callVies(parsed: ParsedVat): Promise<VatProviderResult> {
  const soapBody = buildSoapRequest(parsed.countryCode, parsed.number);

  let xml = "";
  let viesError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(VIES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
        },
        body: soapBody,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const faultString = extractTag(text, "faultstring");
        if (faultString) {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          viesError = new Error(humanizeViesError(faultString));
          break;
        }
        if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        viesError = new Error(`VIES API returned HTTP ${response.status}`);
        break;
      }

      xml = await response.text();

      const faultString = extractTag(xml, "faultstring");
      if (faultString) {
        if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        viesError = new Error(humanizeViesError(faultString));
        break;
      }

      break;
    } catch (err) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      viesError = err instanceof Error ? err : new Error(String(err));
      break;
    }
  }

  if (viesError || !xml) {
    throw viesError ?? new Error("VIES did not return a response.");
  }

  const valid = extractTag(xml, "valid") === "true";
  const name = extractTag(xml, "name") || "";
  const address = extractTag(xml, "address") || "";
  const requestDate = extractTag(xml, "requestDate") || new Date().toISOString();

  return {
    valid,
    country_code: parsed.countryCode,
    vat_number: parsed.full,
    company_name: name === "---" ? "" : name,
    company_address: address === "---" ? "" : address,
    request_date: requestDate,
  };
}

export const viesProvider: VatProvider = {
  name: "vies",
  source: "ec.europa.eu/taxation_customs/vies",
  prefixes: EU27_PREFIXES,
  validate: callVies,
};
