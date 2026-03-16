import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
  extractCompanyFromText,
  extractCompanyName,
} from "./lib/browserless-extract.js";

// Austria — FinAPU Firmenbuch API (primary) + WKO Firmen A-Z (fallback)
// FN number: 6 digits + letter (e.g. 150913f)
const FN_RE = /^\d{5,6}[a-z]$/i;

const FINAPU_URL = "https://firmenbuch.finapu.com/fb-svc/firmen-service";

// Legal form code → human-readable
const RECHTSFORM: Record<string, string> = {
  GES: "GmbH (Limited liability company)",
  EU: "eU (Sole proprietorship)",
  AG: "AG (Stock corporation)",
  KG: "KG (Limited partnership)",
  OG: "OG (General partnership)",
  PST: "Privatstiftung (Private foundation)",
  GEN: "Genossenschaft (Cooperative)",
  FKG: "FlexKG (Flexible limited partnership)",
  SE: "SE (European company)",
  VER: "Versicherungsverein (Mutual insurance)",
  SPA: "Sparkasse (Savings bank)",
  PAR: "Partnerschaft (Partnership)",
};

function findFn(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "").replace(/^FN/i, "");
  if (FN_RE.test(cleaned)) return cleaned.toLowerCase();
  const match = input.match(/\d{5,6}[a-z]/i);
  return match ? match[0].toLowerCase() : null;
}

interface FinapuSearchResult {
  fnr: string;
  name: string;
  rechtsform: string;
  sitz: string;
  activity: string | null;
  status: "active" | "inactive";
  initDate: string | null;
  endDate: string | null;
}

interface FinapuDetails {
  fbnr: number;
  fbnrChar: string;
  bezeichnung: string;
  rechtsform: { code: string; text: string };
  adresse: { strasse: string; hausnr: string; tuernr: string | null; plz: string; ort: string; staat: string };
  status: string;
  activity: string;
  initDate: string | null;
  endDate: string | null;
  lei: string | null;
  euids: string[];
  pastNames: { name: string; bis: string }[];
  sitz: string;
  vertreter: { nameFormatiert: string; posBezeichnung: string; von: string | null }[];
}

async function finapuSearch(query: string): Promise<FinapuSearchResult[]> {
  const resp = await fetch(FINAPU_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "search-firma",
      params: {
        firmenname: query,
        searchOptions: { withHistory: false, withAddress: false, withActivity: true, withPersons: false, withName: true },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`FinAPU API returned HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.status === "error") throw new Error(`FinAPU error: ${data.message}`);
  return data.results ?? [];
}

async function finapuDetails(fnr: string): Promise<FinapuDetails> {
  const resp = await fetch(FINAPU_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "details-firma", params: { fnr } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`FinAPU API returned HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.status === "error") throw new Error(`FinAPU error: ${data.message}`);
  return data;
}

function formatAddress(addr: FinapuDetails["adresse"]): string {
  const parts = [addr.strasse, addr.hausnr].filter(Boolean).join(" ");
  const door = addr.tuernr ? `/${addr.tuernr}` : "";
  return `${parts}${door}, ${addr.plz} ${addr.ort}`;
}

async function lookupViaFinapu(query: string, isFn: boolean): Promise<Record<string, unknown>> {
  if (isFn) {
    // Direct lookup by FN number
    try {
      const details = await finapuDetails(query);
      return {
        company_name: details.bezeichnung,
        fn_number: `FN ${details.fbnr}${details.fbnrChar}`,
        business_type: RECHTSFORM[details.rechtsform?.code] ?? details.rechtsform?.text ?? null,
        address: formatAddress(details.adresse),
        city: details.sitz,
        status: details.status === "active" ? "active" : "inactive",
        activity: details.activity || null,
        lei: details.lei || null,
        eu_vat_ids: details.euids?.length ? details.euids : null,
        founded: details.initDate || null,
        dissolved: details.endDate || null,
        past_names: details.pastNames?.length ? details.pastNames.map(p => p.name) : null,
        directors: details.vertreter?.map(v => ({
          name: v.nameFormatiert,
          role: v.posBezeichnung,
          since: v.von,
        })) ?? null,
      };
    } catch {
      // Fall through to search if details lookup fails
    }
  }

  // Search by name
  const results = await finapuSearch(query);
  if (results.length === 0) {
    throw new Error(`No Austrian company found matching "${query}".`);
  }

  // Get details for the best match
  const best = results[0];
  try {
    const details = await finapuDetails(best.fnr);
    return {
      company_name: details.bezeichnung,
      fn_number: `FN ${details.fbnr}${details.fbnrChar}`,
      business_type: RECHTSFORM[details.rechtsform?.code] ?? details.rechtsform?.text ?? null,
      address: formatAddress(details.adresse),
      city: details.sitz,
      status: details.status === "active" ? "active" : "inactive",
      activity: details.activity || null,
      lei: details.lei || null,
      eu_vat_ids: details.euids?.length ? details.euids : null,
      founded: details.initDate || null,
      dissolved: details.endDate || null,
      past_names: details.pastNames?.length ? details.pastNames.map(p => p.name) : null,
      directors: details.vertreter?.map(v => ({
        name: v.nameFormatiert,
        role: v.posBezeichnung,
        since: v.von,
      })) ?? null,
    };
  } catch {
    // Return basic info from search result if details fail
    return {
      company_name: best.name,
      fn_number: `FN ${best.fnr}`,
      business_type: RECHTSFORM[best.rechtsform] ?? best.rechtsform ?? null,
      city: best.sitz,
      status: best.status === "active" ? "active" : "inactive",
      activity: best.activity || null,
    };
  }
}

// WKO.at fallback (existing Browserless scraper)
async function lookupViaWko(query: string, isFn: boolean): Promise<Record<string, unknown>> {
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

  // Primary: FinAPU Firmenbuch API
  try {
    const output = await lookupViaFinapu(fn ?? trimmed, !!fn);
    return {
      output,
      provenance: { source: "firmenbuch.finapu.com", fetched_at: new Date().toISOString() },
    };
  } catch (finapuErr) {
    // Fallback: WKO.at via Browserless
    try {
      const name = fn ?? await extractCompanyName(trimmed, "Austrian");
      const output = await lookupViaWko(name, !!fn);
      return {
        output,
        provenance: { source: "firmen.wko.at", fetched_at: new Date().toISOString() },
      };
    } catch {
      // Re-throw the FinAPU error (more informative)
      throw finapuErr;
    }
  }
});
