import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Ireland — CRO (Companies Registration Office)
// CRO number: 5-6 digits
const CRO_RE = /^\d{5,6}$/;

function findCro(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (CRO_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{5,6}/);
  return match && CRO_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isCro: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isCro
    ? `https://core.cro.ie/company/${query}`
    : `https://core.cro.ie/search?q=${encodeURIComponent(query)}&type=company`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Irish company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Irish", query);
}

registerCapability("irish-company-data", async (input: CapabilityInput) => {
  const raw = (input.cro_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'cro_number' or 'company_name' is required. Provide a CRO number (5-6 digits) or company name.");
  }

  const trimmed = raw.trim();
  const cro = findCro(trimmed);

  let output: Record<string, unknown>;
  if (cro) {
    output = await lookupCompany(cro, true);
  } else {
    const name = await extractCompanyName(trimmed, "Irish");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "core.cro.ie",
      fetched_at: new Date().toISOString(),
    },
  };
});
