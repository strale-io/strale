import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * LEI (Legal Entity Identifier) lookup via GLEIF API.
 * Free, no auth required. Supports lookup by LEI code or company name.
 *
 * Name search disambiguation: fetches multiple candidates and scores by
 * exact name match, jurisdiction match, and entity status (ACTIVE preferred).
 */

const GLEIF_API = "https://api.gleif.org/api/v1";
const LEI_RE = /^[A-Z0-9]{20}$/;

async function lookupByLei(lei: string): Promise<Record<string, unknown>> {
  const url = `${GLEIF_API}/lei-records/${lei}`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    throw new Error(`LEI ${lei} not found in GLEIF database.`);
  }
  if (!response.ok) throw new Error(`GLEIF API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  return parseGleifRecord(data.data);
}

// Legal form abbreviation → full name expansion for GLEIF search.
// GLEIF stores the full legal form in legalName (e.g., "Gesellschaft mit
// beschränkter Haftung" not "GmbH"), so abbreviations miss exact matches.
const LEGAL_FORM_EXPANSIONS: Record<string, string> = {
  // German
  "GmbH": "Gesellschaft mit beschränkter Haftung",
  "AG": "Aktiengesellschaft",
  "KG": "Kommanditgesellschaft",
  "OHG": "Offene Handelsgesellschaft",
  "KGaA": "Kommanditgesellschaft auf Aktien",
  "eG": "eingetragene Genossenschaft",
  "UG": "Unternehmergesellschaft",
  // Dutch
  "B.V.": "Besloten Vennootschap",
  "BV": "Besloten Vennootschap",
  "N.V.": "Naamloze Vennootschap",
  "NV": "Naamloze Vennootschap",
  // French
  "SAS": "Société par Actions Simplifiée",
  "SARL": "Société à Responsabilité Limitée",
  // Italian
  "SpA": "Società per Azioni",
  "S.p.A.": "Società per Azioni",
  "Srl": "Società a responsabilità limitata",
  "S.r.l.": "Società a responsabilità limitata",
  // Spanish
  "SL": "Sociedad Limitada",
  "S.L.": "Sociedad Limitada",
  // Swedish
  "AB": "Aktiebolag",
};

// SA is ambiguous (French, Spanish, Portuguese) — skip expansion, rely on disambiguation
// SE (Societas Europaea) is already the full form

function expandLegalForm(name: string): string | null {
  for (const [abbrev, full] of Object.entries(LEGAL_FORM_EXPANSIONS)) {
    // Match abbreviation at end of name, with or without trailing dot
    const pattern = new RegExp(`\\b${abbrev.replace(/\./g, "\\.")}\\s*$`, "i");
    if (pattern.test(name.trim())) {
      return name.trim().replace(pattern, full);
    }
  }
  return null;
}

async function gleifSearch(name: string, jurisdiction?: string): Promise<any[]> {
  let url = `${GLEIF_API}/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=10`;
  if (jurisdiction) {
    url += `&filter[entity.legalAddress.country]=${encodeURIComponent(jurisdiction)}`;
  }
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GLEIF API search returned HTTP ${response.status}`);
  const data = (await response.json()) as any;
  return data?.data ?? [];
}

