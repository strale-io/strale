import { registerCapability, type CapabilityInput } from "./index.js";

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

/**
 * Parse a VAT number into country code + number.
 * Accepts: "SE556703748501", "SE 556703748501", "se556703748501"
 */
function parseVatNumber(raw: string): { countryCode: string; number: string } | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  const match = cleaned.match(/^([A-Z]{2})(\d{5,15})$/);
  if (!match) return null;
  return { countryCode: match[1], number: match[2] };
}

/**
 * Build the SOAP XML envelope for VIES checkVat.
 */
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

/**
 * Extract a value between XML tags. Simple and sufficient for the flat VIES response.
 */
function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

registerCapability("vat-validate", async (input: CapabilityInput) => {
  const rawVat = input.vat_number ?? input.vat;
  if (typeof rawVat !== "string" || !rawVat) {
    throw new Error("'vat_number' is required. Provide an EU VAT number including country prefix (e.g. SE556703748501).");
  }

  // Try to extract a VAT number from the input (may be embedded in natural language)
  let parsed = parseVatNumber(rawVat);
  if (!parsed) {
    // Try to find a VAT-like pattern in the string
    const vatPattern = rawVat.match(/[A-Za-z]{2}\s*\d{5,15}/);
    if (vatPattern) {
      parsed = parseVatNumber(vatPattern[0]);
    }
  }

  if (!parsed) {
    throw new Error(
      `Could not parse a valid EU VAT number from: "${rawVat}". Expected format: country code + digits (e.g. SE556703748501, DE123456789).`,
    );
  }

  const soapBody = buildSoapRequest(parsed.countryCode, parsed.number);

  // VIES is unreliable — retry once on transient errors (MS_MAX_CONCURRENT_REQ, timeouts)
  let xml = "";
  for (let attempt = 0; attempt < 2; attempt++) {
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
        throw new Error(`VIES error: ${faultString}`);
      }
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      throw new Error(`VIES API returned HTTP ${response.status}`);
    }

    xml = await response.text();

    // Check for SOAP fault in 200 response (e.g. MS_MAX_CONCURRENT_REQ)
    const faultString = extractTag(xml, "faultstring");
    if (faultString) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      throw new Error(`VIES error: ${faultString}`);
    }

    break; // success
  }

  const valid = extractTag(xml, "valid") === "true";
  const name = extractTag(xml, "name") || "";
  const address = extractTag(xml, "address") || "";
  const requestDate = extractTag(xml, "requestDate") || "";

  return {
    output: {
      valid,
      country_code: parsed.countryCode,
      vat_number: `${parsed.countryCode}${parsed.number}`,
      company_name: name === "---" ? "" : name,
      company_address: address === "---" ? "" : address,
      request_date: requestDate,
    },
    provenance: {
      source: "ec.europa.eu/taxation_customs/vies",
      fetched_at: new Date().toISOString(),
    },
  };
});
