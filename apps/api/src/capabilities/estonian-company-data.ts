import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

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

async function searchCompany(query: string): Promise<Record<string, unknown>> {
  const url = `${API}/autocomplete?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Estonian registry API returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
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
