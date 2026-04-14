import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatPL } from "../lib/vat-derivation.js";

// Polish company data via KRS API — FREE, no auth
const KRS_API = "https://api-krs.ms.gov.pl/api/krs";

// KRS number: 10 digits (zero-padded)
const KRS_RE = /^\d{10}$/;

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

/*
 * Bug fix causal chain (2026-04-10, Phase 2 — Understand):
 *
 * 1. The KRS search API (/api/krs/szukaj) that powered name-based lookups
 *    now returns HTTP 404. The endpoint has been removed or relocated by the
 *    Polish Ministry of Justice. All name-based lookups fail silently.
 *
 * 2. The P→S register fallback is a quality risk: when a KRS number returns
 *    404 on the P register (companies), the code falls back to the S register
 *    (associations/unions). This can return a completely different entity type
 *    (e.g., a trade union) without any indication that it's not a company.
 *    The smell test that flagged this bug used wrong KRS numbers, but the
 *    fallback would silently return wrong-type entities in real usage.
 *
 * 3. Fix: (a) add register_type to output so callers know what they got,
 *    (b) use Browserless + ekrs.ms.gov.pl for name search since the API
 *    search endpoint is dead, (c) validate that returned krs_number matches
 *    input to prevent silent wrong-entity returns.
 */

