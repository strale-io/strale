import { registerCapability, type CapabilityInput } from "./index.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

// EORI (Economic Operators Registration and Identification) validation
// Uses the EU EORI validation service SOAP/REST endpoint
const EORI_API = "https://ec.europa.eu/taxation_customs/dds2/eos/validation/services/validation";

// EORI format: 2-letter country code + up to 15 alphanumeric characters
const EORI_RE = /^[A-Z]{2}[A-Z0-9]{1,15}$/;

const EORI_SERVICE = "EU EORI validation service";

/**
 * Validate against the EU EORI service, or throw.
 *
 * The service answers `<status>0</status>` for a valid number and a non-zero
 * status (1, "Not valid") for one it does not hold; both are answers. Anything
 * else is no answer and throws `UpstreamUnavailableError`, which is unbilled:
 * a down service used to return `valid: null` with a format check, and a reply
 * this parser could not read used to return `valid: false`, both billed
 * (2026-11-06 swallowed-failures audit, row 19).
 */
async function validateEori(eoriNumber: string): Promise<Record<string, unknown>> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ev="http://eori.ws.eos.dds.s/"><soap:Body>
  <ev:validateEORI><ev:eori>${eoriNumber}</ev:eori></ev:validateEORI>
</soap:Body></soap:Envelope>`;

  let response: Response;
  let xml: string;
  try {
    response = await fetch(EORI_API, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      body: soapBody,
      signal: AbortSignal.timeout(15000),
    });
    xml = response.ok ? await response.text() : "";
  } catch (err) {
    throw transportFailure(err);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw httpFailure(response.status);
  }

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
  const validMarker = xml.includes("<statusDescr>Valid") || xml.includes("statusCode>0");
  // No status code and no valid marker: the reply carries no verdict (a SOAP
  // fault served with 200, a maintenance page, a changed schema).
  if (statusCode === undefined && !validMarker) {
    throw new UpstreamUnavailableError(EORI_SERVICE, "the reply carried no validation status.", { code: "unparseable" });
  }
  // The numeric status is the service's verdict (0 valid, anything else not);
  // the text markers decide only a reply that carries no numeric status. For
  // the service's real replies the two agree (0 with "Valid", 1 with "Not valid").
  const valid = statusCode !== undefined ? statusCode === "0" : validMarker;

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

/**
 * An HTTP status that is no answer. 429 and 5xx (a SOAP fault included) are
 * the service being unavailable, worth a retry; 404 or 410 means the endpoint
 * is gone. Any other status is a rejection of our request, a plain error.
 */
function httpFailure(status: number): Error {
  if (status === 429 || status >= 500) {
    return new UpstreamUnavailableError(EORI_SERVICE, `HTTP ${status}; retry shortly.`, { code: `HTTP ${status}` });
  }
  if (status === 404 || status === 410) {
    return new UpstreamUnavailableError(EORI_SERVICE, `HTTP ${status}; the endpoint is gone.`, { code: `HTTP ${status}`, retryable: false });
  }
  return new Error(`${EORI_SERVICE} returned HTTP ${status}`);
}

/**
 * A request that produced no HTTP answer: a timeout or a network error.
 * Anything else (our own code breaking) is returned unchanged.
 */
function transportFailure(err: unknown): Error {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new UpstreamUnavailableError(EORI_SERVICE, "timeout; retry shortly.", { code: "timeout", cause: err });
  }
  if (err instanceof TypeError && (err.message === "fetch failed" || err.message === "terminated")) {
    const cause = (err as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === "string" ? cause.code : null;
    return new UpstreamUnavailableError(EORI_SERVICE, `network error${code ? ` (${code})` : ""}; retry shortly.`, { code, cause: err });
  }
  return err instanceof Error ? err : new Error(String(err));
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
