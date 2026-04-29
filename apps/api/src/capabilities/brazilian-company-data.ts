import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Brazilian company data via ReceitaWS, a third-party JSON wrapper of the
 * official Receita Federal CNPJ register.
 *
 * acquisition_method: vendor_aggregation. ReceitaWS re-publishes public
 * register data; underlying records are statutory public records published
 * by the Receita Federal do Brasil.
 *
 * Long-term migration target: direct ingest of Receita Federal's published
 * CNPJ open-data files (full bulk dataset on dados.gov.br). Tracked
 * separately when BR enters v1.x scope.
 */
const RECEITAWS_API = "https://receitaws.com.br/v1/cnpj";

// CNPJ: 14 digits (formatted: xx.xxx.xxx/xxxx-xx)
const CNPJ_RE = /^\d{14}$/;

function findCnpj(input: string): string | null {
  const cleaned = input.replace(/[\s.\-/]/g, "");
  if (CNPJ_RE.test(cleaned)) return cleaned;
  const match = input.replace(/[\s]/g, "").match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  if (match) return match[0].replace(/[\.\-/]/g, "");
  return null;
}

async function extractCompanyName(text: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract the Brazilian company name from this request. Return ONLY the company name, nothing else.\n\nRequest: "${text}"` }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  if (!name) throw new Error(`Could not identify a company name from: "${text}".`);
  return name;
}

async function fetchByCnpj(cnpj: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${RECEITAWS_API}/${cnpj}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`ReceitaWS returned HTTP ${response.status}`);
  const data = (await response.json()) as any;

  if (data.status === "ERROR") {
    throw new Error(data.message || `CNPJ ${cnpj} not found.`);
  }

  const address = [
    data.logradouro,
    data.numero,
    data.complemento,
    data.bairro,
    [data.cep, data.municipio].filter(Boolean).join(" "),
    data.uf,
  ].filter(Boolean).join(", ");

  return {
    company_name: data.nome || "",
    trade_name: data.fantasia || null,
    cnpj: data.cnpj || cnpj,
    type: data.tipo || null,
    status: data.situacao || null,
    address,
    opening_date: data.abertura || null,
    legal_nature: data.natureza_juridica || null,
    size: data.porte || null,
    share_capital: data.capital_social || null,
    activity_codes: (data.atividade_principal || []).map((a: any) => ({
      code: a.code,
      description: a.text,
    })),
    partners: (data.qsa || []).map((q: any) => ({
      name: q.nome,
      role: q.qual,
    })),
  };
}

registerCapability("brazilian-company-data", async (input: CapabilityInput) => {
  const raw = (input.cnpj as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'cnpj' is required. Provide a CNPJ number (14 digits). Name search is not supported — use a CNPJ.");
  }

  const trimmed = raw.trim();
  const cnpj = findCnpj(trimmed);

  if (!cnpj) {
    throw new Error("A valid CNPJ number is required (14 digits, e.g. 11222333000181). Name search is not supported by ReceitaWS.");
  }

  const output = await fetchByCnpj(cnpj);

  return {
    output,
    provenance: {
      source: "receitaws.com.br",
      source_url: "https://receitaws.com.br/",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_aggregation" as const,
      upstream_vendor: "receitaws.com.br",
      primary_source_reference: `https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cadastros/cnpj/${cnpj}`,
      attribution:
        "Data sourced from ReceitaWS, a third-party JSON wrapper of the Brazilian Receita Federal CNPJ register. Underlying records are statutory public records published by Receita Federal do Brasil.",
      source_note:
        "Tier-2 vendor-mediated public records (DEC-20260428-A). Long-term migration to first-party ingest of Receita Federal CNPJ open data (dados.gov.br) is queued for when BR enters v1.x scope.",
    },
  };
});