async function fetchByKrs(krsNumber: string): Promise<Record<string, unknown>> {
  // Try P register (companies) first
  const url = `${KRS_API}/OdpisPelny/${krsNumber}?rejestr=P&format=json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (response.ok) {
    return parseKrsResponse(await response.json() as any, krsNumber, "P");
  }

  if (response.status === 404) {
    // Try S register (entrepreneurs/associations) as fallback
    const url2 = `${KRS_API}/OdpisPelny/${krsNumber}?rejestr=S&format=json`;
    const r2 = await fetch(url2, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r2.ok) throw new Error(`Polish entity with KRS ${krsNumber} not found in either P or S register.`);
    return parseKrsResponse(await r2.json() as any, krsNumber, "S");
  }

  throw new Error(`KRS API returned HTTP ${response.status}`);
}

function parseKrsResponse(data: any, krsNumber: string, register: "P" | "S"): Record<string, unknown> {
  const odpis = data?.odpis;
  if (!odpis) throw new Error(`No data returned for KRS ${krsNumber}.`);

  // Navigate the deeply nested KRS JSON structure
  const dane = odpis?.dane || {};
  const dzial1 = dane?.dzial1 || {};

  // Company name — KRS returns an array of historical names; pick current
  // Each entry has: { nazwa: "...", nrWpisuWprow: "N" } for introductions
  // and optionally { nrWpisuWykr: "M" } for deregistrations.
  // The current name is the one without nrWpisuWykr (not yet deregistered).
  const nazwy = dzial1?.danePodmiotu?.nazwa;
  let nazwa = "";
  if (typeof nazwy === "string") {
    nazwa = nazwy;
  } else if (Array.isArray(nazwy)) {
    const current = nazwy.find((n: any) => !n.nrWpisuWykr) || nazwy[nazwy.length - 1];
    nazwa = current?.nazwa || (typeof current === "string" ? current : "") || "";
  }

  // Address — KRS nests address inside siedzibaIAdres
  const siedzibaIAdres = dzial1?.siedzibaIAdres || {};
  const siedziba = siedzibaIAdres?.siedziba || {};
  const adres = siedzibaIAdres?.adres || {};
  // Address fields may also be arrays
  const getStr = (v: any): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      const curr = v.find((x: any) => !x.nrWpisuWykr) || v[v.length - 1];
      return curr?.wartosc || curr?.ulica || curr?.miejscowosc || curr || "";
    }
    return "";
  };
  const address = [
    getStr(adres?.ulica),
    getStr(adres?.nrDomu),
    [getStr(adres?.kodPocztowy), getStr(adres?.miejscowosc) || getStr(siedziba?.miejscowosc)].filter(Boolean).join(" "),
    getStr(siedziba?.kraj),
  ].filter(Boolean).join(", ");

  // Legal form
  const formaRaw = dzial1?.danePodmiotu?.formaPrawna;
  let forma = "";
  if (typeof formaRaw === "string") {
    forma = formaRaw;
  } else if (Array.isArray(formaRaw)) {
    forma = formaRaw[formaRaw.length - 1]?.formaPrawna || "";
  }

  // Registration date
  const rejestracja = dzial1?.danePodmiotu?.dataRejestracji || null;

  // Status
  const czyWykreslony = dane?.czyWykreslony || false;

  // Capital
  const kapitalRaw = dzial1?.kapital?.wysokoscKapitaluZakladowego;
  let kapital = null;
  let waluta = "PLN";
  if (typeof kapitalRaw?.wartosc === "number" || typeof kapitalRaw?.wartosc === "string") {
    kapital = kapitalRaw.wartosc;
    waluta = kapitalRaw.waluta || "PLN";
  } else if (Array.isArray(kapitalRaw)) {
    const last = kapitalRaw[kapitalRaw.length - 1];
    kapital = last?.wartosc || null;
    waluta = last?.waluta || "PLN";
  }

  // NIP (tax ID) — extract from identyfikatory array, pick current entry
  const idsRaw = dzial1?.danePodmiotu?.identyfikatory;
  let nip: string | null = null;
  if (Array.isArray(idsRaw)) {
    const current = idsRaw.find((i: any) => !i.nrWpisuWykr) || idsRaw[idsRaw.length - 1];
    nip = current?.identyfikatory?.nip || null;
  }

  return {
    company_name: nazwa,
    krs_number: krsNumber,
    nip: nip,
    vat_number: nip ? deriveVatPL(nip) : null,
    register_type: register === "P" ? "commercial" : "associations",
    legal_form: forma,
    address: address || null,
    registration_date: rejestracja,
    status: czyWykreslony ? "deregistered" : "active",
    share_capital: kapital ? `${kapital} ${waluta}` : null,
  };
}

async function searchByName(name: string): Promise<Record<string, unknown>> {
  // Primary: use northdata.com which covers Polish companies and returns KRS numbers.
  // The old KRS search API (/api/krs/szukaj) returns 404 as of April 2026,
  // and the Browserless portal scraping was unreliable.
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  // northdata's direct-slug URL pattern (e.g. /Budimex%20SA) returns 404 as of April 2026.
  // Use the search endpoint instead. Result links still embed KRS numbers in the href.
  const searchUrl = `https://www.northdata.com/?query=${encodeURIComponent(name)}`;

  try {
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (resp.ok) {
      const html = await resp.text();
      // When northdata recognizes the query as a specific company, the page's
      // <link rel="canonical"> points to the primary entity's detail page,
      // e.g. https://www.northdata.com/Budimex%20SA,%20Warszawa/KRS0000001764
      // This is far more reliable than scraping result-list hrefs (the page
      // contains many unrelated KRS links in sidebars / related companies).
      const canonicalTag = html.match(/<link[^>]*rel="canonical"[^>]*>/);
      if (canonicalTag) {
        const krsMatch = canonicalTag[0].match(/KRS(\d{10})/);
        if (krsMatch) {
          return fetchByKrs(krsMatch[1]);
        }
      }

      // Fallback: find result links that match the search term in their path.
      const firstWord = name.split(/\s+/)[0].toLowerCase();
      const hrefRe = /href="(\/[^"]*KRS(\d{10})[^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = hrefRe.exec(html)) !== null) {
        const href = decodeURIComponent(m[1]).toLowerCase();
        if (href.includes(`/${firstWord}`)) {
          return fetchByKrs(m[2]);
        }
      }
    }
  } catch {
    // northdata search failed — fall through to error
  }

  throw new Error(
    `No Polish company found matching "${name}". ` +
    `Try providing a KRS number (10 digits) instead, or use a more specific company name.`,
  );
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
