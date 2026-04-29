import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatFI } from "../lib/vat-derivation.js";

// PRH (Finnish Patent and Registration Office) open data API — new v3 endpoint
const PRH_API = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";

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
  const url = `${PRH_API}?name=${encodeURIComponent(name)}&totalResults=false&maxResults=1`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`PRH API search returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const companies = data?.companies;
  if (!companies || companies.length === 0) {
    throw new Error(`No Finnish company found matching "${name}".`);
  }
  return companies[0].businessId?.value || companies[0].businessId;
}

async function fetchCompany(businessId: string): Promise<Record<string, unknown>> {
  const url = `${PRH_API}?businessId=${encodeURIComponent(businessId)}&totalResults=false&maxResults=1`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`PRH API returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  const companies = data?.companies;
  if (!companies || companies.length === 0) {
    throw new Error(`Finnish company with business ID ${businessId} not found.`);
  }
  const company = companies[0];

  // Get the latest name (type "1" = trade name, no endDate = current)
  const names = company.names || [];
  const currentName =
    names.find((n: any) => n.type === "1" && !n.endDate) ||
    names.find((n: any) => !n.endDate) ||
    names[0];

  // Get address (type 1 = visiting address)
  const addresses = company.addresses || [];
  const currentAddr =
    addresses.find((a: any) => a.type === 1 && !a.endDate) || addresses[0];
  let address: string | null = null;
  if (currentAddr) {
    const parts = [
      currentAddr.street,
      currentAddr.buildingNumber,
    ].filter(Boolean);
    const postPart = currentAddr.postOffices?.[0];
    if (currentAddr.postCode || postPart?.city) {
      parts.push([currentAddr.postCode, postPart?.city].filter(Boolean).join(" "));
    }
    address = parts.join(", ") || null;
  }

  // Company form
  const forms = company.companyForms || [];
  const currentForm = forms.find((f: any) => !f.endDate) || forms[0];
  const formDesc =
    currentForm?.descriptions?.find((d: any) => d.languageCode === "3")?.description ||
    currentForm?.descriptions?.[0]?.description ||
    "";

  // Main business line
  const mainLine = company.mainBusinessLine;
  const industryCode = mainLine?.type || null;
  const industryDesc =
    mainLine?.descriptions?.find((d: any) => d.languageCode === "3")?.description ||
    mainLine?.descriptions?.[0]?.description ||
    null;

  // Status from companySituations and tradeRegisterStatus
  const situations = company.companySituations || [];
  const hasLiquidation = situations.some((s: any) => !s.endDate);
  const trStatus = company.tradeRegisterStatus;

  return {
    company_name: currentName?.name || "",
    business_id: company.businessId?.value || businessId,
    business_type: formDesc,
    industry_code: industryCode,
    industry_description: industryDesc,
    address,
    registration_date: company.registrationDate || company.businessId?.registrationDate || null,
    website: company.website?.url || null,
    status: hasLiquidation ? "liquidation" : trStatus === "1" ? "active" : "inactive",
    vat_number: deriveVatFI(company.businessId?.value || businessId),
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
      source_url: `${PRH_API}?businessId=${encodeURIComponent(businessId)}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${PRH_API}?businessId=${encodeURIComponent(businessId)}`,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Lähde: Patentti- ja rekisterihallitus (PRH)",
      source_note:
        "PRH/YTJ open data is published under Creative Commons Attribution 4.0 (CC BY 4.0) per avoindata.suomi.fi. Designated as an EU High-Value Dataset under Reg. (EU) 2023/138.",
    },
  };
});
