import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Switzerland — Zefix (Zentraler Firmenindex)
// UID: CHE-xxx.xxx.xxx; or CH-ID number
const UID_RE = /^CHE-?\d{3}\.?\d{3}\.?\d{3}$/;

function findUid(input: string): string | null {
  const match = input.match(/CHE-?\d{3}\.?\d{3}\.?\d{3}/);
  return match ? match[0] : null;
}

async function lookupCompany(query: string, isUid: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isUid
    ? `https://www.zefix.admin.ch/en/search/entity/list?name=${encodeURIComponent(query)}`
    : `https://www.zefix.admin.ch/en/search/entity/list?name=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No results") || text.includes("Keine Resultate") || text.length < 200) {
    throw new Error(`No Swiss company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Swiss", query);
}

registerCapability("swiss-company-data", async (input: CapabilityInput) => {
  const raw = (input.uid as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'uid' or 'company_name' is required. Provide a Swiss UID (e.g. CHE-105.805.977) or company name.");
  }

  const trimmed = raw.trim();
  const uid = findUid(trimmed);
  const query = uid || await extractCompanyName(trimmed, "Swiss");

  const output = await lookupCompany(query, !!uid);

  return {
    output,
    provenance: {
      source: "zefix.admin.ch",
      fetched_at: new Date().toISOString(),
    },
  };
});
