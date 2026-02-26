import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Germany — Handelsregister / North Data
// HRB/HRA format: HRB 123456 (varies by court)
const HRB_RE = /^(HRA|HRB|GnR|PR|VR)\s?\d+\s?[A-Z]?$/i;

function findHrb(input: string): string | null {
  const match = input.match(/(HRA|HRB|GnR|PR|VR)\s?\d+\s?[A-Z]?/i);
  return match ? match[0].trim() : null;
}

async function lookupCompany(query: string, isHrb: boolean): Promise<Record<string, unknown>> {
  // Use the Unternehmensregister (official) or North Data for search
  const searchUrl = isHrb
    ? `https://www.northdata.com/search?q=${encodeURIComponent(query)}`
    : `https://www.northdata.com/search?q=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("Keine Ergebnisse") || text.includes("No results")) {
    throw new Error(`No German company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "German", query);
}

registerCapability("german-company-data", async (input: CapabilityInput) => {
  const raw = (input.hrb_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'hrb_number' or 'company_name' is required. Provide a Handelsregister number (e.g. HRB 86891) or company name.");
  }

  const trimmed = raw.trim();
  const hrb = findHrb(trimmed);

  let output: Record<string, unknown>;
  if (hrb) {
    output = await lookupCompany(hrb, true);
  } else {
    const name = await extractCompanyName(trimmed, "German");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "northdata.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
