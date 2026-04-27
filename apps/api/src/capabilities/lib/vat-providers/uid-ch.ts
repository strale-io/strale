/**
 * Swiss UID Register provider — Swiss + Liechtenstein VAT validation.
 *
 * Free public services tier of the Federal Statistical Office's UID web
 * service. SOAP/XML at uid-wse.admin.ch. The public tier is rate-limited to
 * **20 requests per minute** with no upgrade path — the substrate-level
 * cache + stale-fallback in the vat-validate router is what makes this safe
 * at scale.
 *
 * Swiss VAT format: CHE + 9 digits + suffix (MWST | TVA | IVA).
 * Liechtenstein piggybacks on the Swiss UID system.
 */

import type { ParsedVat, VatProvider, VatProviderResult } from "./types.js";

const UID_URL = "https://www.uid-wse.admin.ch/V3.0/PublicServices.svc";

function buildValidateVatRequest(uidPart: string): string {
  // ValidateVatNumber accepts the UID portion (9 digits, "CHE" prefix
  // optional). We pass the full canonical form CHE-XXX.XXX.XXX which the
  // service accepts on either input.
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/" xmlns:uid="http://www.uid.admin.ch/xmlns/uid-wse">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:ValidateVatNumber>
      <tem:vatNumber>${uidPart}</tem:vatNumber>
    </tem:ValidateVatNumber>
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

async function callUidCh(parsed: ParsedVat): Promise<VatProviderResult> {
  // Swiss/Liechtenstein VAT numbers parse with a "CHE" prefix that the parser
  // leaves in `.number` as the 9 digits after CHE. Reconstruct the canonical
  // dotted form for the SOAP call.
  const digits = parsed.number.replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) {
    throw new Error(
      `Swiss UID expects 9 digits after the CHE prefix — got "${parsed.number}".`,
    );
  }

  const uidPart = `CHE-${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}`;

  const response = await fetch(UID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/IPublicServicesV3/ValidateVatNumber",
    },
    body: buildValidateVatRequest(uidPart),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const fault = extractTag(text, "faultstring") ?? `HTTP ${response.status}`;
    throw new Error(`Swiss UID register returned an error: ${fault}.`);
  }

  const xml = await response.text();

  // ValidateVatNumberResponse > ValidateVatNumberResult is a boolean.
  const result = extractTag(xml, "ValidateVatNumberResult");
  const valid = result?.toLowerCase() === "true";

  // The public ValidateVatNumber endpoint only returns a boolean. To get the
  // company name + address we'd need the GetByUID call, which on the public
  // tier counts as a separate request against the 20/min limit. Skip enrichment
  // here — vat-validate's router is responsible for cross-source enrichment.
  return {
    valid,
    country_code: parsed.countryCode,
    vat_number: parsed.full,
    company_name: "",
    company_address: "",
    request_date: new Date().toISOString(),
  };
}

export const uidChProvider: VatProvider = {
  name: "uid-ch",
  source: "uid-wse.admin.ch (Swiss Federal Statistical Office)",
  prefixes: ["CH", "LI", "CHE"],
  validate: callUidCh,
};
