import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { getBrowserlessConfig, htmlToText } from "./lib/browserless-extract.js";

// Estonian company data via ariregister.rik.ee — FREE, no auth
const API = "https://ariregister.rik.ee/est/api";

// Estonian registry code: 8 digits
const REG_CODE_RE = /^\d{8}$/;

function findRegCode(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (REG_CODE_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{8}/);
  return match && REG_CODE_RE.test(match[0]) ? match[0] : null;
}

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the Estonian company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

/** Fetch the Estonian API through Browserless EU West to bypass IP restrictions. */
async function fetchApiViaProxy(apiUrl: string): Promise<unknown> {
  const { url, key } = getBrowserlessConfig();
  // Browserless v2 cloud uses ?token= query auth — Bearer is rejected at edge.
  const resp = await fetch(`${url}/content?token=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: apiUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 10000 },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Proxy fetch failed: HTTP ${resp.status}`);
  const html = await resp.text();
  // Chrome renders JSON APIs in a <pre> tag; extract and parse
  const text = htmlToText(html);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not extract API response via proxy.");
  return JSON.parse(jsonMatch[0]);
}

/** Try direct fetch first (works from EU IPs), fall back to Browserless proxy. */
async function fetchApi(path: string): Promise<unknown> {
  const url = `${API}${path}`;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) return resp.json();
    if (resp.status === 403) throw new Error("IP blocked");
    throw new Error(`HTTP ${resp.status}`);
  } catch {
    // Route through Browserless EU West (Amsterdam) to bypass geo-restriction
    return fetchApiViaProxy(url);
  }
}

async function searchCompany(query: string): Promise<Record<string, unknown>> {
  const data = (await fetchApi(`/autocomplete?q=${encodeURIComponent(query)}`)) as any;
  const results = data?.data;
  if (!results || results.length === 0) {
    throw new Error(`No Estonian company found matching "${query}".`);
  }

  const c = results[0];
  const legalForms: Record<string, string> = {
    "4": "FIE (Sole proprietor)",
    "5": "OÜ (Private limited company)",
    "6": "AS (Public limited company)",
    "7": "TÜ (General partnership)",
    "8": "UÜ (Limited partnership)",
    "9": "MTÜ (Non-profit association)",
    "10": "SA (Foundation)",
  };

  const statusMap: Record<string, string> = {
    R: "active",
    L: "in_liquidation",
    K: "deleted",
    N: "in_bankruptcy",
  };

  return {
    company_name: c.name || "",
    registry_code: String(c.reg_code || ""),
    business_type: legalForms[c.legal_form] || c.legal_form || null,
    address: c.legal_address || null,
    zip_code: c.zip_code || null,
    status: statusMap[c.status] || c.status || "unknown",
    historical_names: c.historical_names || [],
    registry_url: c.url || null,
  };
}

registerCapability("estonian-company-data", async (input: CapabilityInput) => {
  const raw = (input.registry_code as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'registry_code' or 'company_name' is required. Provide an Estonian registry code (8 digits) or company name.");
  }

  const trimmed = raw.trim();
  const regCode = findRegCode(trimmed);
  const query = regCode || await extractCompanyName(trimmed);
  const output = await searchCompany(query);

  return {
    output,
    provenance: {
      source: "ariregister.rik.ee",
      fetched_at: new Date().toISOString(),
    },
  };
});
