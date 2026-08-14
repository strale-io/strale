import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatCZ } from "../lib/vat-derivation.js";
import { normalizeIco, isValidIcoChecksum } from "../lib/cz-validation.js";

// ARES — Administrativní registr ekonomických subjektů (Czech Ministry of Finance)
const ARES_API = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
// VR (Veřejný rejstřík / Public Register) view — adds statutarniOrgany with
// full member detail (name, DOB, nationality, role, dates). The BE (basic
// entity) view above doesn't carry person records; both views share the same
// path prefix and ICO key.
const ARES_VR_API = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr";

type AresResponse = {
  ico: string;
  obchodniJmeno: string;
  sidlo?: { textovaAdresa?: string };
  pravniForma?: string;
  pravniFormaRos?: string;
  datumVzniku?: string;
  datumAktualizace?: string;
  dic?: string;
  czNace2008?: string[];
  primarniZdroj?: string;
  seznamRegistraci?: Record<string, string>;
};

interface AresVrPerson {
  jmeno?: string;
  prijmeni?: string;
  datumNarozeni?: string;
  statniObcanstvi?: string;
}
interface AresVrClen {
  datumZapisu?: string;
  datumVymazu?: string;
  typAngazma?: string;
  nazevAngazma?: string;
  clenstvi?: {
    clenstvi?: { vznikClenstvi?: string; zanikClenstvi?: string };
    funkce?: { nazev?: string; vznikFunkce?: string; zanikFunkce?: string };
  };
  fyzickaOsoba?: AresVrPerson;
  pravnickaOsoba?: { obchodniJmeno?: string; ico?: string };
}
interface AresVrOrgan {
  nazevOrganu?: string;
  clenoveOrganu?: AresVrClen[];
}
interface AresVrZaznam {
  primarniZaznam?: boolean;
  statutarniOrgany?: AresVrOrgan[];
  zpusobJednani?: Array<{ datumVymazu?: string; zpusobJednani?: string }>;
}
interface AresVrResponse {
  icoId?: string;
  zaznamy?: AresVrZaznam[];
}

interface LegalRepresentative {
  type: "person" | "organisation";
  name: string;
  role: string;
  role_code: string;
  role_group: string;
  date_of_birth: string | null;
  nationality: string | null;
  start_date: string | null;
}

type AresSearchResponse = {
  pocetCelkem: number;
  ekonomickeSubjekty: Array<{ ico: string; obchodniJmeno: string }>;
};

