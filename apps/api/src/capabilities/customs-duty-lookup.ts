import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

// ─── EU import duty lookup via Access2Markets (European Commission) ─────────
//
// Source: the Commission's Access2Markets "My Trade Assistant" results page.
// Its EU import tariff rows come from DG TAXUD's TARIC database, and the
// Commission licenses its own content under CC BY 4.0 (legal notice,
// commission.europa.eu/legal-notice_en), so a per-call read with attribution
// is in DEC-20261023-A's allowed-with-checks lane.
//
// Not used, and why:
//   - TARIC's own consultation pages (ec.europa.eu/taxation_customs/dds2/taric/)
//     are disallowed for every agent by ec.europa.eu/robots.txt. This executor
//     used to read them first; since the 2026-10-28 fetch hardening that call
//     always refused (weekly-drift robots sweep, issue #747).
//   - Access2Markets' tariff and tax rows for NON-EU destinations come from
//     Mendel Verlag under terms that forbid resale. This executor only ever
//     asks about imports INTO an EU member state, whose rows are TARIC's.
//
// Access2Markets answers HTTP 400 ("country from and country to are mandatory")
// unless both an origin and a member-state destination are given. It answers
// only at the level where its nomenclature stops splitting: 847130 resolves,
// but 610910 is split into 6109100010 / 6109100090 and gets a picker page
// instead of results. The old fallback sent destination=EU with an optional
// origin, so it got that error page and handed it to the LLM.
//
// VAT is not returned: Access2Markets loads its Taxes tab on click, so the
// rendered page never holds a VAT rate, and its sources page attributes
// member-state taxes to "TARIC SA", not to the Commission.

/** EU member states (ISO 3166-1 alpha-2), the destinations Access2Markets accepts for an EU import. */
export const EU_MEMBER_STATES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/**
 * The customs duty is the EU's common external tariff, identical in every
 * member state. When the caller names no member state we ask for this one.
 */
const DEFAULT_DESTINATION = "DE";

const RESULTS_MARKER = "Results for product code";
const PICKER_MARKER = "a match was identified with an HS code";

/**
 * The longer codes Access2Markets offers when the given code is split further
 * (its picker page), e.g. ["6109100010", "6109100090"]; null when the page is
 * not a picker. The page puts each two-digit group in its own element, so the
 * extracted text reads "61 09 10 00 10". Only 8- and 10-digit codes are
 * offered; the caller's own code, which the picker repeats, is left out.
 */
export function pickerCodes(pageText: string, requestedCode = ""): string[] | null {
  const start = pageText.indexOf(PICKER_MARKER);
  if (start === -1) return null;
  const end = pageText.indexOf("Quick links", start);
  const tree = pageText.slice(start, end === -1 ? undefined : end);
  const codes = (tree.match(/\b\d{2}(?: \d{2}){3,4}\b/g) ?? [])
    .map((c) => c.replace(/ /g, ""))
    .filter((c) => c !== requestedCode);
  return [...new Set(codes)];
}

export function a2mResultsUrl(hsCode: string, origin: string, destination: string): string {
  const q = new URLSearchParams({ product: hsCode, origin, destination });
  return `https://trade.ec.europa.eu/access-to-markets/en/results?${q.toString()}`;
}

/**
 * The results section of the page, or null when the page is not a results
 * page (a 400 error page, or the subheading picker a 4-digit code produces).
 */
export function resultsSection(pageText: string): { text: string; resolvedCode: string | null } | null {
  const start = pageText.indexOf(RESULTS_MARKER);
  if (start === -1) return null;
  const ends = ["Sources and copyright", "Quick links"]
    .map((marker) => pageText.indexOf(marker, start))
    .filter((index) => index !== -1);
  const end = ends.length ? Math.min(...ends) : -1;
  const text = pageText.slice(start, end === -1 ? undefined : end);
  const resolved = text.match(/^Results for product code ([\d.]+)/);
  return { text, resolvedCode: resolved ? resolved[1].replace(/\./g, "") : null };
}

