import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatDK } from "../lib/vat-derivation.js";

// CVR API — Danish Central Business Register
// NOTE: cvrapi.dk free tier has aggressive quota limits that trigger QUOTA_EXCEEDED
// on moderate usage. Long-term fix: apply for official datacvr.virk.dk API access
// via https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data
// Contact: cvrselvbetjening@erst.dk
const CVR_API = "https://cvrapi.dk/api";

// Danish CVR numbers: 8 digits
const CVR_RE = /^\d{8}$/;

function isCvrNumber(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return CVR_RE.test(cleaned) ? cleaned : null;
}

function findCvrNumber(input: string): string | null {
  const match = input.match(/\d{8}/);
  if (!match) return null;
  return isCvrNumber(match[0]);
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
        content: `Extract the Danish company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${naturalLanguage}"`,
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

async function fetchCompany(
  query: { cvr?: string; name?: string },
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ country: "dk" });
  if (query.cvr) params.set("vat", query.cvr);
  else if (query.name) params.set("search", query.name);

  const url = `${CVR_API}?${params}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Strale/1.0 (hello@strale.io) danish-company-data",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    throw new Error(`No Danish company found for query: ${JSON.stringify(query)}.`);
  }
  if (response.status === 429) {
    throw new Error("The Danish business registry (cvrapi.dk) is temporarily rate-limiting requests. Please try again in a few minutes.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`The Danish business registry (cvrapi.dk) denied the request (HTTP ${response.status}). This is an authentication or access-control issue, not a transient error.`);
  }
  if (response.status >= 500) {
    throw new Error(`The Danish business registry (cvrapi.dk) returned a server error (HTTP ${response.status}). This is usually transient — please try again in a few minutes.`);
  }
  if (!response.ok) {
    throw new Error(`The Danish business registry (cvrapi.dk) returned an unexpected response (HTTP ${response.status}).`);
  }

  const data = await response.json() as any;
  if (!data || data.error) {
    const rawErr = data?.error || "";
    if (/quota/i.test(rawErr) || /limit/i.test(rawErr)) {
      throw new Error("The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours.");
    }
    throw new Error(rawErr || `No Danish company found for query: ${JSON.stringify(query)}.`);
  }

  const address = [data.address, [data.zipcode, data.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return {
    company_name: data.name || "",
    cvr_number: String(data.vat || ""),
    business_type: data.companydesc || "",
    industry_code: data.industrycode?.toString() || null,
    industry_description: data.industrydesc || null,
    address,
    start_date: data.startdate || null,
    employee_range: data.employees || null,
    status: data.enddate ? "ceased" : "active",
    vat_number: deriveVatDK(String(data.vat || "")),
  };
}

registerCapability("danish-company-data", async (input: CapabilityInput) => {
  const rawInput = (input.cvr_number as string) ?? (input.org_number as string) ?? (input.company_number as string) ?? "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error("'cvr_number' is required. Provide a Danish CVR number (8 digits) or company name.");
  }

  const trimmed = rawInput.trim();
  const cvrNumber = isCvrNumber(trimmed) ?? findCvrNumber(trimmed);

  let output: Record<string, unknown>;
  if (cvrNumber) {
    output = await fetchCompany({ cvr: cvrNumber });
  } else {
    const companyName = await extractCompanyName(trimmed);
    output = await fetchCompany({ name: companyName });
  }

  const cvrForRef = (output.cvr_number as string) || "";
  const primarySourceUrl = cvrForRef
    ? `https://datacvr.virk.dk/enhed/virksomhed/${cvrForRef}`
    : "https://datacvr.virk.dk/";

  return {
    output,
    provenance: {
      source: "cvrapi.dk",
      source_url: "https://cvrapi.dk/",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_aggregation" as const,
      upstream_vendor: "cvrapi.dk",
      primary_source_reference: primarySourceUrl,
      attribution:
        "Data sourced from cvrapi.dk, a third-party JSON wrapper of the Danish Central Business Register (CVR). Underlying records are public-register data from Erhvervsstyrelsen (Danish Business Authority).",
      source_note:
        "Tier-2 vendor-mediated public records (DEC-20260428-A). cvrapi.dk's redistribution terms are not formally published; CVR basic company data is on the EU High-Value Datasets list (Reg. (EU) 2023/138). Migration to direct datacvr.virk.dk system-to-system access is queued.",
    },
  };
});
