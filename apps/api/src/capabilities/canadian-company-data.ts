import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Canada — Corporations Canada (ISED)
// Corporation number: 7-digit federal number
const CORP_NUM_RE = /^\d{7}$/;

function findCorpNum(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (CORP_NUM_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{7}/);
  return match && CORP_NUM_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isNumber: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isNumber
    ? `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpDtls.html?corpId=${query}`
    : `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html?V_SEARCH.command=search&V_SEARCH.docsStart=0&V_SEARCH.docsCount=10&V_SEARCH.srchNm=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("no records") || text.length < 200) {
    throw new Error(`No Canadian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Canadian", query);
}

registerCapability("canadian-company-data", async (input: CapabilityInput) => {
  const raw = (input.corporation_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'corporation_number' or 'company_name' is required.");
  }

  const trimmed = raw.trim();
  const corpNum = findCorpNum(trimmed);

  let output: Record<string, unknown>;
  if (corpNum) {
    output = await lookupCompany(corpNum, true);
  } else {
    const name = await extractCompanyName(trimmed, "Canadian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "ised-isde.canada.ca",
      fetched_at: new Date().toISOString(),
    },
  };
});
