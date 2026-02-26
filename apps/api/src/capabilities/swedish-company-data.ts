import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Org number detection ──────────────────────────────────────────────────────
// Swedish org numbers: 10 digits, optionally with hyphen after 6th digit
// e.g. "559106-8089", "5591068089", "556703-7485"
const ORG_NUMBER_RE = /^(\d{6})-?(\d{4})$/;

function isOrgNumber(input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  const match = cleaned.match(ORG_NUMBER_RE);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

// Try to find an org number embedded in natural language
function findOrgNumber(input: string): string | null {
  const match = input.match(/\d{6}-?\d{4}/);
  if (!match) return null;
  return isOrgNumber(match[0]);
}

// ─── Fuzzy resolution via Claude Haiku (DEC-20260225-P-m5n6) ───────────────────
// ─── LLM: extract company name from natural language (DEC-20260225-P-m5n6) ────
async function extractCompanyName(naturalLanguage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for fuzzy company name resolution.",
    );
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Extract the Swedish company name from this request. Return ONLY the company name, nothing else. No quotes, no explanation.

Request: "${naturalLanguage}"`,
      },
    ],
  });

  const name =
    response.content[0].type === "text"
      ? response.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";

  if (!name) {
    throw new Error(
      `Could not identify a company name from: "${naturalLanguage}". Please provide a Swedish organization number or specific company name.`,
    );
  }

  return name;
}

// ─── Allabolag search: company name → org number ───────────────────────────────
async function searchAllabolag(
  companyName: string,
): Promise<{ orgNumber: string; companyName: string }> {
  const browserlessUrl = process.env.BROWSERLESS_URL;
  const browserlessKey = process.env.BROWSERLESS_API_KEY;

  if (!browserlessUrl || !browserlessKey) {
    throw new Error(
      "BROWSERLESS_URL and BROWSERLESS_API_KEY are required.",
    );
  }

  const searchUrl = `https://www.allabolag.se/what/${encodeURIComponent(companyName)}`;
  const contentUrl = `${browserlessUrl}/content?token=${browserlessKey}`;

  const response = await fetch(contentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: searchUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 25000 },
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    throw new Error(`Browserless search returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // Extract first org number from search results
  // Search results contain "Org.nr" followed by the number
  const orgMatch = html.match(/(\d{6})-(\d{4})/);
  if (!orgMatch) {
    throw new Error(
      `No Swedish company found matching "${companyName}" on Allabolag.se. Try providing a more specific name or an organization number.`,
    );
  }

  const orgNumber = `${orgMatch[1]}-${orgMatch[2]}`;

  // Extract company name from the title or near the org number
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  let resolvedName = companyName;
  if (titleMatch) {
    // Title: "Spotify - 43 leverantörer i Sverige..."
    const title = titleMatch[1].trim();
    const dashIdx = title.indexOf(" - ");
    if (dashIdx > 0) {
      resolvedName = title.slice(0, dashIdx).trim();
    }
  }

  return { orgNumber, companyName: resolvedName };
}

// ─── Allabolag.se scraping via Browserless REST API ─────────────────────────────
interface CompanyData {
  company_name: string;
  org_number: string;
  revenue_sek: number | null;
  employees: number | null;
  profit_sek: number | null;
  fiscal_year: string | null;
}

// Parse a number from Allabolag's format: "108 131 545" or "108&nbsp;131&nbsp;545"
// Amounts on the page are in "Belopp i 1000" (thousands of SEK)
function parseAllabolagNumber(text: string): number | null {
  // Replace &nbsp; and non-breaking spaces with nothing, keep minus
  const cleaned = text
    .replace(/&nbsp;/g, "")
    .replace(/[\s\u00a0]/g, "")
    .replace(/\u2212/g, "-") // Unicode minus → ASCII minus
    .trim();
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return null;
  return num;
}

function parseHtml(html: string, orgNumber: string): CompanyData {
  const result: CompanyData = {
    company_name: "",
    org_number: orgNumber,
    revenue_sek: null,
    employees: null,
    profit_sek: null,
    fiscal_year: null,
  };

  // ── Company name from <title> ──────────────────────────────────────────
  // Title: "Spotify AB - Org.nr 556703-7485 - Stockholm - Se Nyckeltal..."
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const dashIdx = title.indexOf(" - ");
    result.company_name = dashIdx > 0 ? title.slice(0, dashIdx).trim() : title;
  }

  // ── Strip HTML → text lines ────────────────────────────────────────────
  // Remove scripts and styles first
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|tr|td|th|li|h[1-6]|dt|dd|section|article|header|span)[^>]*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

  const lines = text.split("\n").map((l) => l.replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ").trim()).filter(Boolean);

  // ── Parse the "Bokslut och nyckeltal" section ──────────────────────────
  // Structure: label → year → value, repeating. Amounts in thousands (tkr).
  // "Omsättning" → "2024" → "108 131 545"
  // "Resultat efter finansnetto" → "2024" → "9 153 051"
  // The section header "Bokslut" is followed by fiscal year "2024-12"
  let inBokslut = false;
  let amountsInThousands = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Detect "Belopp i 1000" — amounts are in thousands
    if (lower.includes("belopp i 1000")) {
      amountsInThousands = true;
      inBokslut = true;
      continue;
    }

    // Fiscal year from "Bokslut" section: look for "2024-12" pattern
    if (lower === "bokslut" || lower.includes("bokslut och nyckeltal")) {
      inBokslut = true;
      // Look ahead for a year pattern like "2024-12"
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const yearMatch = lines[j].match(/^(\d{4}-\d{2})$/);
        if (yearMatch && result.fiscal_year === null) {
          result.fiscal_year = yearMatch[1];
          break;
        }
      }
      continue;
    }

    if (!inBokslut) continue;

    // Revenue: "Omsättning" or "Nettoomsättning" → skip year → number
    if (
      (lower === "omsättning" || lower === "nettoomsättning") &&
      result.revenue_sek === null
    ) {
      // Next non-year line with digits is the value; or skip the year line first
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const val = parseAllabolagNumber(lines[j]);
        if (val !== null && Math.abs(val) > 100) {
          // Likely the financial value, not the year
          result.revenue_sek = amountsInThousands ? val * 1000 : val;
          break;
        }
      }
      continue;
    }

    // Profit: "Resultat efter finansnetto" → skip year → number
    if (lower.includes("resultat efter finansnetto") && result.profit_sek === null) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const val = parseAllabolagNumber(lines[j]);
        if (val !== null && Math.abs(val) > 100) {
          result.profit_sek = amountsInThousands ? val * 1000 : val;
          break;
        }
      }
      continue;
    }

    // Employees: "Antal anställda" → next number
    if (lower.includes("antal anställda") && result.employees === null) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const empMatch = lines[j].match(/^(\d+)$/);
        if (empMatch) {
          result.employees = parseInt(empMatch[1], 10);
          break;
        }
      }
      continue;
    }
  }

  return result;
}

async function scrapeAllabolag(orgNumber: string): Promise<CompanyData> {
  const browserlessUrl = process.env.BROWSERLESS_URL;
  const browserlessKey = process.env.BROWSERLESS_API_KEY;

  if (!browserlessUrl || !browserlessKey) {
    throw new Error(
      "BROWSERLESS_URL and BROWSERLESS_API_KEY are required for swedish-company-data.",
    );
  }

  // Allabolag URL: https://www.allabolag.se/5567037485 (main page has financials)
  const cleanOrg = orgNumber.replace("-", "");
  const targetUrl = `https://www.allabolag.se/${cleanOrg}`;

  // Use Browserless REST /content endpoint — returns rendered HTML
  const contentUrl = `${browserlessUrl}/content?token=${browserlessKey}`;

  const response = await fetch(contentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: targetUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 25000 },
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Browserless /content returned HTTP ${response.status}: ${errText.slice(0, 200)}`,
    );
  }

  const html = await response.text();

  if (!html || html.length < 100) {
    throw new Error("Browserless returned empty or too-short HTML response.");
  }

  const data = parseHtml(html, orgNumber);

  // Detect 404 / failed load: generic Allabolag title with no financial data
  // Note: "Vi verkar inte hitta sidan" appears in embedded i18n JSON on all pages,
  // so we can't use it for 404 detection. Instead, check the parsed results.
  if (
    (!data.company_name || data.company_name.toLowerCase().includes("allabolag")) &&
    data.revenue_sek === null
  ) {
    throw new Error(
      `Company with org number ${orgNumber} was not found on Allabolag.se. Verify the organization number is correct.`,
    );
  }

  return data;
}

// ─── Register the capability ───────────────────────────────────────────────────
registerCapability(
  "swedish-company-data",
  async (input: CapabilityInput) => {
    const rawInput =
      (input.org_number as string) ?? (input.task as string) ?? "";
    if (typeof rawInput !== "string" || !rawInput.trim()) {
      throw new Error(
        "'org_number' is required. Provide a Swedish org number (e.g. 559106-8089) or company name.",
      );
    }

    const trimmed = rawInput.trim();

    // Step 1: Try to extract org number directly
    let orgNumber = isOrgNumber(trimmed) ?? findOrgNumber(trimmed);
    let resolvedName: string | null = null;

    // Step 2: If no org number found, use LLM to extract company name,
    // then search Allabolag to get the real org number (DEC-20260225-P-m5n6)
    if (!orgNumber) {
      const companyName = await extractCompanyName(trimmed);
      const searchResult = await searchAllabolag(companyName);
      orgNumber = searchResult.orgNumber;
      resolvedName = searchResult.companyName;
    }

    // Step 3: Scrape Allabolag.se via Browserless
    const data = await scrapeAllabolag(orgNumber);

    // Use the scraped company name, falling back to LLM-resolved name
    if (!data.company_name && resolvedName) {
      data.company_name = resolvedName;
    }

    return {
      output: {
        company_name: data.company_name,
        org_number: data.org_number,
        revenue_sek: data.revenue_sek,
        employees: data.employees,
        profit_sek: data.profit_sek,
        fiscal_year: data.fiscal_year,
        ...(resolvedName ? { resolved_from: trimmed } : {}),
      },
      provenance: {
        source: "allabolag.se",
        fetched_at: new Date().toISOString(),
      },
    };
  },
);