async function resolveNameToIco(name: string): Promise<string> {
  const resp = await fetch(`${ARES_API}/vyhledat`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify({ obchodniJmeno: name, start: 0, pocet: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`ARES search returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as AresSearchResponse;
  if (!data.ekonomickeSubjekty || data.ekonomickeSubjekty.length === 0) {
    throw new Error(`No Czech company found matching "${name}".`);
  }
  return data.ekonomickeSubjekty[0].ico;
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
        content: `Extract the Czech company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${naturalLanguage}"`,
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

async function fetchByIco(ico: string): Promise<AresResponse> {
  const resp = await fetch(`${ARES_API}/${ico}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (resp.status === 404) {
    throw new Error(`Czech company with IČO ${ico} not found in ARES.`);
  }
  if (!resp.ok) {
    throw new Error(`ARES returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as AresResponse;
}

// VR view fetch is opportunistic — many ekonomické subjekty (sole traders,
// associations, foreign branches) are not in the public commercial register
// at all, so a 404 here just means "no statutory body data, surface T2 as
// unavailable on this record." Other non-OK statuses surface as a warning
// but do not fail the whole call.
async function fetchVrByIco(ico: string): Promise<AresVrResponse | null> {
  try {
    const resp = await fetch(`${ARES_VR_API}/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 404) return null;
    if (!resp.ok) return null;
    return (await resp.json()) as AresVrResponse;
  } catch {
    return null;
  }
}

function shapeRepresentatives(vr: AresVrResponse | null): {
  representatives: LegalRepresentative[];
  signing_authority: string | null;
} {
  if (!vr || !vr.zaznamy || vr.zaznamy.length === 0) {
    return { representatives: [], signing_authority: null };
  }
  const primary = vr.zaznamy.find((z) => z.primarniZaznam) ?? vr.zaznamy[0];
  const out: LegalRepresentative[] = [];
  for (const organ of primary.statutarniOrgany ?? []) {
    const groupName = organ.nazevOrganu ?? "Statutární orgán";
    for (const c of organ.clenoveOrganu ?? []) {
      // datumVymazu on the membership-row means the entry is no longer in
      // the register (historical). zanikClenstvi on clenstvi means the
      // membership itself has ended. Both indicate not-currently-active.
      if (c.datumVymazu) continue;
      if (c.clenstvi?.clenstvi?.zanikClenstvi) continue;
      const fo = c.fyzickaOsoba;
      const po = c.pravnickaOsoba;
      const isOrg = !!po && !fo;
      const personName = fo
        ? [fo.jmeno, fo.prijmeni].filter(Boolean).join(" ").trim()
        : "";
      const name = isOrg ? (po?.obchodniJmeno ?? "") : personName;
      if (!name) continue;
      const roleName =
        c.clenstvi?.funkce?.nazev ?? c.nazevAngazma ?? groupName;
      out.push({
        type: isOrg ? "organisation" : "person",
        name,
        role: roleName,
        role_code: c.typAngazma ?? "",
        role_group: groupName,
        date_of_birth: fo?.datumNarozeni ?? null,
        nationality: fo?.statniObcanstvi ?? null,
        start_date:
          c.clenstvi?.funkce?.vznikFunkce ??
          c.clenstvi?.clenstvi?.vznikClenstvi ??
          null,
      });
    }
  }
  // Company-level signing rule (způsob jednání) — pick the currently active
  // entry (no datumVymazu). Falls back to null when unset on the record.
  const signing = (primary.zpusobJednani ?? []).find((z) => !z.datumVymazu);
  return {
    representatives: out,
    signing_authority: signing?.zpusobJednani ?? null,
  };
}

function deriveStatus(reg: Record<string, string> | undefined): string {
  if (!reg) return "unknown";
  const ros = reg.stavZdrojeRos;
  if (!ros) return "unknown";
  if (ros === "AKTIVNI") return "active";
  if (ros === "ZANIKLY") return "dissolved";
  return ros.toLowerCase();
}

registerCapability("cz-company-data", async (input: CapabilityInput) => {
  const rawInput = ((input.ico as string) ?? (input.company_number as string) ?? (input.company_name as string) ?? "").trim();
  if (!rawInput) {
    throw new Error("'ico' is required. Provide a Czech IČO (8 digits) or company name.");
  }

  const normalized = normalizeIco(rawInput);
  let ico: string;
  if (normalized && isValidIcoChecksum(normalized)) {
    ico = normalized;
  } else if (/^\d+$/.test(rawInput.replace(/[\s.-]/g, ""))) {
    throw new Error(
      `'${rawInput}' is not a valid IČO (checksum failed). Czech IČO is 8 digits with mod-11 check.`,
    );
  } else {
    const name = await extractCompanyName(rawInput);
    ico = await resolveNameToIco(name);
  }

  const [data, vr] = await Promise.all([fetchByIco(ico), fetchVrByIco(ico)]);
  const { representatives, signing_authority } = shapeRepresentatives(vr);

  return {
    output: {
      ico: data.ico,
      company_name: data.obchodniJmeno ?? "",
      address: data.sidlo?.textovaAdresa ?? "",
      legal_form_code: data.pravniForma ?? null,
      vat_number: data.dic ?? deriveVatCZ(data.ico),
      nace_codes: data.czNace2008 ?? [],
      registration_date: data.datumVzniku ?? null,
      last_updated: data.datumAktualizace ?? null,
      status: deriveStatus(data.seznamRegistraci),
      primary_source: data.primarniZdroj ?? null,
      jurisdiction: "CZ",
      // Evidence Tier 1 canonical aliases (DEC-20260518-A)
      legal_name: data.obchodniJmeno ?? "",
      primary_registration_id: data.ico,
      legal_form: data.pravniForma ?? null,
      registered_address: data.sidlo?.textovaAdresa ?? "",
      date_incorporated: data.datumVzniku ?? null,
      legal_representatives: representatives,
      total_legal_representatives: representatives.length,
      signing_authority,
      // Evidence Tier framework labels (DEC-20260518-A)
      tier_2_available: representatives.length > 0,
      tier_2_available_reason:
        representatives.length > 0
          ? "Legal representatives extracted from ARES Veřejný rejstřík (statutární orgán + prokura); excludes supervisory boards (dozorčí rada) which do not legally represent the company."
          : "ARES VR view returned no active statutory body members for this entity (likely sole trader / association / foreign branch not in the commercial register); tier_2 not bindable on this record.",
      ubo_availability: "restricted",
      ubo_availability_reason: "UBO evidence register access restricted to AML-obliged entities post-CJEU 2022",
    },
    provenance: {
      source: "ares.gov.cz",
      source_url: `${ARES_API}/${ico}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${ARES_API}/${ico}`,
      attribution:
        "Zdroj: Administrativní registr ekonomických subjektů (ARES), Ministerstvo financí ČR.",
      source_note:
        "ARES is a Czech Ministry of Finance public registry; basic company data is designated as an EU High-Value Dataset under Reg. (EU) 2023/138. Specific reuse-licence text is not declared on the API; see ares.gov.cz for current terms.",
    },
  };
});
