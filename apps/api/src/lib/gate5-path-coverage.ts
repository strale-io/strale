/**
 * Gate 5 — Path Coverage Enforcement (DEC-20260411-B)
 *
 * Ensures every multi-path capability has test fixtures covering all entry
 * points before going live. Entry points are classified as:
 *
 * - PRIMARY: ID-based lookup (registration number, org number, KRS, etc.)
 *   Requires at least one fixture using a real identifier.
 *
 * - SECONDARY: Name-based search (company name, query, etc.)
 *   Requires at least one fixture exercising the name-resolution path.
 *
 * Entry points are defined by the handler's dispatch logic (inward trace),
 * NOT by exported functions. Cache/retry/fallback branches are excluded.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";

// Input field name patterns that indicate PRIMARY (ID-based) entry points.
// These are specific registry/identifier field names, NOT generic parameters.
const ID_FIELD_PATTERNS = [
  /^krs/i, /^cvr/i, /^lei$/i, /^bic$/i, /^iban$/i, /^vat/i,
  /^abn$/i, /^hrb/i, /^hra/i, /^siren$/i, /^siret$/i, /^nipc$/i,
  /^nip$/i, /^cif$/i, /^nif$/i, /^ein$/i, /^cik$/i, /^ticker$/i,
  /^uid$/i, /^fn_number/i, /^enterprise_number/i, /^business_id$/i,
  /^org_number$/i, /^company_number$/i, /^registry_code$/i,
  /^registration_number$/i, /^contract_address$/i, /^container_number$/i,
  /^patent_number$/i, /^flight_number$/i,
];

// Fields that look like IDs but are actually parameters, not entry points
const NOT_ENTRY_POINT_PATTERNS = [
  /^num_results$/i, /^limit$/i, /^page$/i, /^offset$/i,
  /^country_code$/i, /^country$/i, /^language$/i, /^lang$/i,
  /^format$/i, /^sort$/i, /^order$/i, /^chain_id$/i,
  /^experience_level$/i, /^currency$/i, /^include_/i,
  /^from_language$/i, /^to_language$/i, /^base_number$/i,
  /^min_/i, /^max_/i, /^type$/i, /^mode$/i,
];

// Input field name patterns that indicate SECONDARY (name-based) entry points
const NAME_FIELD_PATTERNS = [
  /^name$/i, /company_name/i, /^query$/i, /^search$/i, /^task$/i,
  /^domain$/i, /^url$/i, /^email$/i, /^address$/i,
  /^job_title$/i, /^city$/i, /^keyword$/i,
];

export type PathType = "PRIMARY" | "SECONDARY";

export interface EntryPoint {
  field: string;
  pathType: PathType;
  description: string;
}

export interface CoverageResult {
  entryPoint: EntryPoint;
  covered: boolean;
  fixtureCount: number;
}

export interface Gate5Result {
  slug: string;
  passed: boolean;
  isMultiPath: boolean;
  entryPoints: EntryPoint[];
  uncoveredPrimary: EntryPoint[];
  uncoveredSecondary: EntryPoint[];
  coverageMap: CoverageResult[];
  issues: string[];
}

/**
 * Classify an input field as PRIMARY (ID lookup) or SECONDARY (name search).
 */
function classifyField(fieldName: string, fieldDescription?: string): PathType | null {
  // Exclude fields that are parameters, not entry points
  if (NOT_ENTRY_POINT_PATTERNS.some((p) => p.test(fieldName))) {
    return null;
  }

  const desc = (fieldDescription ?? "").toLowerCase();

  // Check field name against ID patterns first
  if (ID_FIELD_PATTERNS.some((p) => p.test(fieldName))) {
    return "PRIMARY";
  }

  // Check field name against name patterns
  if (NAME_FIELD_PATTERNS.some((p) => p.test(fieldName))) {
    return "SECONDARY";
  }

  // Check description for ID-related keywords (only if field name didn't match)
  if (/\b\d+ digits\b|registration|registry number/.test(desc) && !/name|search|query/.test(desc)) {
    return "PRIMARY";
  }

  // Check description for name-related keywords
  if (/name|search|query|fuzzy/.test(desc)) {
    return "SECONDARY";
  }

  // Unknown fields are not entry points (avoid false positives)
  return null;
}

/**
 * Determine if a field accepts both ID and name inputs (dual-purpose).
 * These are common in company-data capabilities where one field accepts
 * either a registration number or a company name.
 */
