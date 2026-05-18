// Cyprus — Openapi.com WW-Top (Tier-3 vendor aggregator) + DRCOR open data.
//
// Tier-1 identity flows through Openapi WW-Top (PARTIAL coverage; some CY
// entities return 204 — anomaly bundled on Openapi case 151296). Tier-2
// `legal_representatives[]` is sourced from the `cy_directors` cache that
// `jobs/ingest-cy-directors.ts` populates monthly from data.gov.cy DRCOR
// open data (CC BY 4.0). Phase 6 enumeration (DEC-20260518-E) and DEC-
// 20260518-A canonical shape.
//
// Identifier shape: Openapi WW-Top accepts THREE regex variants for CY:
//   ^CY\d{8}[A-Z]$   (CY-prefix VAT)
//   ^\d{8}[A-Z]$     (bare VAT, no prefix)
//   ^C\d+$           (CRO company number, e.g. C165)
//
// Only the C-prefix variant maps cleanly to DRCOR (strip "C" → numeric
// REGISTRATION_NO lookup). VAT-format inputs (CY-prefix or bare) cannot
// be resolved against the DRCOR cache because DRCOR doesn't index by
// VAT — the cache stores numeric registration_no only. For VAT inputs
// we surface `tier_2_available: false` with an explicit reason rather
// than silently dropping the field.

import { and, eq } from "drizzle-orm";
import { registerCapability, type CapabilityInput } from "./index.js";
import { executeOpenapiCapability } from "./lib/openapi-resolver.js";
import { getDb } from "../db/index.js";
import { cyDirectors, cyDirectorsSync } from "../db/schema.js";

const CY_RE = /^(CY\d{8}[A-Z]|\d{8}[A-Z]|C\d+)$/;

function normaliseCyIdentifier(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, "").toUpperCase();
  return CY_RE.test(cleaned) ? cleaned : null;
}

/** Map a normalised CY identifier to its DRCOR REGISTRATION_NO (numeric
 *  string) if possible. C-prefix strips to the digits; VAT-format
 *  identifiers don't resolve and return null. */
export function drcorRegCodeFromIdentifier(normalised: string): string | null {
  if (/^C\d+$/.test(normalised)) return normalised.slice(1);
  return null;
}

interface LegalRepresentative {
  type: "person" | "organisation";
  name: string;
  role: string;
  role_code: string;
  role_group: string;
  date_of_birth: string | null;
  start_date: string | null;
}

// DRCOR role-standardized → role_group. Forward-compat: anything not
// listed maps to "other". role_standardized values are produced by
// `standardizeRole()` in the ingest job.
const ROLE_GROUPS: Record<string, string> = {
  director: "management_board",
  alternate_director: "management_board",
  secretary: "secretarial",
  assistant_secretary: "secretarial",
  deputy_secretary: "secretarial",
  authorised_person: "authorised_representation",
  owner: "ownership",
  general_partner: "partnership",
  limited_partner: "partnership",
};

function deriveRoleGroup(roleStandardized: string): string {
  return ROLE_GROUPS[roleStandardized] ?? "other";
}

/** Heuristic for distinguishing legal-entity directors (corporate
 *  nominees) from natural persons. DRCOR open data does not flag this
 *  explicitly, but corporate names reliably end in LIMITED / LTD /
 *  ETAIREIA / SECRETARIAL SERVICES etc. Names with no corporate marker
 *  are treated as natural persons. False-positives are tolerable —
 *  consumers care about role+name, the type tag is supplementary. */
const ORGANISATION_NAME_RE =
  /\b(LIMITED|LTD|LIMITED\.|LTD\.|S\.A\.?|PLC|LLC|LLP|HOLDINGS|TRUST|FOUNDATION|SECRETARIAL SERVICES|MANAGEMENT|NOMINEES|TRUSTEES|ΕΤΑΙΡΕΙΑ|ΕΠΕ|ΛΤΔ)\b/;

function deriveType(name: string): "person" | "organisation" {
  return ORGANISATION_NAME_RE.test(name) ? "organisation" : "person";
}

async function fetchLegalRepresentatives(drcorRegCode: string): Promise<{
  representatives: LegalRepresentative[];
  lastSyncedAt: Date | null;
}> {
  if (!drcorRegCode) return { representatives: [], lastSyncedAt: null };
  const db = getDb();
  const rows = await db
    .select({
      personOrOrganisationName: cyDirectors.personOrOrganisationName,
      officialPosition: cyDirectors.officialPosition,
      roleStandardized: cyDirectors.roleStandardized,
      lastSyncedAt: cyDirectors.lastSyncedAt,
    })
    .from(cyDirectors)
    .where(eq(cyDirectors.entityRegCode, drcorRegCode));
  const reps: LegalRepresentative[] = [];
  let maxSynced: Date | null = null;
  for (const r of rows) {
    const name = r.personOrOrganisationName.trim();
    if (!name) continue;
    reps.push({
      type: deriveType(name),
      name,
      role: r.officialPosition,
      role_code: r.roleStandardized,
      role_group: deriveRoleGroup(r.roleStandardized),
      // DRCOR open data does not include personal IDs or DOB at row level —
      // kept null for canonical-shape parity with EE/NO/CZ.
      date_of_birth: null,
      // DRCOR snapshot doesn't carry per-row appointment dates either —
      // kept null per Phase 6 enumeration caveat (current-state snapshot,
      // not change log).
      start_date: null,
    });
    if (r.lastSyncedAt && (!maxSynced || r.lastSyncedAt > maxSynced)) {
      maxSynced = r.lastSyncedAt;
    }
  }
  return { representatives: reps, lastSyncedAt: maxSynced };
}

