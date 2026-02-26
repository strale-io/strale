import { registerCapability, type CapabilityInput } from "./index.js";

// EORI (Economic Operators Registration and Identification) validation
// Uses the EU EORI validation service SOAP/REST endpoint
const EORI_API = "https://ec.europa.eu/taxation_customs/dds2/eos/validation/services/validation";

// EORI format: 2-letter country code + up to 15 alphanumeric characters
const EORI_RE = /^[A-Z]{2}[A-Z0-9]{1,15}$/;

async function validateEori(eoriNumber: string): Promise<Record<string, unknown>> {
  // The EU EORI validation service has a REST-like endpoint
  const url = `${EORI_API}?eori=${encodeURIComponent(eoriNumber)}`;

  // Try the XML endpoint
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ev="http://eori.ws.eos.dds.s/"><soap:Body>
  <ev:validateEORI><ev:eori>${eoriNumber}</ev:eori></ev:validateEORI>
</soap:Body></soap:Envelope>`;

  try {
    const response = await fetch(
      "https://ec.europa.eu/taxation_customs/dds2/eos/validation/services/validation",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
        },
        body: soapBody,
        signal: AbortSignal.timeout(15000),
      },
    );

    if (response.ok) {
      const xml = await response.text();

      // Parse the SOAP response
      const statusMatch = xml.match(/<status(?:\s[^>]*)?>(\d+)<\/status>/i) ||
        xml.match(/<result(?:\s[^>]*)?>(\d+)<\/result>/i);
      const nameMatch = xml.match(/<name(?:\s[^>]*)?>([^<]*)<\/name>/i) ||
        xml.match(/<traderName(?:\s[^>]*)?>([^<]*)<\/traderName>/i);
      const addressMatch = xml.match(/<address(?:\s[^>]*)?>([^<]*)<\/address>/i) ||
        xml.match(/<traderAddress(?:\s[^>]*)?>([^<]*)<\/traderAddress>/i);
      const streetMatch = xml.match(/<streetAndNumber(?:\s[^>]*)?>([^<]*)<\/streetAndNumber>/i);
      const cityMatch = xml.match(/<city(?:\s[^>]*)?>([^<]*)<\/city>/i);
      const postalMatch = xml.match(/<postalCode(?:\s[^>]*)?>([^<]*)<\/postalCode>/i);
      const countryMatch = xml.match(/<country(?:\s[^>]*)?>([^<]*)<\/country>/i);

      const statusCode = statusMatch?.[1];
      const valid = statusCode === "0" || xml.includes("<statusDescr>Valid") || xml.includes("statusCode>0");

      return {
        valid,
        eori_number: eoriNumber,
        country_code: eoriNumber.slice(0, 2),
        trader_name: nameMatch?.[1]?.trim() || null,
        trader_address: addressMatch?.[1]?.trim() || null,
        street: streetMatch?.[1]?.trim() || null,
        city: cityMatch?.[1]?.trim() || null,
        postal_code: postalMatch?.[1]?.trim() || null,
        country: countryMatch?.[1]?.trim() || null,
      };
    }
  } catch {
    // Fall through to format-only validation
  }

  // If the SOAP service is down, do format validation only
  return {
    valid: null,
    eori_number: eoriNumber,
    country_code: eoriNumber.slice(0, 2),
    trader_name: null,
    trader_address: null,
    note: "EU EORI validation service unavailable — format validation only",
    format_valid: EORI_RE.test(eoriNumber),
  };
}

registerCapability("eori-validate", async (input: CapabilityInput) => {
  const raw = (input.eori as string) ?? (input.eori_number as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'eori' is required. Provide an EORI number (e.g. DE123456789012345).");
  }

  const cleaned = raw.trim().toUpperCase().replace(/[\s.-]/g, "");

  if (!EORI_RE.test(cleaned)) {
    return {
      output: {
        valid: false,
        eori_number: cleaned,
        country_code: cleaned.slice(0, 2),
        error: "Invalid EORI format. Expected: 2-letter country code + up to 15 alphanumeric characters.",
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  const result = await validateEori(cleaned);

  return {
    output: result,
    provenance: {
      source: "ec.europa.eu/taxation_customs",
      fetched_at: new Date().toISOString(),
    },
  };
});
