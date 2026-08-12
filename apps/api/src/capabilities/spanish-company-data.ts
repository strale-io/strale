// Spain — OpenMercantil.es (Tier-2 vendor aggregation of BORME).
//
// v3 (2026-08-12): REPLACES the Openapi ES-Advanced path, which had been
// deactivated in prod (is_active=false, lifecycle degraded — the ES
// solutions' step-1 threw on every call). OpenMercantil is a normalized
// database accumulated from the official BORME gazette (Agencia Estatal
// BOE): free tier 200 req/day without auth, officers ("cargos") included —
// the leg Openapi ES-Advanced never carried.
//
// DEC-20260428-A Tier 2 compliance:
//   - underlying data is statutorily public (BORME, Ley 37/2007 reuse)
//   - vendor publishes machine-readable licence + attribution requirements
//     in-band (_source_catalog on every response; verified live 2026-08-12)
//   - provenance carries upstream_vendor + vendor_aggregation +
//     primary_source_reference to the BORME
//   - per-act registral references (S/H/I-A data) are preserved in events
//
// Known coverage honesty: BORME-derived coverage effectively starts 2009;
// companies with no BORME activity since then (verified: Inditex/A15075062)
// are ABSENT. Refuse, never guess — documented as a manifest limitation.

import { registerCapability, type CapabilityInput } from "./index.js";
import { firstString } from "./lib/input-aliases.js";
import { classifyNameMatch } from "../lib/company-name-match.js";
import { logWarn } from "../lib/log.js";

const OM_API = "https://openmercantil.es/api/v1";

// CIF/NIF canonical: 1 letter + 7 digits + 1 check char (letter or digit).
const ES_NIF_RE = /^[A-Z]\d{7}[A-Z0-9]$/;

// Trailing Spanish legal forms, stripped LOCALLY before scoring so
// "Banco Santander" matches "BANCO SANTANDER SA". Deliberately not added to
// the shared CORP_SUFFIX_RE: bare "sl" as a global token would eat leading
// words in real names ("SL Industries") — the same failure class that kept
// "kg"/"ev" out of the shared regex.
const ES_LEGAL_FORM_TAIL_RE =
  /[,\s]+(s\.?\s?a\.?u?|s\.?\s?l\.?u?|s\.?\s?l\.?l|s\.?\s?coop(?:erativa)?|s\.?\s?com|a\.?\s?i\.?\s?e|s\.?\s?c\.?\s?p)\.?\s*$/i;

function normaliseEsIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  const stripped = cleaned.startsWith("ES") ? cleaned.slice(2) : cleaned;
  return ES_NIF_RE.test(stripped) ? stripped : null;
}

function stripEsLegalForm(name: string): string {
  return name.replace(ES_LEGAL_FORM_TAIL_RE, "").trim();
}

// BORME cargo → canonical role_group (EE vocabulary; shared enum queued).
function roleGroupFor(role: string): string {
  const r = role.toLowerCase();
  if (/liquidador/.test(r)) return "liquidation";
  if (/apoderad/.test(r)) return "procuration";
  if (/adm|consejer|president|vicepresident|secretari/.test(r)) return "management_board";
  return "other";
}

// Corporate officers (auditor firms, corporate administrators) are companies.
// Heuristic, with the documented false-positive tolerance of the cypriot
// type-tag precedent; covers abbreviations AND spelled-out legal forms.
function officerType(name: string): "person" | "organisation" {
  const n = name.trim();
  return ES_LEGAL_FORM_TAIL_RE.test(` ${n}`) ||
    /\b(S\.?A\.?U?|S\.?L\.?U?|SLU|COOP|SOCIEDAD\s+(ANONIMA|LIMITADA|COOPERATIVA))\.?$/i.test(n)
    ? "organisation"
    : "person";
}

interface OmSearchItem {
  slug?: string;
  name?: string;
  cif?: string;
  province?: string;
}

interface OmCompanyResponse {
  company?: {
    slug?: string;
    name?: string;
    cif?: string;
    company_type?: string;
    status?: string;
    address?: string;
    date_creation?: string;
    aliases?: string[];
  };
  kpis?: { acts_count?: number; first_seen?: string; last_seen?: string; province_count?: number };
  top_provinces?: Array<{ province?: string; count?: number }>;
  officers?: {
    current?: Array<{ name?: string; role?: string; since?: string }>;
  };
  events?: Array<{
    id?: string;
    date?: string;
    type?: string;
    province?: string;
    details?: string; // carries the per-act registral reference (Sección/Hoja/Inscripción)
  }>;
  _attributions?: Record<string, string>;
}

