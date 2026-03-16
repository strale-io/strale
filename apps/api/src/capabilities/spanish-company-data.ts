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
  if (isCif) {
    const html = await fetchRenderedHtml(`https://www.empresia.es/cif/${query}/`);
    const text = htmlToText(html);
    if (text.length < 200 || text.includes("404")) {
      throw new Error(`No Spanish company found for CIF "${query}".`);
    }
    return extractCompanyFromText(text, "Spanish", query);
  }

  // Name lookup: try direct /empresa/{slug}/ first, fall back to search
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const directHtml = await fetchRenderedHtml(`https://www.empresia.es/empresa/${slug}/`);
  const directText = htmlToText(directHtml);

  if (directText.length >= 300 && !directText.includes("404") && !directText.includes("No encontrado")) {
    return extractCompanyFromText(directText, "Spanish", query);
  }

  // Fallback: search page (requires JS rendering via Browserless)
  const searchHtml = await fetchRenderedHtml(`https://www.empresia.es/buscador/?nombre=${encodeURIComponent(query)}`);
  const searchText = htmlToText(searchHtml);

  if (searchText.length < 200 || searchText.includes("No se encontraron")) {
    throw new Error(`No Spanish company found matching "${query}".`);
  }

  return extractCompanyFromText(searchText, "Spanish", query);
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
