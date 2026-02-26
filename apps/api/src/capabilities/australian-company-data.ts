import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Australia — ABN Lookup (abr.business.gov.au)
// ABN: 11 digits; ACN: 9 digits
const ABN_RE = /^\d{11}$/;
const ACN_RE = /^\d{9}$/;

function findAbn(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (ABN_RE.test(cleaned)) return cleaned;
  if (ACN_RE.test(cleaned)) return cleaned; // Will search by ACN
  const match = input.match(/\d{11}/);
  return match ? match[0] : null;
}

async function lookupCompany(query: string, isNumber: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isNumber
    ? `https://abr.business.gov.au/ABN/View?abn=${query}`
    : `https://abr.business.gov.au/Search/ResultsActive?SearchText=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No records found") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Australian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Australian", query);
}

registerCapability("australian-company-data", async (input: CapabilityInput) => {
  const raw = (input.abn as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'abn' or 'company_name' is required. Provide an ABN (11 digits), ACN (9 digits), or company name.");
  }

  const trimmed = raw.trim();
  const abn = findAbn(trimmed);

  let output: Record<string, unknown>;
  if (abn) {
    output = await lookupCompany(abn, true);
  } else {
    const name = await extractCompanyName(trimmed, "Australian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "abr.business.gov.au",
      fetched_at: new Date().toISOString(),
    },
  };
});
