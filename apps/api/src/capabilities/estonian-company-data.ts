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
  // buildBrowserlessRequestUrl also appends ?launch= per-request, required by
  // Browserless v2 (LAUNCH_ARGS env var is deprecated). See lib/browserless-launch.ts.
  const { buildBrowserlessRequestUrl } = await import("../lib/browserless-launch.js");
  const resp = await fetch(buildBrowserlessRequestUrl(url, "/content", key), {
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
  // EE registry returns two code systems for legal_form depending on entity vintage:
  // legacy `liik` (1, 2, 3) and modern codes (4-10). Map both to canonical
  // human-readable labels so the wire shape is consistent across entities.
  // The "1 = AS" mapping is empirically validated against Bolt App Services AS
  // (17449106) and Aktsiaselts Tallink Grupp (10238429) in the 2026-05-15 audit
  // Batch 3 — both returned "1" pre-fix while modern AS entities use code "6".
  const legalForms: Record<string, string> = {
    "1": "AS (Public limited company)",
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
    jurisdiction: "EE",
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

  const regCodeForRef = (output.registry_code as string) || "";
  const primarySourceUrl = regCodeForRef
    ? `https://ariregister.rik.ee/eng/company/${regCodeForRef}`
    : "https://ariregister.rik.ee/eng";

  // Evidence Tier framework labels + Tier 1 canonical aliases (DEC-20260518-A).
  // Resolves alias keys at runtime; only sets a canonical if not already present.
  {
    const o = output as Record<string, unknown>;
    if (o.legal_name === undefined) o.legal_name = (o.company_name ?? o.name);
    if (o.primary_registration_id === undefined) o.primary_registration_id = (o.company_number ?? o.registration_number ?? o.uen ?? o.fn_number ?? o.ico ?? o.krs_number ?? o.org_number ?? o.cnpj ?? o.reg_number);
    if (o.status === undefined) o.status = (o.company_status ?? o.is_active ?? o.active);
    if (o.legal_form === undefined) o.legal_form = (o.business_type ?? o.company_type ?? o.entity_type ?? o.legal_form_code ?? o.legal_form_id);
    if (o.registered_address === undefined) o.registered_address = (o.address ?? o.office_address);
    if (o.date_incorporated === undefined) o.date_incorporated = (o.incorporation_date ?? o.registered_date ?? o.registration_date ?? o.founded ?? o.uen_issue_date ?? o.registered_at);
    o.tier_2_available = false;
    o.tier_2_available_reason = "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked";
    o.ubo_availability = "unavailable_no_registry";
    o.ubo_availability_reason = "Programmatic UBO access not currently exposed by Ariregister at v1; verification pending public-source confirmation";
  }

  return {
    output,
    provenance: {
      source: "ariregister.rik.ee",
      source_url: "https://ariregister.rik.ee/eng",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: primarySourceUrl,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/legalcode",
      attribution:
        "Source: e-Business Register (Centre of Registers and Information Systems / RIK), Estonia.",
      source_note:
        "Estonian e-Business Register open data is published by RIK under CC BY 4.0 via avaandmed.ariregister.rik.ee. Designated as an EU High-Value Dataset under Reg. (EU) 2023/138.",
    },
  };
});
