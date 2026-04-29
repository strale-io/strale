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

/*
 * KRS-by-number is the only compliant path. The northdata.com name-search
 * fallback was removed under DEC-20260427-I (commercial KYB-aggregator
 * scraping ban). The Polish Ministry of Justice's KRS search API
 * (/api/krs/szukaj) returns HTTP 404 since April 2026, and ekrs.ms.gov.pl
 * portal scraping is unreliable. Until a compliant name-search source exists,
 * callers must supply a 10-digit KRS number.
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

registerCapability("polish-company-data", async (input: CapabilityInput) => {
  const raw = (input.krs_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'krs_number' is required. Provide a 10-digit Polish KRS number.");
  }

  const krs = findKrs(raw.trim());
  if (!krs) {
    throw new Error(
      "Polish company name search is unavailable: the only compliant data path is the KRS API by registration number. " +
        "Provide a 10-digit KRS number (e.g. '0000028860' for ORLEN S.A.). " +
        "Look up KRS numbers at https://wyszukiwarka-krs.ms.gov.pl/.",
    );
  }

  const output = await fetchByKrs(krs);
  return {
    output,
    provenance: {
      source: "api-krs.ms.gov.pl",
      source_url: `${KRS_API}/OdpisPelny/${krs}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${KRS_API}/OdpisPelny/${krs}?rejestr=P&format=json`,
      attribution:
        "Źródło: Krajowy Rejestr Sądowy (KRS), Ministerstwo Sprawiedliwości RP.",
      source_note:
        "KRS is the Polish National Court Register, operated by the Ministry of Justice. Basic company data is designated as an EU High-Value Dataset under Reg. (EU) 2023/138. Specific reuse-licence text is not declared on the API; reuse falls under the Polish 2021 open-data act (Ustawa o otwartych danych i ponownym wykorzystywaniu informacji sektora publicznego).",
    },
  };
});
