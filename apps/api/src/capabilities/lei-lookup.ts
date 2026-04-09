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

async function searchByName(
  name: string,
  jurisdiction?: string,
): Promise<Record<string, unknown>> {
  // Fetch up to 10 candidates for disambiguation
  let url = `${GLEIF_API}/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=10`;
  // Add jurisdiction filter if available (ISO 3166-1 alpha-2)
  if (jurisdiction) {
    url += `&filter[entity.legalAddress.country]=${encodeURIComponent(jurisdiction)}`;
  }

  const response = await fetch(url, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GLEIF API search returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const records = data?.data;
  if (!records || records.length === 0) {
    // If jurisdiction-filtered search found nothing, try without filter
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
  const candidates = records.map((record: any) => {
    const parsed = parseGleifRecord(record);
    let score = 0;

    // Exact name match (highest signal)
    const legalName = ((parsed.legal_name as string) ?? "").toLowerCase().trim();
    if (legalName === nameNorm) score += 100;
    else if (legalName.startsWith(nameNorm)) score += 50;

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