async function readSyncTimestamp(): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ lastSuccessAt: cyDirectorsSync.lastSuccessAt })
    .from(cyDirectorsSync)
    .where(eq(cyDirectorsSync.id, 1))
    .limit(1);
  return rows[0]?.lastSuccessAt ?? null;
}

registerCapability("cypriot-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.vat_number as string) ??
    (input.identifier as string) ??
    (input.company_number as string) ??
    "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'vat_number' or 'identifier' is required. Provide a Cypriot VAT (CY-prefix or bare 8-digit-plus-letter) or company number (C-prefix, e.g. C165).",
    );
  }
  const normalised = normaliseCyIdentifier(rawInput.trim());
  if (!normalised) {
    throw new Error(
      `'${rawInput.trim()}' is not a valid Cypriot identifier. Expected: CY + 8 digits + 1 letter (VAT), 8 digits + 1 letter (bare VAT), or C + digits (company number).`,
    );
  }
  const __etResult = await executeOpenapiCapability(
    {
      countryCode: "CY",
      identifierRegex: CY_RE,
      openapiProduct: "ww-top",
      capabilitySlug: "cypriot-company-data",
    },
    normalised,
  );

  // Tier-2 lookup against the cy_directors cache (monthly DRCOR ingest).
  // Only C-prefix inputs map to DRCOR; VAT-format inputs cannot be
  // resolved against the open-data file's numeric REGISTRATION_NO index.
  // Cache miss / DB error is non-fatal — tier-1 still surfaces.
  const drcorRegCode = drcorRegCodeFromIdentifier(normalised);
  let legalReps: LegalRepresentative[] = [];
  let lastSyncedAt: Date | null = null;
  let cacheError: string | null = null;
  if (drcorRegCode) {
    try {
      const result = await fetchLegalRepresentatives(drcorRegCode);
      legalReps = result.representatives;
      lastSyncedAt = result.lastSyncedAt ?? (await readSyncTimestamp());
    } catch (err) {
      cacheError = err instanceof Error ? err.message : String(err);
    }
  }

  const o = __etResult.output as Record<string, unknown>;
  // Evidence Tier 1 canonical aliases (DEC-20260518-A)
  o.legal_name = o.company_name;
  o.primary_registration_id = o.registration_number;
  o.date_incorporated = o.registered_date;
  o.legal_representatives = legalReps;
  o.total_legal_representatives = legalReps.length;
  o.tier_2_available = legalReps.length > 0;
  if (cacheError) {
    o.tier_2_available_reason = `cy_directors cache query failed (${cacheError}); tier_1 data unaffected.`;
  } else if (legalReps.length > 0) {
    const syncedNote = lastSyncedAt
      ? ` Last cache refresh: ${lastSyncedAt.toISOString()}.`
      : "";
    o.tier_2_available_reason =
      "Legal representatives sourced from Cyprus DRCOR (Department of " +
      "Registrar of Companies and Intellectual Property) via monthly-refreshed " +
      "open data: data.gov.cy organisation_officials_83.csv, CC BY 4.0. " +
      "Up to 4-week freshness; per-row appointment dates and personal " +
      "identifiers are not published in the open-data file." +
      syncedNote;
  } else if (!drcorRegCode) {
    o.tier_2_available_reason =
      "VAT-format identifier cannot be resolved against the DRCOR open-data " +
      "cache (cache indexes numeric REGISTRATION_NO only). Re-query with the " +
      "C-prefix company number (e.g. C165) for legal_representatives coverage.";
  } else {
    o.tier_2_available_reason =
      "cy_directors cache returned no rows for this DRCOR registration " +
      "number (newly registered entity, struck-off, or cache not yet " +
      "populated by first ingest tick).";
  }
  o.ubo_availability = "unavailable_no_registry";
  o.ubo_availability_reason =
    "Cyprus UBO Register access closed to public since 2023-01-03 per CJEU " +
    "C-37/20 ruling; legitimate-interest gate applies. Programmatic UBO " +
    "lookup not exposed at v1.";

  // Augment provenance with the open-data attribution per DEC-20260518-F
  // constraint (d). The Openapi-resolver already populated the top-level
  // provenance with required {source, fetched_at}; we add tier-2 fields.
  const baseProvenance = __etResult.provenance;
  const augmentedProvenance: typeof baseProvenance & Record<string, unknown> = {
    ...baseProvenance,
  };
  if (legalReps.length > 0) {
    augmentedProvenance.tier_2_source = "data.gov.cy DRCOR open data";
    augmentedProvenance.tier_2_source_url = "https://data.gov.cy/sites/default/files/organisation_officials_83.csv";
    augmentedProvenance.tier_2_license = "CC BY 4.0";
    augmentedProvenance.tier_2_license_url = "https://creativecommons.org/licenses/by/4.0/legalcode";
    augmentedProvenance.tier_2_attribution =
      "Source: Department of Registrar of Companies and Intellectual Property (DRCIP), Republic of Cyprus, via data.gov.cy.";
    if (lastSyncedAt) augmentedProvenance.tier_2_last_synced_at = lastSyncedAt.toISOString();
  }

  return {
    ...__etResult,
    output: o,
    provenance: augmentedProvenance,
  };
});

export { CY_RE };
