import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * French insolvency check — BODACC (Bulletin officiel des annonces civiles
 * et commerciales), the official French legal gazette for company notices.
 * Published as open data by DILA (Direction de l'information légale et
 * administrative, a French government service) via an Opendatasoft
 * instance. Free, no API key, no signup — "utilisable gratuitement".
 *
 * Filters to familleavis="collective" ("Procédures collectives" — the
 * BODACC family covering redressement judiciaire / liquidation judiciaire
 * / sauvegarde, i.e. formal insolvency proceedings). Other BODACC families
 * (company creation, account filings, deregistration) are out of scope —
 * this capability answers "does this French company have insolvency
 * proceeding notices on file?", not general company registry lookup
 * (french-company-data / INSEE covers that).
 *
 * Dataset: https://www.data.gouv.fr/en/datasets/bodacc/
 * API base: https://bodacc-datadila.opendatasoft.com/api/explore/v2.1
 */

const BODACC_API =
  "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";
const SIREN_RE = /^\d{9}$/;

interface Judgment {
  famille?: string;
  nature?: string;
  date?: string;
  type?: string;
  complementJugement?: string;
}

function extractSiren(registre: unknown): string | null {
  if (!Array.isArray(registre)) return null;
  const compact = registre.find((r) => typeof r === "string" && SIREN_RE.test(r));
  return compact ?? null;
}

function parseJudgment(raw: unknown): Judgment | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      famille: parsed?.famille ?? null,
      nature: parsed?.nature ?? null,
      date: parsed?.date ?? null,
      type: parsed?.type ?? null,
      complementJugement: parsed?.complementJugement ?? null,
    };
  } catch {
    // Malformed nested JSON from upstream — surface as absent rather than throw,
    // this is one field among many in the notice, not a fatal condition.
    return null;
  }
}

function escapeOdsqlString(value: string): string {
  // Backslash must be escaped first — escaping quotes first would double-escape
  // the backslashes that quote-escaping itself introduces.
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

registerCapability("french-insolvency-check", async (input: CapabilityInput) => {
  const sirenRaw = ((input.siren as string) ?? "").trim().replace(/\s+/g, "");
  const companyName = ((input.company_name as string) ?? (input.task as string) ?? "").trim();

  if (!sirenRaw && !companyName) {
    throw new Error("'siren' (9-digit French company identifier) or 'company_name' is required.");
  }
  if (sirenRaw && !SIREN_RE.test(sirenRaw)) {
    throw new Error("'siren' must be exactly 9 digits.");
  }

  const clauses = ['familleavis="collective"'];
  if (sirenRaw) {
    clauses.push(`registre="${sirenRaw}"`);
  } else {
    clauses.push(`commercant like "${escapeOdsqlString(companyName)}"`);
  }

  const params = new URLSearchParams({
    where: clauses.join(" and "),
    order_by: "dateparution desc",
    limit: "20",
  });

  const url = `${BODACC_API}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`BODACC API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as any;
  const results: any[] = Array.isArray(data?.results) ? data.results : [];

  const notices = results.map((r) => ({
    id: r.id ?? null,
    publication_date: r.dateparution ?? null,
    company_name: r.commercant ?? null,
    siren: extractSiren(r.registre),
    court: r.tribunal ?? null,
    department: r.numerodepartement ?? null,
    department_name: r.departement_nom_officiel ?? null,
    notice_type: r.typeavis_lib ?? null,
    judgment: parseJudgment(r.jugement),
    url: r.url_complete ?? null,
  }));

  return {
    output: {
      query: {
        siren: sirenRaw || null,
        company_name: companyName || null,
      },
      result_count: notices.length,
      insolvency_notices: notices,
    },
    provenance: {
      source: "bodacc.fr",
      fetched_at: new Date().toISOString(),
      upstream_vendor: "DILA (Direction de l'information légale et administrative, French government)",
      acquisition_method: "official_api",
      primary_source_reference: "https://www.data.gouv.fr/en/datasets/bodacc/",
    },
  };
});
