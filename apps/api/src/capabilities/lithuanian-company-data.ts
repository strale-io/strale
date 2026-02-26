import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Lithuania — Registrų centras (Centre of Registers)
// Company code: 7-9 digits
const CODE_RE = /^\d{7,9}$/;

function findCode(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (CODE_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{7,9}/);
  return match && CODE_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isCode: boolean): Promise<Record<string, unknown>> {
  // Use rekvizitai.vz.lt — a popular free Lithuanian company search
  const searchUrl = isCode
    ? `https://rekvizitai.vz.lt/en/company-search/1/code/${query}/`
    : `https://rekvizitai.vz.lt/en/company-search/1/name/${encodeURIComponent(query)}/`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("not found") || text.includes("Nerasta") || text.length < 200) {
    throw new Error(`No Lithuanian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Lithuanian", query);
}

registerCapability("lithuanian-company-data", async (input: CapabilityInput) => {
  const raw = (input.company_code as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'company_code' or 'company_name' is required. Provide a Lithuanian company code (7-9 digits) or company name.");
  }

  const trimmed = raw.trim();
  const code = findCode(trimmed);

  let output: Record<string, unknown>;
  if (code) {
    output = await lookupCompany(code, true);
  } else {
    const name = await extractCompanyName(trimmed, "Lithuanian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "rekvizitai.vz.lt",
      fetched_at: new Date().toISOString(),
    },
  };
});
