import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Italy — Codice Fiscale / Partita IVA: 11 digits for companies
const PIVA_RE = /^\d{11}$/;

function findPiva(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (PIVA_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{11}/);
  return match && PIVA_RE.test(match[0]) ? match[0] : null;
}

async function lookupCompany(query: string, isPiva: boolean): Promise<Record<string, unknown>> {
  // Use registroimprese.it search or a public directory
  const searchUrl = isPiva
    ? `https://www.registroimprese.it/ricerca-libera?query=${query}`
    : `https://www.registroimprese.it/ricerca-libera?query=${encodeURIComponent(query)}`;

  const html = await fetchRenderedHtml(searchUrl);
  const text = htmlToText(html);

  if (text.includes("Nessun risultato") || text.includes("not found") || text.length < 200) {
    throw new Error(`No Italian company found matching "${query}".`);
  }

  return extractCompanyFromText(text, "Italian", query);
}

registerCapability("italian-company-data", async (input: CapabilityInput) => {
  const raw = (input.partita_iva as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'partita_iva' or 'company_name' is required. Provide a Partita IVA (11 digits) or company name.");
  }

  const trimmed = raw.trim();
  const piva = findPiva(trimmed);

  let output: Record<string, unknown>;
  if (piva) {
    output = await lookupCompany(piva, true);
  } else {
    const name = await extractCompanyName(trimmed, "Italian");
    output = await lookupCompany(name, false);
  }

  return {
    output,
    provenance: {
      source: "registroimprese.it",
      fetched_at: new Date().toISOString(),
    },
  };
});
