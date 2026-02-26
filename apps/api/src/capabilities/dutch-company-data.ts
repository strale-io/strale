import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Netherlands — KVK (Kamer van Koophandel)
// KVK number: 8 digits
const KVK_RE = /^\d{8}$/;

function findKvk(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (KVK_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{8}/);
  return match && KVK_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isKvk: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isKvk
    ? `https://www.kvk.nl/zoeken/handelsregister/?kvknummer=${query}`
    : `https://www.kvk.nl/zoeken/handelsregister/?handelsnaam=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("geen resultaten") || text.includes("Geen resultaten")) {
    throw new Error(`No Dutch company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Dutch", query);
}

registerCapability("dutch-company-data", async (input: CapabilityInput) => {
  const raw = (input.kvk_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'kvk_number' or 'company_name' is required. Provide a KVK number (8 digits) or company name.");
  }

  const trimmed = raw.trim();
  const kvk = findKvk(trimmed);

  let output: Record<string, unknown>;
  if (kvk) {
    output = await lookupCompany(kvk, true);
  } else {
    const name = await extractCompanyName(trimmed, "Dutch");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "kvk.nl",
      fetched_at: new Date().toISOString(),
    },
  };
});
