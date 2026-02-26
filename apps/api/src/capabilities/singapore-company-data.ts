import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Singapore — ACRA (Accounting and Corporate Regulatory Authority)
// UEN: 9-10 alphanumeric characters (e.g. 200401141R)
const UEN_RE = /^\d{8,9}[A-Z]$/;

function findUen(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").toUpperCase();
  if (UEN_RE.test(cleaned)) return cleaned;
  const match = input.toUpperCase().match(/\d{8,9}[A-Z]/);
  return match ? match[0] : null;
}

async function lookupCompany(query: string, isUen: boolean): Promise<Record<string, unknown>> {
  // Use OpenCorporates for Singapore data
  const searchUrl = isUen
    ? `https://opencorporates.com/companies/sg/${query}`
    : `https://opencorporates.com/companies?q=${encodeURIComponent(query)}&jurisdiction_code=sg`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Singapore company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Singaporean", query);
}

registerCapability("singapore-company-data", async (input: CapabilityInput) => {
  const raw = (input.uen as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'uen' or 'company_name' is required. Provide a UEN or company name.");
  }

  const trimmed = raw.trim();
  const uen = findUen(trimmed);

  let output: Record<string, unknown>;
  if (uen) {
    output = await lookupCompany(uen, true);
  } else {
    const name = await extractCompanyName(trimmed, "Singaporean");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "opencorporates.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
