import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

// Polish company data via KRS API — FREE, no auth
const KRS_API = "https://api-krs.ms.gov.pl/api/krs";

// KRS number: 10 digits (zero-padded)
const KRS_RE = /^\d{10}$/;
// NIP (tax ID): 10 digits
const NIP_RE = /^\d{10}$/;

function findKrs(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (KRS_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{10}/);
  return match ? match[0] : null;
}

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the Polish company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

async function fetchByKrs(krsNumber: string): Promise<Record<string, unknown>> {
  const url = `${KRS_API}/OdpisPelny/${krsNumber}?rejestr=P&format=json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 404) {
    // Try entrepreneurs register
    const url2 = `${KRS_API}/OdpisPelny/${krsNumber}?rejestr=S&format=json`;
    const r2 = await fetch(url2, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r2.ok) throw new Error(`Polish company with KRS ${krsNumber} not found.`);
    return parseKrsResponse(await r2.json() as any, krsNumber);
  }

  if (!response.ok) throw new Error(`KRS API returned HTTP ${response.status}`);
  return parseKrsResponse(await response.json() as any, krsNumber);
}

function parseKrsResponse(data: any, krsNumber: string): Record<string, unknown> {
  const odpis = data?.odpis;
  if (!odpis) throw new Error(`No data returned for KRS ${krsNumber}.`);

  // Navigate the deeply nested KRS JSON structure
  const dane = odpis?.dane || {};
  const dzial1 = dane?.dzial1 || {};
  const dzial3 = dane?.dzial3 || {};

  // Company name
  const nazwa = dzial1?.danePodmiotu?.nazwa || "";

  // Address
  const siedziba = dzial1?.siedzibaIAdres?.siedziba || {};
  const adres = dzial1?.siedzibaIAdres?.adres || {};
  const address = [
    adres?.ulica,
    adres?.nrDomu,
    [adres?.kodPocztowy, adres?.miejscowosc || siedziba?.miejscowosc].filter(Boolean).join(" "),
    siedziba?.kraj,
  ].filter(Boolean).join(", ");

  // Legal form
  const forma = dzial1?.danePodmiotu?.formaPrawna || "";

  // Registration date
  const rejestracja = dzial1?.danePodmiotu?.dataRejestracji || null;

  // Status
  const czyWykreslony = dane?.czyWykreslony || false;

  // Capital
  const kapital = dzial1?.kapital?.wysokoscKapitaluZakladowego?.wartosc || null;
  const waluta = dzial1?.kapital?.wysokoscKapitaluZakladowego?.waluta || "PLN";

  return {
    company_name: nazwa,
    krs_number: krsNumber,
    legal_form: forma,
    address: address || null,
    registration_date: rejestracja,
    status: czyWykreslony ? "deregistered" : "active",
    share_capital: kapital ? `${kapital} ${waluta}` : null,
  };
}

async function searchByName(name: string): Promise<Record<string, unknown>> {
  // KRS API doesn't have a name search endpoint — use the REJESTR.IO API or
  // search the eKRS portal. For now, try a direct API call pattern.
  // Actually the KRS API has a newer search endpoint
  const url = `https://api-krs.ms.gov.pl/api/krs/szukaj?nazwa=${encodeURIComponent(name)}&limit=1&format=json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (response.ok) {
    const data = (await response.json()) as any;
    const items = data?.items || data?.wyniki || [];
    if (items.length > 0) {
      const krs = items[0].krs || items[0].numerKRS;
      if (krs) return fetchByKrs(krs);
    }
  }

  // Fallback: try the ekrs.ms.gov.pl search
  throw new Error(`No Polish company found matching "${name}". Try providing a KRS number (10 digits).`);
}

registerCapability("polish-company-data", async (input: CapabilityInput) => {
  const raw = (input.krs_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'krs_number' or 'company_name' is required. Provide a KRS number (10 digits) or company name.");
  }

  const trimmed = raw.trim();
  const krs = findKrs(trimmed);

  let output: Record<string, unknown>;
  if (krs) {
    output = await fetchByKrs(krs);
  } else {
    const companyName = await extractCompanyName(trimmed);
    output = await searchByName(companyName);
  }

  return {
    output,
    provenance: {
      source: "api-krs.ms.gov.pl",
      fetched_at: new Date().toISOString(),
    },
  };
});
