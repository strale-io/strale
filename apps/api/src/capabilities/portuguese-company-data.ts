import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Portugal — NIPC (Número de Identificação de Pessoa Coletiva): 9 digits
const NIPC_RE = /^\d{9}$/;

function findNipc(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (NIPC_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{9}/);
  return match && NIPC_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isNipc: boolean): Promise<Record<string, unknown>> {
  const searchUrl = isNipc
    ? `https://www.racius.com/empresa/${query}/`
    : `https://www.racius.com/pesquisa/?q=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("não encontr") || text.includes("Sem resultados") || text.length < 200) {
    throw new Error(`No Portuguese company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Portuguese", query);
}

registerCapability("portuguese-company-data", async (input: CapabilityInput) => {
  const raw = (input.nipc as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'nipc' or 'company_name' is required. Provide a NIPC number (9 digits) or company name.");
  }

  const trimmed = raw.trim();
  const nipc = findNipc(trimmed);

  let output: Record<string, unknown>;
  if (nipc) {
    output = await lookupCompany(nipc, true);
  } else {
    const name = await extractCompanyName(trimmed, "Portuguese");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "racius.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
