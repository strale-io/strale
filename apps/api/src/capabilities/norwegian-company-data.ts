import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatNO } from "../lib/vat-derivation.js";

// Brønnøysundregistrene public API (data.brreg.no)
const BRREG_API = "https://data.brreg.no/enhetsregisteret/api";

// Norwegian org numbers: 9 digits
const ORG_NUMBER_RE = /^\d{9}$/;

function isOrgNumber(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  return ORG_NUMBER_RE.test(cleaned) ? cleaned : null;
}

function findOrgNumber(input: string): string | null {
  const match = input.match(/\d{9}/);
  if (!match) return null;
  return isOrgNumber(match[0]);
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
        content: `Extract the Norwegian company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${naturalLanguage}"`,
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

async function searchBrreg(name: string): Promise<string> {
  const url = `${BRREG_API}/enheter?navn=${encodeURIComponent(name)}&size=1`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Brønnøysundregistrene search returned HTTP ${response.status}`);
  const data = await response.json() as any;
  const entities = data?._embedded?.enheter;
  if (!entities || entities.length === 0) {
    throw new Error(`No Norwegian company found matching "${name}".`);
  }
  return String(entities[0].organisasjonsnummer);
}

async function fetchCompany(orgNumber: string): Promise<Record<string, unknown>> {
  const url = `${BRREG_API}/enheter/${orgNumber}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) {
    throw new Error(`Norwegian company with org number ${orgNumber} not found.`);
  }
  if (!response.ok) throw new Error(`Brønnøysundregistrene returned HTTP ${response.status}`);
  const data = await response.json() as any;

  const addr = data.forretningsadresse || data.postadresse || {};
  const address = [
    ...(addr.adresse || []),
    [addr.postnummer, addr.poststed].filter(Boolean).join(" "),
    addr.land,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    company_name: data.navn || "",
    org_number: String(data.organisasjonsnummer),
    business_type: data.organisasjonsform?.beskrivelse || "",
    industry_code: data.naeringskode1?.kode || null,
    industry_description: data.naeringskode1?.beskrivelse || null,
    address,
    registration_date: data.registreringsdatoEnhetsregisteret || null,
    employee_count: data.antallAnsatte ?? null,
    status: data.konkurs ? "bankrupt" : data.underAvvikling ? "dissolving" : "active",
    vat_number: deriveVatNO(String(data.organisasjonsnummer)),
  };
}

registerCapability("norwegian-company-data", async (input: CapabilityInput) => {
  const rawInput = (input.org_number as string) ?? (input.company_number as string) ?? "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error("'org_number' is required. Provide a Norwegian org number (9 digits) or company name.");
  }

  const trimmed = rawInput.trim();
  let orgNumber = isOrgNumber(trimmed) ?? findOrgNumber(trimmed);

  if (!orgNumber) {
    const companyName = await extractCompanyName(trimmed);
    orgNumber = await searchBrreg(companyName);
  }

  const output = await fetchCompany(orgNumber);

  return {
    output,
    provenance: {
      source: "data.brreg.no",
      fetched_at: new Date().toISOString(),
    },
  };
});
