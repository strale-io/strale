import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatNO } from "../lib/vat-derivation.js";
import {
  brregProvenance,
  fetchBrregEntity,
  findOrgNumberInText,
  isOrgNumber,
  searchBrregByName,
} from "../lib/brreg-fetch.js";

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

function shapeBrregOutput(data: Record<string, unknown>): Record<string, unknown> {
  const addr = (data.forretningsadresse as Record<string, unknown>)
    || (data.postadresse as Record<string, unknown>)
    || {};
  const address = [
    ...(((addr as { adresse?: string[] }).adresse ?? []) as string[]),
    [(addr as { postnummer?: string }).postnummer, (addr as { poststed?: string }).poststed].filter(Boolean).join(" "),
    (addr as { land?: string }).land,
  ]
    .filter(Boolean)
    .join(", ");

  const orgForm = data.organisasjonsform as { beskrivelse?: string } | undefined;
  const naeringskode = data.naeringskode1 as { kode?: string; beskrivelse?: string } | undefined;
  const orgNo = String(data.organisasjonsnummer ?? "");

  return {
    company_name: (data.navn as string) || "",
    org_number: orgNo,
    business_type: orgForm?.beskrivelse || "",
    industry_code: naeringskode?.kode || null,
    industry_description: naeringskode?.beskrivelse || null,
    address,
    registration_date: (data.registreringsdatoEnhetsregisteret as string) || null,
    employee_count: (data.antallAnsatte as number) ?? null,
    status: data.konkurs ? "bankrupt" : data.underAvvikling ? "dissolving" : "active",
    vat_number: deriveVatNO(orgNo),
  };
}

registerCapability("norwegian-company-data", async (input: CapabilityInput) => {
  const rawInput = (input.org_number as string) ?? (input.company_number as string) ?? "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error("'org_number' is required. Provide a Norwegian org number (9 digits) or company name.");
  }

  const trimmed = rawInput.trim();
  let orgNumber = isOrgNumber(trimmed) ?? findOrgNumberInText(trimmed);

  if (!orgNumber) {
    const companyName = await extractCompanyName(trimmed);
    orgNumber = await searchBrregByName(companyName);
  }

  const data = await fetchBrregEntity(orgNumber);
  const output = shapeBrregOutput(data);

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
    o.ubo_availability_reason = "Norwegian UBO register implementation delayed; not operational at v1";
  }

  return {
    output,
    provenance: {
      ...brregProvenance(orgNumber),
      source_note:
        "Norsk lisens for offentlige data (NLOD) 2.0. Brreg basic company data is on Norway's national high-value-dataset list.",
    },
  };
});
