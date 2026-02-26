import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Latvia — Uzņēmumu reģistrs (Enterprise Register)
// Registration number: 11 digits, typically starting with 40
const REG_RE = /^\d{11}$/;

function findReg(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (REG_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{11}/);
  return match ? match[0] : null;
}

async function lookupCompany(query: string, isRegNumber: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isRegNumber
    ? `https://info.ur.gov.lv/#/company-search?regNr=${query}`
    : `https://info.ur.gov.lv/#/company-search?name=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("Nav atrasti") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Latvian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Latvian", query);
}

registerCapability("latvian-company-data", async (input: CapabilityInput) => {
  const raw = (input.reg_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'reg_number' or 'company_name' is required. Provide a Latvian registration number (11 digits) or company name.");
  }

  const trimmed = raw.trim();
  const reg = findReg(trimmed);

  let output: Record<string, unknown>;
  if (reg) {
    output = await lookupCompany(reg, true);
  } else {
    const name = await extractCompanyName(trimmed, "Latvian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "ur.gov.lv",
      fetched_at: new Date().toISOString(),
    },
  };
});