function isDualPurposeField(fieldName: string, fieldDescription?: string): boolean {
  if (NOT_ENTRY_POINT_PATTERNS.some((p) => p.test(fieldName))) return false;
  const desc = (fieldDescription ?? "").toLowerCase();
  const hasIdIndicator = ID_FIELD_PATTERNS.some((p) => p.test(fieldName)) || /\b\d+ digits\b|registration number/.test(desc);
  const hasNameIndicator = /or.*name|or.*company|or.*search|or.*query|or.*fuzzy/.test(desc);
  return hasIdIndicator && hasNameIndicator;
}

/**
 * Enumerate entry points for a capability based on its input schema.
 *
 * Uses the inward-trace heuristic: entry points are input fields that
 * drive dispatch logic in the handler. For single-field capabilities
 * that accept both ID and name (detected from description), both
 * PRIMARY and SECONDARY entry points are generated from the same field.
 */
export function enumerateEntryPoints(
  slug: string,
  inputSchema: Record<string, unknown>,
): EntryPoint[] {
  const properties = (inputSchema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
  if (!properties) return [];

  const entryPoints: EntryPoint[] = [];
  const fieldNames = Object.keys(properties);

  for (const fieldName of fieldNames) {
    const prop = properties[fieldName];
    const desc = prop?.description ?? "";

    if (isDualPurposeField(fieldName, desc)) {
      entryPoints.push({
        field: fieldName,
        pathType: "PRIMARY",
        description: `ID lookup via ${fieldName}`,
      });
      entryPoints.push({
        field: fieldName,
        pathType: "SECONDARY",
        description: `Name search via ${fieldName}`,
      });
    } else {
      const pathType = classifyField(fieldName, desc);
      if (pathType) {
        entryPoints.push({
          field: fieldName,
          pathType,
          description: `${pathType === "PRIMARY" ? "ID lookup" : "Name search"} via ${fieldName}`,
        });
      }
      // null = not an entry point (parameter field), skip
    }
  }

  return entryPoints;
}

/**
 * Determine which entry point a fixture exercises based on its input fields.
 */
function classifyFixtureInput(
  fixtureInput: Record<string, unknown>,
  entryPoints: EntryPoint[],
): { matchedEntryPoints: EntryPoint[]; exercisesIdPath: boolean; exercisesNamePath: boolean } {
  const inputFields = Object.keys(fixtureInput);
  const inputValues = Object.values(fixtureInput);

  // Heuristic: if the input value looks like an ID (digits, alphanumeric codes),
  // it exercises the PRIMARY path. If it looks like a name (words, spaces),
  // it exercises the SECONDARY path.
  const hasIdLikeValue = inputValues.some((v) => {
    if (typeof v !== "string") return false;
    const cleaned = v.replace(/[\s.-]/g, "");
    // Looks like a registration number: mostly digits, or matches known patterns
    return /^\d{5,}$/.test(cleaned) || /^[A-Z]{2,3}\s*\d+$/i.test(v.trim()) || /^[A-Z]\d{7,}$/i.test(cleaned);
  });

  const hasNameLikeValue = inputValues.some((v) => {
    if (typeof v !== "string") return false;
    // Looks like a company name: contains spaces, letters, common suffixes
    return /[a-zA-Z]{3,}.*\s+[a-zA-Z]/.test(v) || /\b(AG|GmbH|Ltd|SA|AB|AS|Oy|ApS|BV)\b/i.test(v);
  });

  const matched: EntryPoint[] = [];

  for (const ep of entryPoints) {
    if (inputFields.includes(ep.field)) {
      if (ep.pathType === "PRIMARY" && hasIdLikeValue) matched.push(ep);
      else if (ep.pathType === "SECONDARY" && hasNameLikeValue) matched.push(ep);
      else if (ep.pathType === "SECONDARY" && !hasIdLikeValue) matched.push(ep);
      else if (ep.pathType === "PRIMARY" && !hasNameLikeValue) matched.push(ep);
    }
  }

  return {
    matchedEntryPoints: matched,
    exercisesIdPath: hasIdLikeValue,
    exercisesNamePath: hasNameLikeValue && !hasIdLikeValue,
  };
}

/**
 * Trace fixture coverage for a capability.
 * Loads all test fixtures from the DB and maps them to entry points.
 */
export async function traceFixtureCoverage(
  slug: string,
  entryPoints: EntryPoint[],
): Promise<CoverageResult[]> {
  const db = getDb();

  const fixtures = await db
    .select({ input: testSuites.input, testType: testSuites.testType })
    .from(testSuites)
    .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)));

  // Only count known_answer and schema_check fixtures (not negative/edge_case/dependency_health)
  const relevantFixtures = fixtures.filter((f) =>
    f.testType === "known_answer" || f.testType === "schema_check",
  );

  // Build coverage map
  const coverageMap: CoverageResult[] = entryPoints.map((ep) => ({
    entryPoint: ep,
    covered: false,
    fixtureCount: 0,
  }));

  for (const fixture of relevantFixtures) {
    const input = fixture.input as Record<string, unknown> | null;
    if (!input) continue;

    const classification = classifyFixtureInput(input, entryPoints);

    for (const matched of classification.matchedEntryPoints) {
      const entry = coverageMap.find(
        (c) => c.entryPoint.field === matched.field && c.entryPoint.pathType === matched.pathType,
      );
      if (entry) {
        entry.covered = true;
        entry.fixtureCount++;
      }
    }
  }

  return coverageMap;
}

