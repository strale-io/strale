import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Austria — Firmenbuch / WKO Firmen A-Z
// FN number: 6 digits + letter (e.g. 150913f)
const FN_RE = /^\d{6}[a-z]$/i;

function findFn(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").replace(/^FN/i, "");
  if (FN_RE.test(cleaned)) return cleaned.toLowerCase();
  const match = input.match(/\d{6}[a-z]/i);
  return match ? match[0].toLowerCase() : null;
}

async function lookupCompany(query: string, isFn: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isFn
    ? `https://firmen.wko.at/SearchSimple.aspx?searchterm=FN+${query}`
    : `https://firmen.wko.at/SearchSimple.aspx?searchterm=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("Keine Treffer") || text.includes("keine Ergebnisse") || text.length < 200) {
    throw new Error(`No Austrian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Austrian", query);
}

registerCapability("austrian-company-data", async (input: CapabilityInput) => {
  const raw = (input.fn_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'fn_number' or 'company_name' is required. Provide a Firmenbuchnummer (e.g. FN 150913f) or company name.");
  }

  const trimmed = raw.trim();
  const fn = findFn(trimmed);

  let output: Record<string, unknown>;
  if (fn) {
    output = await lookupCompany(fn, true);
  } else {
    const name = await extractCompanyName(trimmed, "Austrian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "firmen.wko.at",
      fetched_at: new Date().toISOString(),
    },
  };
});
