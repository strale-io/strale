import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Hong Kong — ICRIS (Integrated Companies Registry Information System)
// CR number: typically 7 digits
const CR_RE = /^\d{7}$/;

function findCr(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (CR_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{7}/);
  return match && CR_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isCr: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isCr
    ? `https://opencorporates.com/companies/hk/${query}`
    : `https://opencorporates.com/companies?q=${encodeURIComponent(query)}&jurisdiction_code=hk`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Hong Kong company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Hong Kong", query);
}

registerCapability("hong-kong-company-data", async (input: CapabilityInput) => {
  const raw = (input.cr_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'cr_number' or 'company_name' is required. Provide a CR number or company name.");
  }

  const trimmed = raw.trim();
  const cr = findCr(trimmed);

  let output: Record<string, unknown>;
  if (cr) {
    output = await lookupCompany(cr, true);
  } else {
    const name = await extractCompanyName(trimmed, "Hong Kong");
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
