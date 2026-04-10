import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatBE } from "../lib/vat-derivation.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Belgium — KBO/BCE (Crossroads Bank for Enterprises)
// Enterprise number: 10 digits, format 0xxx.xxx.xxx
const KBO_RE = /^0?\d{3}\.?\d{3}\.?\d{3}$/;

function findKbo(input: string): string | null {
  const cleaned = input.replace(/[\s]/g, "");
  if (KBO_RE.test(cleaned)) {
    const digits = cleaned.replace(/\./g, "");
    return digits.padStart(10, "0");
  }
  const match = input.match(/0?\d{3}\.?\d{3}\.?\d{3}/);
  if (match && KBO_RE.test(match[0])) {
    return match[0].replace(/\./g, "").padStart(10, "0");
  }
  return null;
}

function formatKbo(number: string): string {
  // Format as 0xxx.xxx.xxx
  const padded = number.padStart(10, "0");
  return `${padded.slice(0, 4)}.${padded.slice(4, 7)}.${padded.slice(7)}`;
}

async function lookupCompany(query: string, isKbo: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isKbo
    ? `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=${query}`
    : `https://kbopub.economie.fgov.be/kbopub/zoeknaamform.html?searchword=${encodeURIComponent(query)}&_oudession=true`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("geen onderneming") || text.includes("Geen resultaten") || text.length < 200) {
    throw new Error(`No Belgian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Belgian", query);
}

registerCapability("belgian-company-data", async (input: CapabilityInput) => {
  const raw = (input.enterprise_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'enterprise_number' or 'company_name' is required. Provide a KBO/BCE number (e.g. 0404.616.494) or company name.");
  }

  const trimmed = raw.trim();
  const kbo = findKbo(trimmed);

  let output: Record<string, unknown>;
  if (kbo) {
    output = await lookupCompany(kbo, true);
  } else {
    const name = await extractCompanyName(trimmed, "Belgian");
    output = await lookupCompany(name, false);
  }

  // Derive VAT from enterprise number (KBO/BCE)
  const regNum = (output.registration_number as string) ?? kbo ?? "";
  const vat = deriveVatBE(regNum);
  if (vat) output.vat_number = vat;

  return {
    output,
    provenance: {
      source: "kbopub.economie.fgov.be",
      fetched_at: new Date().toISOString(),
    },
  };
});
