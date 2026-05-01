import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * BODACC (Bulletin Officiel des Annonces Civiles et Commerciales) lookup.
 *
 * BODACC is the French government's official journal of all commercial-
 * registry events: insolvency proceedings, sales, registry modifications,
 * incorporations, strikeoffs, annual-accounts deposits.
 *
 * For Payee Assurance the primary value is the insolvency signal —
 * Procédures collectives (familleavis = "collective"). The executor
 * returns all announcement types for full history but elevates insolvency
 * count + most-recent-insolvency to top-level fields.
 *
 * Source: data.gouv.fr / Direction de l'information légale et
 * administrative. Free, no auth, CC-BY-2.0.
 */

const BODACC_API =
  "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

const SIREN_RE = /^\d{9}$/;

type Announcement = {
  id: string;
  date: string;
  family: string;
  family_label: string;
  court: string | null;
  entity_name: string | null;
  city: string | null;
  postal_code: string | null;
  judgment: Record<string, unknown> | null;
  url: string | null;
};

function normalizeSiren(input: string): string {
  return input.replace(/\s+/g, "").trim();
}

function safeParseJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function bodaccQuery(params: Record<string, string>): Promise<{ total_count: number; results: any[] }> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BODACC_API}?${qs}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`BODACC API returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as { total_count?: number; results?: any[] };
  return { total_count: data.total_count ?? 0, results: data.results ?? [] };
}

async function searchSirenByName(companyName: string): Promise<string> {
  // BODACC search-by-name uses the `commercant` field
  const { results } = await bodaccQuery({
    limit: "5",
    where: `commercant like "${companyName.replace(/"/g, '\\"')}"`,
    order_by: "dateparution desc",
  });
  if (results.length === 0) {
    throw new Error(`No BODACC announcement found for company name "${companyName}".`);
  }
  // Return first SIREN from `registre` array
  for (const r of results) {
    const reg = r?.registre;
    if (Array.isArray(reg)) {
      const unformatted = reg.find((s: string) => /^\d{9}$/.test(s));
      if (unformatted) return unformatted;
    }
  }
  throw new Error(`Found BODACC announcements for "${companyName}" but no SIREN extractable.`);
}

function mapResult(r: any): Announcement {
  const reg = Array.isArray(r?.registre) ? r.registre : [];
  return {
    id: r?.id ?? "",
    date: r?.dateparution ?? "",
    family: r?.familleavis ?? "",
    family_label: r?.familleavis_lib ?? "",
    court: r?.tribunal ?? null,
    entity_name: r?.commercant ?? null,
    city: r?.ville ?? null,
    postal_code: r?.cp ?? null,
    judgment: safeParseJson(r?.jugement),
    url: r?.url_complete ?? null,
  };
}

registerCapability("fr-bodacc-lookup", async (input: CapabilityInput) => {
  const sirenInput = ((input.siren as string) ?? "").trim();
  const companyName = ((input.company_name as string) ?? "").trim();
  const sinceDate = ((input.since_date as string) ?? "").trim();
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);

  if (!sirenInput && !companyName) {
    throw new Error("'siren' or 'company_name' is required. Provide a 9-digit SIREN (with or without spaces) or a company name.");
  }

  let siren: string;
  if (sirenInput) {
    siren = normalizeSiren(sirenInput);
    if (!SIREN_RE.test(siren)) {
      throw new Error(`Invalid SIREN: "${sirenInput}". SIREN must be exactly 9 digits.`);
    }
  } else {
    siren = await searchSirenByName(companyName);
  }

  // Build where clause
  const whereParts: string[] = [`registre like "${siren}"`];
  if (sinceDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
      throw new Error(`Invalid since_date: "${sinceDate}". Must be ISO date YYYY-MM-DD.`);
    }
    whereParts.push(`dateparution >= "${sinceDate}"`);
  }

  const { total_count, results } = await bodaccQuery({
    limit: String(limit),
    where: whereParts.join(" AND "),
    order_by: "dateparution desc",
  });

  const announcements = results.map(mapResult);
  const insolvencyAnnouncements = announcements.filter((a) => a.family === "collective");
  const mostRecentInsolvency = insolvencyAnnouncements[0] ?? null;
  const mostRecentAny = announcements[0] ?? null;

  return {
    output: {
      siren,
      total_announcements: total_count,
      insolvency_count: insolvencyAnnouncements.length,
      has_insolvency_filing: insolvencyAnnouncements.length > 0,
      most_recent_announcement_date: mostRecentAny?.date ?? null,
      most_recent_insolvency: mostRecentInsolvency
        ? {
            date: mostRecentInsolvency.date,
            court: mostRecentInsolvency.court,
            judgment_type: (mostRecentInsolvency.judgment?.type as string) ?? null,
            judgment_nature: (mostRecentInsolvency.judgment?.nature as string) ?? null,
            judgment_date: (mostRecentInsolvency.judgment?.date as string) ?? null,
            summary: (mostRecentInsolvency.judgment?.complementJugement as string) ?? null,
            url: mostRecentInsolvency.url,
          }
        : null,
      announcements,
      data_source: "BODACC (Bulletin Officiel des Annonces Civiles et Commerciales)",
    },
    provenance: {
      source: "bodacc-datadila.opendatasoft.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
