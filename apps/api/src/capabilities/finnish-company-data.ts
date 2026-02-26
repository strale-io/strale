import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

// PRH (Finnish Patent and Registration Office) open data API
const PRH_API = "https://avoindata.prh.fi/bis/v1";

// Finnish Business ID: 7 digits + hyphen + check digit (e.g. 0112038-9)
const BIS_RE = /^(\d{7})-?(\d)$/;

function isBusinessId(input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  const match = cleaned.match(BIS_RE);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function findBusinessId(input: string): string | null {
  const match = input.match(/\d{7}-?\d/);
  if (!match) return null;
  return isBusinessId(match[0]);
}

async function extractCompanyName(naturalLanguage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Extract the Finnish company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${naturalLanguage}"`,
      },
    ],
  });

  const name =
    response.content[0].type === "text"
      ? response.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";
  if (!name) throw new Error(`Could not identify a company name from: "${naturalLanguage}".`);
  return name;
}

async function searchPrh(name: string): Promise<string> {
  const url = `${PRH_API}?totalResults=false&maxResults=1&resultsFrom=0&name=${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`PRH API search returned HTTP ${response.status}`);
  const data = await response.json() as any;
  const results = data?.results;
  if (!results || results.length === 0) {
    throw new Error(`No Finnish company found matching "${name}".`);
  }
  return results[0].businessId;
}

async function fetchCompany(businessId: string): Promise<Record<string, unknown>> {
  const url = `${PRH_API}/${businessId}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) {
    throw new Error(`Finnish company with business ID ${businessId} not found.`);
  }
  if (!response.ok) throw new Error(`PRH API returned HTTP ${response.status}`);
  const data = await response.json() as any;
  const company = data?.results?.[0];
  if (!company) throw new Error(`No data returned for business ID ${businessId}.`);

  // Get the latest name
  const names = company.names || [];
  const currentName = names.find((n: any) => !n.endDate) || names[0];

  // Get address
  const addresses = company.addresses || [];
  const currentAddr = addresses.find((a: any) => !a.endDate && a.type === 1) || addresses[0];
  const address = currentAddr
    ? [currentAddr.street, [currentAddr.postCode, currentAddr.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    : null;

  // Get company form
  const forms = company.companyForms || [];
  const currentForm = forms.find((f: any) => !f.endDate) || forms[0];

  // Get industry code
  const industries = company.businessLines || [];
  const currentIndustry = industries.find((i: any) => !i.endDate) || industries[0];

  // Determine status from liquidations
  const liquidations = company.liquidations || [];
  const hasActiveLiquidation = liquidations.some((l: any) => !l.endDate);

  return {
    company_name: currentName?.name || "",
    business_id: company.businessId || businessId,
    business_type: currentForm?.name || "",
    industry_code: currentIndustry?.code || null,
    industry_description: currentIndustry?.name || null,
    address,
    registration_date: company.registrationDate || null,
    status: hasActiveLiquidation ? "liquidation" : "active",
  };
}

registerCapability("finnish-company-data", async (input: CapabilityInput) => {
  const rawInput = (input.business_id as string) ?? (input.org_number as string) ?? (input.task as string) ?? "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error("'business_id' is required. Provide a Finnish Business ID (e.g. 0112038-9) or company name.");
  }

  const trimmed = rawInput.trim();
  let businessId = isBusinessId(trimmed) ?? findBusinessId(trimmed);

  if (!businessId) {
    const companyName = await extractCompanyName(trimmed);
    businessId = await searchPrh(companyName);
  }

  const output = await fetchCompany(businessId);

  return {
    output,
    provenance: {
      source: "avoindata.prh.fi",
      fetched_at: new Date().toISOString(),
    },
  };
});