async function omFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${OM_API}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429) {
    throw new Error(
      "OpenMercantil free-tier daily quota (200 requests) exhausted — retry after the daily reset.",
    );
  }
  if (!res.ok) throw new Error(`OpenMercantil API returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function omSearch(query: string): Promise<OmSearchItem[]> {
  const data = await omFetch<{ count?: number; items?: OmSearchItem[] }>(
    `/search?q=${encodeURIComponent(query)}`,
  );
  return data.items ?? [];
}

async function resolveByNif(nif: string): Promise<string> {
  const items = await omSearch(nif);
  const hit = items.find((i) => (i.cif ?? "").toUpperCase() === nif);
  if (!hit?.slug) {
    if (items.length > 0) {
      // The search matched records but none carries this CIF — a vendor
      // data-shape case, not a coverage gap; don't blame the coverage window.
      throw new Error(
        `The BORME-derived register returned candidates for "${nif}" but none with that exact CIF. ` +
          `Try the company name instead.`,
      );
    }
    throw new Error(
      `No Spanish company found for CIF/NIF ${nif} in the BORME-derived register. ` +
        `Coverage starts with 2009 BORME activity — long-inactive registrations may be absent.`,
    );
  }
  return hit.slug;
}

async function resolveByName(name: string): Promise<string> {
  const items = (await omSearch(name)).filter((i) => i.slug && i.name);
  if (items.length === 0) {
    throw new Error(
      `No Spanish company found matching "${name}". Provide the CIF/NIF ` +
        `(e.g. A28015865) for an exact lookup.`,
    );
  }
  // Score against the registered name with and without its trailing legal
  // form; exact wins, unique high is the floor, ties are refused — a wrong
  // company from a KYB lookup is worse than no answer.
  const exact = new Map<string, string>();
  const high = new Map<string, string>();
  for (const it of items) {
    const candidates = [it.name!, stripEsLegalForm(it.name!)];
    let best: "exact" | "high" | null = null;
    for (const c of candidates) {
      const { match_confidence } = classifyNameMatch(name, c);
      if (match_confidence === "exact") best = "exact";
      else if (match_confidence === "high" && best !== "exact") best = "high";
    }
    if (best === "exact") {
      exact.set(it.slug!, it.name!);
      high.delete(it.slug!);
    } else if (best === "high" && !exact.has(it.slug!)) {
      high.set(it.slug!, it.name!);
    }
  }
  const pick = (bucket: Map<string, string>, label: string): string => {
    if (bucket.size === 1) return bucket.keys().next().value!;
    const listing = [...bucket.entries()].slice(0, 5).map(([s, n]) => `${n} (${s})`).join("; ");
    throw new Error(
      `Ambiguous Spanish company name "${name}": ${bucket.size} distinct registered entities ` +
        `are ${label} matches — ${listing}. Provide the CIF/NIF to disambiguate.`,
    );
  };
  if (exact.size > 0) return pick(exact, "exact");
  if (high.size > 0) return pick(high, "close");
  const sample = items.slice(0, 3).map((i) => i.name).join(", ");
  throw new Error(
    `No confident Spanish registry match for "${name}" (closest: ${sample}). ` +
      `Provide the CIF/NIF (e.g. A28015865) for an exact lookup.`,
  );
}

registerCapability("spanish-company-data", async (input: CapabilityInput) => {
  const rawInput = firstString(
    input,
    "nif", "cif", "vat_number", "identifier",
    "company_name", "name", "query", "task",
  );
  if (!rawInput) {
    throw new Error(
      "A Spanish company identifier or name is required. Provide 'nif'/'cif' " +
        "(letter + 7 digits + check char, e.g. A28015865; ES-prefixed VAT accepted) " +
        "or 'company_name'. Aliases accepted: vat_number, identifier, name, query, task.",
    );
  }
  const trimmed = rawInput.trim();
  if (trimmed.length < 2) {
    throw new Error("Input must be at least 2 characters.");
  }

  const nif = normaliseEsIdentifier(trimmed);
  const slug = nif ? await resolveByNif(nif) : await resolveByName(trimmed);

  const data = await omFetch<OmCompanyResponse>(`/company/${encodeURIComponent(slug)}`);
  const c = data.company ?? {};
  if (!c.name) {
    throw new Error("OpenMercantil returned an unexpected company shape (no name).");
  }

  const officersRaw = data.officers?.current;
  const representatives = Array.isArray(officersRaw)
    ? officersRaw
        .filter((o) => typeof o.name === "string" && o.name.trim())
        .map((o) => ({
          type: officerType(o.name!),
          name: o.name!.trim(),
          role: o.role ?? "Cargo",
          role_code: null,
          role_group: roleGroupFor(o.role ?? ""),
          start_date: o.since ?? null,
          date_of_birth: null,
        }))
    : null;
  if (representatives === null) {
    logWarn("es-officers", "OpenMercantil response carried no officers block", { slug });
  }

  const statusRaw = c.status ?? null;
  // Normalized cross-country status enum (active/inactive/unknown) with the
  // native Spanish value preserved in status_raw.
  const status = statusRaw === "Activa"
    ? "active"
    : statusRaw && /extinguid|baja|disuelt|cerrad|liquidad/i.test(statusRaw)
      ? "inactive"
      : statusRaw
        ? "unknown"
        : null;
  const output: Record<string, unknown> = {
    company_name: c.name,
    nif: c.cif ?? nif ?? null,
    vat_number: c.cif ? `ES${c.cif}` : null,
    company_type: c.company_type ?? null,
    status,
    status_raw: statusRaw,
    address: c.address?.trim() ? c.address : null,
    province: data.top_provinces?.[0]?.province ?? null,
    registration_date: c.date_creation?.trim() ? c.date_creation : null,
    first_borme_activity: data.kpis?.first_seen ?? null,
    last_borme_activity: data.kpis?.last_seen ?? null,
    borme_acts_count: data.kpis?.acts_count ?? null,
    // null (not []) when the response carried no officers block: "no
    // officers" is an affirmative claim this response cannot make then.
    legal_representatives: representatives,
    total_legal_representatives: representatives?.length ?? null,
    // Per-fact primary-source provenance (DEC-20260428-A Tier 2): the most
    // recent BORME acts with their registral references, so every officer or
    // status fact can be traced to a specific gazette publication.
    recent_borme_acts: (data.events ?? []).slice(0, 5).map((e) => ({
      date: e.date ?? null,
      type: e.type ?? null,
      province: e.province ?? null,
      registral_reference: e.details ?? null,
    })),
    jurisdiction: "ES",
  };

  // Evidence Tier canonical aliases + honest Tier-2/UBO posture.
  output.legal_name = output.company_name;
  output.primary_registration_id = output.nif;
  output.legal_form = output.company_type;
  output.registered_address = output.address;
  // NEVER fall back to first_borme_activity here: that is the coverage-window
  // floor (~2009), not an incorporation date — the fallback made Spain's
  // oldest companies read as founded in 2009 (review-caught fabrication in a
  // canonical cross-country field). Null when the register doesn't say.
  output.date_incorporated = output.registration_date ?? null;
  if (representatives === null) {
    output.tier_2_available = false;
    output.tier_2_available_reason =
      "officers block missing from the vendor response on this call — representation data temporarily unavailable, retry later";
  } else if (representatives.length === 0) {
    output.tier_2_available = false;
    output.tier_2_available_reason =
      "no current officers (cargos) on record for this entity in the BORME-derived register";
  } else {
    output.tier_2_available = true;
    output.tier_2_available_reason =
      "current officers (cargos vigentes) from BORME appointment/cessation acts via OpenMercantil.es";
  }
  output.ubo_availability = "unavailable_no_registry";
  output.ubo_availability_reason =
    "Spain's RETIR/beneficial-ownership registry is not publicly accessible; BORME does not carry ownership";

  // Prefer the vendor's in-band attribution requirement (it ships on every
  // response); fall back to the verified 2026-08-12 wording so a vendor
  // policy change surfaces here instead of silently drifting.
  const inBandAttribution = Object.values(data._attributions ?? {}).filter(Boolean).join(" ");

  return {
    output,
    provenance: {
      source: "openmercantil.es (BORME-derived)",
      source_url: `https://openmercantil.es/empresa/${encodeURIComponent(slug)}`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_aggregation" as const,
      upstream_vendor: "OpenMercantil.es",
      primary_source_reference: "https://www.boe.es/diario_borme/",
      license: "CC BY 4.0 (OpenMercantil datasets); Condiciones BOE de reutilización, Ley 37/2007 (BORME)",
      license_url: "https://www.boe.es/informacion/aviso_legal/index.php",
      attribution: inBandAttribution
        ? `Datos: OpenMercantil.es. ${inBandAttribution}`
        : "Datos: OpenMercantil.es, derivado del BORME. Basado en datos de la Agencia Estatal Boletín Oficial del Estado.",
      source_note:
        "Normalized from official BORME gazette acts; per-act registral references carried in recent_borme_acts.",
    },
  };
});
