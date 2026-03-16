import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Spain — CIF/NIF format: letter + 7 digits + check char
const CIF_RE = /^[A-Z]\d{7}[A-Z0-9]$/;

function findCif(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").toUpperCase();
  if (CIF_RE.test(cleaned)) return cleaned;
  const match = input.match(/[A-Z]\d{7}[A-Z0-9]/);
  return match ? match[0] : null;
}

// Primary: empresia.es (BORME data, no SSL issues)
async function lookupViaEmpresia(query: string, isCif: boolean): Promise<Record<string, unknown>> {
  // CIF lookup: /cif/A28601094/
  // Name lookup: /empresa/{slug}/ (server-rendered, no JS needed)
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const searchUrl = isCif
    ? `https://www.empresia.es/cif/${query}/`
    : `https://www.empresia.es/empresa/${slug}/`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No se encontraron") || text.includes("no results") || text.includes("404") || text.length < 200) {
    throw new Error(`No Spanish company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Spanish", query);
}

// Fallback: infocif.es (may have SSL cert issues)
async function lookupViaInfocif(query: string, isCif: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isCif
    ? `https://www.infocif.es/ficha-empresa/${query}`
    : `https://www.infocif.es/buscar-empresa?q=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("No se encontraron") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Spanish company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Spanish", query);
}

registerCapability("spanish-company-data", async (input: CapabilityInput) => {
  const raw = (input.cif as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'cif' or 'company_name' is required. Provide a CIF/NIF number (e.g. A28015865) or company name.");
  }

  const trimmed = raw.trim();
  const cif = findCif(trimmed);
  const query = cif ?? await extractCompanyName(trimmed, "Spanish");
  const isCif = !!cif;

  // Primary: empresia.es
  try {
    const output = await lookupViaEmpresia(query, isCif);
    return {
      output,
      provenance: { source: "empresia.es", fetched_at: new Date().toISOString() },
    };
  } catch (primaryErr) {
    // Fallback: infocif.es
    try {
      const output = await lookupViaInfocif(query, isCif);
      return {
        output,
        provenance: { source: "infocif.es", fetched_at: new Date().toISOString() },
      };
    } catch {
      throw primaryErr;
    }
  }
});
