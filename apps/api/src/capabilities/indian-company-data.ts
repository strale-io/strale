import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// India — MCA via Tofler or OpenCorporates
// CIN: 21-character alphanumeric Corporate Identity Number
const CIN_RE = /^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

function findCin(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").toUpperCase();
  if (CIN_RE.test(cleaned)) return cleaned;
  const match = input.toUpperCase().match(/[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/);
  return match ? match[0] : null;
}

async function lookupCompany(query: string, isCin: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isCin
    ? `https://www.tofler.in/search?q=${query}`
    : `https://www.tofler.in/search?q=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Indian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Indian", query);
}

registerCapability("indian-company-data", async (input: CapabilityInput) => {
  const raw = (input.cin as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'cin' or 'company_name' is required. Provide a CIN or company name.");
  }

  const trimmed = raw.trim();
  const cin = findCin(trimmed);

  let output: Record<string, unknown>;
  if (cin) {
    output = await lookupCompany(cin, true);
  } else {
    const name = await extractCompanyName(trimmed, "Indian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "tofler.in",
      fetched_at: new Date().toISOString(),
    },
  };
});