async function searchByName(
  name: string,
  jurisdiction?: string,
): Promise<Record<string, unknown>> {
  // Try original name first
  let records = await gleifSearch(name, jurisdiction);

  // Always try expanded legal form if an expansion exists.
  // GLEIF stores full legal forms (e.g., "Gesellschaft mit beschränkter Haftung")
  // but users query with abbreviations ("GmbH"). The original query may return
  // subsidiaries that happen to use the abbreviated form in their legal name,
  // while the parent entity uses the full form.
  const expanded = expandLegalForm(name);
  if (expanded) {
    const expandedRecords = await gleifSearch(expanded, jurisdiction);
    // Merge: expanded results first (more likely to be the exact parent entity)
    const seen = new Set(records.map((r: any) => r?.attributes?.lei));
    for (const r of expandedRecords) {
      if (!seen.has(r?.attributes?.lei)) {
        records.unshift(r);
        seen.add(r?.attributes?.lei);
      }
    }
  }

  if (records.length === 0) {
    // Try without jurisdiction filter
    if (jurisdiction) {
      return searchByName(name);
    }
    throw new Error(`No LEI found matching "${name}".`);
  }

  if (records.length === 1) {
    return parseGleifRecord(records[0]);
  }

  // Disambiguate: score each candidate
  const nameNorm = name.toLowerCase().trim();
  const expandedForScoring = expandLegalForm(name);
  const expandedNorm = expandedForScoring?.toLowerCase().trim();
  const candidates = records.map((record: any) => {
    const parsed = parseGleifRecord(record);
    let score = 0;

    // Exact name match — check both original and expanded forms
    const legalName = ((parsed.legal_name as string) ?? "").toLowerCase().trim();
    if (legalName === nameNorm || (expandedNorm && legalName === expandedNorm)) score += 100;
    else if (legalName.startsWith(nameNorm) || (expandedNorm && legalName.startsWith(expandedNorm))) score += 50;

    // Jurisdiction match
    if (jurisdiction && (parsed.jurisdiction as string)?.toUpperCase() === jurisdiction.toUpperCase()) {
      score += 30;
    }

    // ACTIVE status preferred
    if ((parsed.status as string)?.toUpperCase() === "ACTIVE") score += 20;
    if ((parsed.registration_status as string)?.toUpperCase() === "ISSUED") score += 10;

    // Penalty for subsidiary indicators in name
    const subIndicators = ["krankenhaus", "hospital", "stiftung", "foundation", "holding", "verwaltung"];
    if (subIndicators.some((s) => legalName.includes(s)) && !nameNorm.includes(subIndicators.find((s) => legalName.includes(s))!)) {
      score -= 50;
    }

    return { record: parsed, score, legalName };
  });

  // Sort by score descending
  candidates.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  return candidates[0].record;
}

function parseGleifRecord(record: any): Record<string, unknown> {
  const entity = record?.attributes?.entity || {};
  const registration = record?.attributes?.registration || {};

  const legalAddress = entity.legalAddress || {};
  const hqAddress = entity.headquartersAddress || {};

  return {
    lei: record?.attributes?.lei || record?.id || "",
    legal_name: entity.legalName?.name || "",
    jurisdiction: entity.jurisdiction || null,
    category: entity.category || null,
    legal_form: entity.legalForm?.id || null,
    status: entity.status || null,
    registration_status: registration.status || null,
    initial_registration_date: registration.initialRegistrationDate || null,
    last_update_date: registration.lastUpdateDate || null,
    legal_address: {
      line1: legalAddress.addressLines?.[0] || null,
      city: legalAddress.city || null,
      country: legalAddress.country || null,
      postal_code: legalAddress.postalCode || null,
    },
    headquarters_address: {
      line1: hqAddress.addressLines?.[0] || null,
      city: hqAddress.city || null,
      country: hqAddress.country || null,
      postal_code: hqAddress.postalCode || null,
    },
  };
}

registerCapability("lei-lookup", async (input: CapabilityInput) => {
  const lei = (input.lei as string)?.trim() ?? "";
  const companyName = (input.company_name as string)?.trim() ?? "";
  const jurisdiction = (input.jurisdiction as string)?.trim().toUpperCase() ?? undefined;

  // Also accept from the generic 'task' or fallback chain
  const raw = lei || companyName || (input.task as string)?.trim() || "";
  if (!raw) {
    throw new Error("'lei' or 'company_name' is required. Provide a 20-character LEI code or company name.");
  }

  const trimmed = raw.trim().toUpperCase();
  let result: Record<string, unknown>;

  if (LEI_RE.test(trimmed)) {
    result = await lookupByLei(trimmed);
  } else {
    result = await searchByName(raw.trim(), jurisdiction);
  }

  return {
    output: result,
    provenance: {
      source: "gleif.org",
      fetched_at: new Date().toISOString(),
    },
  };
});