registerCapability("customs-duty-lookup", async (input: CapabilityInput) => {
  const hsCode = ((input.hs_code as string) ?? (input.task as string) ?? "").trim();
  if (!hsCode) {
    throw new Error(
      "'hs_code' is required. Provide an HS code of at least 6 digits (e.g. '8471.30' or '847130') to look up EU import duties.",
    );
  }
  const cleanHsCode = hsCode.replace(/[\s.]/g, "");
  if (!/^\d{6,10}$/.test(cleanHsCode)) {
    throw new Error(
      `Invalid HS code: "${hsCode}". Give 6 to 10 digits (e.g. '8471.30' or '6109100010'); a 4-digit heading is too broad to carry one duty rate.`,
    );
  }

  const originCountry = ((input.origin_country as string) ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(originCountry)) {
    throw new Error(
      "'origin_country' is required: the ISO 3166-1 alpha-2 code of the country the goods come from (e.g. 'CN'). " +
        "The duty and any preferential rate depend on it.",
    );
  }
  if (EU_MEMBER_STATES.has(originCountry)) {
    throw new Error(
      `'origin_country' ${originCountry} is an EU member state. Goods moving between member states pay no customs duty; give the non-EU country of origin.`,
    );
  }

  const requestedDestination = ((input.destination_country as string) ?? "").trim().toUpperCase() || "EU";
  if (requestedDestination !== "EU" && !EU_MEMBER_STATES.has(requestedDestination)) {
    throw new Error(
      `'destination_country' must be an EU member state (ISO alpha-2, e.g. 'SE') or 'EU'; got "${requestedDestination}". This tool covers imports into the EU only.`,
    );
  }
  const destinationDefaulted = requestedDestination === "EU";
  const queryDestination = destinationDefaulted ? DEFAULT_DESTINATION : requestedDestination;

  const sourceUrl = a2mResultsUrl(cleanHsCode, originCountry, queryDestination);
  // The plain 200 response is a navigation shell: tariff rows and product
  // choices load through JavaScript. Its menu text passes the shared plain
  // fetch heuristic, so require a render (with the normal access checks).
  const html = await fetchRenderedHtml(sourceUrl, { source: "strale", skipFallback: true });
  const pageText = htmlToText(html);
  const section = resultsSection(pageText);
  if (!section) {
    const offered = pickerCodes(pageText, cleanHsCode);
    if (offered && offered.length > 0) {
      throw new Error(
        `HS code "${hsCode}" is split further in the EU tariff, so it has no single duty. ` +
          `Call again with one of these codes: ${offered.slice(0, 25).join(", ")}.`,
      );
    }
    if (offered !== null) {
      throw new Error(
        `HS code "${hsCode}" is split further in the EU tariff, but the more specific codes did not load. ` +
          "Select the full product code in Access2Markets and call again with that code.",
      );
    }
    throw new Error(
      `Access2Markets returned no tariff results for HS code "${hsCode}" from ${originCountry}. Check the code against the EU tariff (6, 8 or 10 digits).`,
    );
  }
  // A heading plus a long footer is not tariff data. In particular, do not
  // ask the model to invent a rate from the shell if rendering is incomplete.
  if (section.text.length < 200 || !/\bThird country duty\b/i.test(section.text)) {
    throw new Error("Access2Markets did not load tariff data for this product. Try again later or check the product on Access2Markets.");
  }
  if (!section.resolvedCode || !/^\d{6,10}$/.test(section.resolvedCode)) {
    throw new Error("Access2Markets could not confirm the product code for these tariff results. Check the full product code on Access2Markets and try again.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });
  const extracted = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Extract the EU import duty for HS code "${cleanHsCode}" from ${originCountry} from this Access2Markets results text. Use only what the text states.

Return ONLY valid JSON:
{
  "description": "product description from the page, or null",
  "duty_rate": "the third-country (ERGA OMNES) duty as written, e.g. '0%' or '3.2%' or '12.8 EUR/100 kg', or null",
  "duty_type": "ad_valorem or specific or mixed, or null",
  "preferential_rates": [{"agreement": "agreement or preference name", "rate": "rate as written"}],
  "anti_dumping": true or false (true only if an anti-dumping or countervailing measure is listed for this origin),
  "additional_duties": [{"measure": "measure type as written", "rate": "rate as written"}],
  "notes": "conditions, footnotes or legal references worth knowing, or null"
}

Results text:
${section.text.slice(0, 12000)}`,
    truncationGuidance: "This HS code's results listed more measures than fit in one call.",
    parseFailureError: () => new Error("Failed to extract customs duty data from the Access2Markets results."),
  });

  if (typeof extracted.duty_rate !== "string" || !extracted.duty_rate.trim()) {
    throw new Error("Access2Markets extraction did not provide a duty rate. Check the product on Access2Markets; no duty result is available from this call.");
  }

  const output: Record<string, unknown> = {
    ...extracted,
    hs_code: cleanHsCode,
    resolved_hs_code: section.resolvedCode,
    origin_country: originCountry,
    destination: requestedDestination,
    // Never from the model: the page carries no VAT rate (see the header).
    vat_rate: null,
  };

  return {
    output,
    provenance: {
      source: "trade.ec.europa.eu/access-to-markets (TARIC data, DG TAXUD)",
      source_url: sourceUrl,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/legalcode",
      attribution: "© European Union. Source: European Commission, Access2Markets; tariff data from the TARIC database (DG TAXUD).",
      ...(destinationDefaulted ? { queried_member_state: DEFAULT_DESTINATION } : {}),
      fetched_at: new Date().toISOString(),
    },
  };
});
