import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Japan — National Tax Agency corporate number system
// Corporate number: 13 digits
const CORP_NUM_RE = /^\d{13}$/;

function findCorpNum(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (CORP_NUM_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{13}/);
  return match ? match[0] : null;
}

async function lookupCompany(query: string, isNumber: boolean): Promise<Record<string, unknown>> {
  // Use the NTA public search page
  const searchUrl = isNumber
    ? `https://www.houjin-bangou.nta.go.jp/henkorireki-johoto.html?selHouzinNo=${query}`
    : `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?selHouzinNm=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("該当する") && text.includes("ありません") || text.length < 200) {
    throw new Error(`No Japanese company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Japanese", query);
}

registerCapability("japanese-company-data", async (input: CapabilityInput) => {
  const raw = (input.corporate_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'corporate_number' or 'company_name' is required. Provide a 13-digit corporate number or company name.");
  }

  const trimmed = raw.trim();
  const corpNum = findCorpNum(trimmed);

  let output: Record<string, unknown>;
  if (corpNum) {
    output = await lookupCompany(corpNum, true);
  } else {
    const name = await extractCompanyName(trimmed, "Japanese");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "houjin-bangou.nta.go.jp",
      fetched_at: new Date().toISOString(),
    },
  };
});
