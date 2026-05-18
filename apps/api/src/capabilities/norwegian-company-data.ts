import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatNO } from "../lib/vat-derivation.js";
import {
  brregProvenance,
  fetchBrregEntity,
  fetchBrregRoles,
  findOrgNumberInText,
  isOrgNumber,
  searchBrregByName,
  type BrregRollerResponse,
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

interface LegalRepresentative {
  type: "person" | "organisation";
  name: string;
  role: string;
  role_code: string;
  role_group: string;
  date_of_birth: string | null;
}

// Brreg role-group codes map to Strale canonical role labels. STYR (board)
// uses sub-codes per member; DAGL/SIGN/PROK use a single role per group.
// Unmapped sub-codes fall back to beskrivelse for forward-compatibility.
const STYR_ROLE_LABELS: Record<string, string> = {
  LEDE: "Chair of the board",
  NEST: "Deputy chair of the board",
  MEDL: "Board member",
  VARA: "Alternate board member",
  OBS: "Observer",
};

function shapeRepresentatives(roles: BrregRollerResponse): LegalRepresentative[] {
  const out: LegalRepresentative[] = [];
  for (const group of roles.rollegrupper ?? []) {
    const groupCode = group.type?.kode ?? "";
    for (const r of group.roller ?? []) {
      if (r.fratraadt || r.avregistrert) continue;
      const subCode = r.type?.kode ?? "";
      const subBeskrivelse = r.type?.beskrivelse ?? "";
      const isOrg = !!r.enhet && !r.person;
      const personName = r.person?.navn
        ? [r.person.navn.fornavn, r.person.navn.mellomnavn, r.person.navn.etternavn]
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";
      const name = isOrg ? (r.enhet?.navn ?? "") : personName;
      if (!name) continue;
      let role = subBeskrivelse || subCode;
      if (groupCode === "STYR" && STYR_ROLE_LABELS[subCode]) {
        role = STYR_ROLE_LABELS[subCode];
      }
      out.push({
        type: isOrg ? "organisation" : "person",
        name,
        role,
        role_code: subCode,
        role_group: groupCode,
        date_of_birth: r.person?.fodselsdato ?? null,
      });
    }
  }
  return out;
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

  const [data, roles] = await Promise.all([
    fetchBrregEntity(orgNumber),
    fetchBrregRoles(orgNumber),
  ]);
  const output = shapeBrregOutput(data);
  const representatives = shapeRepresentatives(roles);

  // Evidence Tier framework labels + Tier 1 canonical aliases (DEC-20260518-A).
  // Resolves alias keys at runtime; only sets a canonical if not already present.
  {
    const o = output as Record<string, unknown>;
    if (o.legal_name === undefined) o.legal_name = (o.company_name ?? o.name);
    if (o.primary_registration_id === undefined) o.primary_registration_id = (o.company_number ?? o.registration_number ?? o.uen ?? o.fn_number ?? o.ico ?? o.krs_number ?? o.org_number ?? o.cnpj ?? o.reg_number);
    if (o.status === undefined) {
    if (typeof o.company_status === "string") o.status = o.company_status;
    else if (o.is_active === true || o.active === true) o.status = "active";
    else if (o.is_active === false || o.active === false) o.status = "inactive";
  }
    if (o.legal_form === undefined) o.legal_form = (o.business_type ?? o.company_type ?? o.entity_type ?? o.legal_form_code ?? o.legal_form_id);
    if (o.registered_address === undefined) o.registered_address = (o.address ?? o.office_address);
    if (o.date_incorporated === undefined) o.date_incorporated = (o.incorporation_date ?? o.registered_date ?? o.registration_date ?? o.founded ?? o.uen_issue_date ?? o.registered_at);
    o.legal_representatives = representatives;
    o.total_legal_representatives = representatives.length;
    o.tier_2_available = representatives.length > 0;
    o.tier_2_available_reason = representatives.length > 0
      ? "Legal representatives extracted from Brønnøysundregistrene (Brreg) /roller endpoint — board, managing director, signatories, procurists."
      : "Brreg /roller returned no active roles for this entity; tier_2 not bindable on this record.";
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
