import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

// US company data via SEC EDGAR (free, no auth, requires User-Agent)
const EDGAR_SEARCH = "https://www.sec.gov/cgi-bin/browse-edgar";
const EDGAR_COMPANY = "https://data.sec.gov/submissions";

// CIK: up to 10 digits; EIN: xx-xxxxxxx
const CIK_RE = /^\d{1,10}$/;

function findCik(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return CIK_RE.test(cleaned) ? cleaned.padStart(10, "0") : null;
}

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the US company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

async function searchEdgar(name: string): Promise<string> {
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(name)}%22&forms=10-K,10-Q,8-K&_source=ciks,display_names,biz_locations,inc_states,sics`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Strale/1.0 admin@strale.io",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`SEC EDGAR search returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const hits = data?.hits?.hits;
  if (!hits || hits.length === 0) {
    throw new Error(`No US company found matching "${name}" in SEC EDGAR.`);
  }
  const cik = hits[0]._source?.ciks?.[0];
  if (!cik) throw new Error(`No CIK found for "${name}".`);
  return cik;
}

async function fetchCompany(cik: string): Promise<Record<string, unknown>> {
  const paddedCik = cik.padStart(10, "0");
  const url = `${EDGAR_COMPANY}/CIK${paddedCik}.json`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Strale/1.0 admin@strale.io",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    throw new Error(`US company with CIK ${cik} not found in SEC EDGAR.`);
  }
  if (!response.ok) throw new Error(`SEC EDGAR returned HTTP ${response.status}`);
  const data = (await response.json()) as any;

  const addr = data.addresses?.business || data.addresses?.mailing || {};
  const address = [
    addr.street1,
    addr.street2,
    [addr.city, addr.stateOrCountry].filter(Boolean).join(", "),
    addr.zipCode,
  ].filter(Boolean).join(", ");

  return {
    company_name: data.name || "",
    cik: data.cik || cik,
    entity_type: data.entityType || null,
    sic: data.sic || null,
    sic_description: data.sicDescription || null,
    state: data.stateOfIncorporation || addr.stateOrCountry || null,
    address,
    ein: data.ein || null,
    fiscal_year_end: data.fiscalYearEnd || null,
    ticker: data.tickers?.[0] || null,
    exchange: data.exchanges?.[0] || null,
    status: data.entityType ? "active" : "unknown",
  };
}

registerCapability("us-company-data", async (input: CapabilityInput) => {
  const raw = (input.cik as string) ?? (input.company as string) ?? (input.company_name as string) ?? (input.ticker as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'cik' or 'company_name' is required. Provide a CIK number or US company name.");
  }

  const trimmed = raw.trim();
  let cik = findCik(trimmed);
  if (!cik) {
    const name = await extractCompanyName(trimmed);
    cik = await searchEdgar(name);
  }

  const output = await fetchCompany(cik);

  return {
    output,
    provenance: {
      source: "sec.gov/edgar",
      fetched_at: new Date().toISOString(),
    },
  };
});