/**
 * Run Gate 5: Path Coverage check for a capability.
 *
 * Returns passed=true if:
 * - All PRIMARY entry points have at least one fixture
 * - All SECONDARY entry points have at least one fixture
 *
 * Single-path capabilities (only one entry point type) always pass.
 */
export async function runGate5(slug: string): Promise<Gate5Result> {
  const db = getDb();

  // Load capability input schema
  const [cap] = await db
    .select({ inputSchema: capabilities.inputSchema })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    return {
      slug,
      passed: false,
      isMultiPath: false,
      entryPoints: [],
      uncoveredPrimary: [],
      uncoveredSecondary: [],
      coverageMap: [],
      issues: [`Capability '${slug}' not found in database`],
    };
  }

  const schema = typeof cap.inputSchema === "string"
    ? JSON.parse(cap.inputSchema)
    : cap.inputSchema;

  const entryPoints = enumerateEntryPoints(slug, schema as Record<string, unknown>);

  // Single-path capabilities trivially pass
  const hasPrimary = entryPoints.some((ep) => ep.pathType === "PRIMARY");
  const hasSecondary = entryPoints.some((ep) => ep.pathType === "SECONDARY");
  const isMultiPath = hasPrimary && hasSecondary;

  if (!isMultiPath) {
    return {
      slug,
      passed: true,
      isMultiPath: false,
      entryPoints,
      uncoveredPrimary: [],
      uncoveredSecondary: [],
      coverageMap: [],
      issues: [],
    };
  }

  // Multi-path: check coverage
  const coverageMap = await traceFixtureCoverage(slug, entryPoints);

  const uncoveredPrimary = coverageMap
    .filter((c) => c.entryPoint.pathType === "PRIMARY" && !c.covered)
    .map((c) => c.entryPoint);

  const uncoveredSecondary = coverageMap
    .filter((c) => c.entryPoint.pathType === "SECONDARY" && !c.covered)
    .map((c) => c.entryPoint);

  const issues: string[] = [];
  for (const ep of uncoveredPrimary) {
    issues.push(
      `PRIMARY entry point '${ep.field}' (${ep.description}) has no fixtures. ` +
      `Add at least one fixture using a real registration number for this path.`,
    );
  }
  for (const ep of uncoveredSecondary) {
    issues.push(
      `SECONDARY entry point '${ep.field}' (${ep.description}) has no fixtures. ` +
      `Add at least one fixture with a company name for this path.`,
    );
  }

  return {
    slug,
    passed: uncoveredPrimary.length === 0 && uncoveredSecondary.length === 0,
    isMultiPath: true,
    entryPoints,
    uncoveredPrimary,
    uncoveredSecondary,
    coverageMap,
    issues,
  };
}

/**
 * Run Gate 5 retrospectively against all active capabilities.
 * Does NOT block anything — produces a report only.
 */
export async function retrospectiveCheck(): Promise<{
  totalChecked: number;
  multiPath: number;
  passing: number;
  failing: number;
  results: Gate5Result[];
}> {
  const db = getDb();

  const allCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  const results: Gate5Result[] = [];
  let multiPath = 0;
  let passing = 0;
  let failing = 0;

  for (const cap of allCaps) {
    const result = await runGate5(cap.slug);
    if (result.isMultiPath) {
      multiPath++;
      results.push(result);
      if (result.passed) passing++;
      else failing++;
    }
  }

  return {
    totalChecked: allCaps.length,
    multiPath,
    passing,
    failing,
    results: results.filter((r) => !r.passed),
  };
}
