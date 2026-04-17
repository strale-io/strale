import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatCZ } from "../lib/vat-derivation.js";
import { normalizeIco, isValidIcoChecksum } from "../lib/cz-validation.js";

// ARES — Administrativní registr ekonomických subjektů (Czech Ministry of Finance)
const ARES_API = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

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

  const data = await fetchByIco(ico);

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
    },
    provenance: {
      source: "ares.gov.cz",
      fetched_at: new Date().toISOString(),
    },
  };
});
