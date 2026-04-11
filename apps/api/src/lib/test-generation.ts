/**
 * Shared test generation utilities.
 * Single source of truth for output field classification and test check generation.
 *
 * Used by:
 *   - capability-onboarding.ts (auto-generate suites on creation)
 *   - db/generate-tests.ts (bulk test generation script)
 *   - db/generate-*-tests.ts (specialized test generators)
 */

// ─── Validation check helpers ─────────────────────────────────────────────────

export interface ValidationCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

export function checks(...c: ValidationCheck[]): { checks: ValidationCheck[] } {
  return { checks: c };
}

export function notNull(field: string): ValidationCheck {
  return { field, operator: "not_null" };
}

// ─── Output field reliability classification ──────────────────────────────────

// Structural/meta fields that are almost always present in any response
const GUARANTEED_PATTERNS = new Set([
  "status", "error", "message", "code", "success", "valid", "is_valid",
  "result", "found", "exists", "count",
]);

// Data-lookup fields that are often absent depending on input
const OPTIONAL_PATTERNS = new Set([
  "revenue", "employees", "profit", "phone", "fax", "website", "email",
  "founded", "ceo", "description", "logo", "image", "address", "industry",
  "sector", "market_cap", "stock_price", "social_media", "linkedin",
  "twitter", "facebook", "instagram",
]);

/**
 * Classifies output fields by their reliability — whether they are
 * guaranteed to be present in every successful response.
 *
 * Priority:
 * 1. Existing output_field_reliability from DB (if populated by manifest/pipeline)
 * 2. Schema "required" array
 * 3. Baseline output data (if available from prior test runs)
 * 4. Field name heuristics
 */
export function classifyOutputFields(
  outputSchema: Record<string, unknown>,
  options?: {
    existingReliability?: Record<string, string> | null;
    baselineOutputs?: Record<string, unknown>[];
  },
): Map<string, "guaranteed" | "common" | "optional"> {
  const result = new Map<string, "guaranteed" | "common" | "optional">();
  const props = (outputSchema as { properties?: Record<string, unknown> }).properties;
  if (!props) return result;

  const fields = Object.keys(props);
  const required = new Set(
    (outputSchema as { required?: string[] }).required ?? [],
  );
  const existingReliability = options?.existingReliability;
  const baselines = options?.baselineOutputs ?? [];

  for (const field of fields) {
    const lower = field.toLowerCase();

    // 1. If the capability already has output_field_reliability from manifest/pipeline, use it
    if (existingReliability?.[field]) {
      const level = existingReliability[field];
      if (level === "guaranteed") result.set(field, "guaranteed");
      else if (level === "common") result.set(field, "common");
      else result.set(field, "optional"); // "rare" maps to optional
      continue;
    }

    // 2. Schema "required" array
    if (required.has(field)) {
      result.set(field, "guaranteed");
      continue;
    }

    // 3. Baseline data (if we have captured outputs from prior runs)
    if (baselines.length > 0) {
      const presentCount = baselines.filter(
        (b) => b[field] !== null && b[field] !== undefined,
      ).length;
      const ratio = presentCount / baselines.length;

      if (ratio >= 1.0) {
        result.set(field, "guaranteed");
      } else if (ratio > 0.5) {
        result.set(field, "common");
      } else {
        result.set(field, "optional");
      }
      continue;
    }

    // 4. Field name heuristics
    if (GUARANTEED_PATTERNS.has(lower)) {
      result.set(field, "guaranteed");
    } else if (OPTIONAL_PATTERNS.has(lower)) {
      result.set(field, "optional");
    } else {
      result.set(field, "common"); // uncertain → don't assert not_null
    }
  }

  return result;
}

// ─── Output checks generation ─────────────────────────────────────────────────

/**
 * Generate validation checks for auto-generated test suites.
 * Only fields classified as "guaranteed" get not_null assertions.
 * Common and optional fields are left to schema_check dry-run validation.
 */
export function getOutputChecks(
  outputSchema: Record<string, unknown>,
  options?: {
    existingReliability?: Record<string, string> | null;
    baselineOutputs?: Record<string, unknown>[];
  },
): { checks: ValidationCheck[] } {
  const reliability = classifyOutputFields(outputSchema, options);
  const result: ValidationCheck[] = [];

  for (const [field, level] of reliability) {
    if (level === "guaranteed") {
      result.push(notNull(field));
    }
  }

  // Safety cap: max 5 guaranteed-field checks to keep tests focused
  return { checks: result.slice(0, 5) };
}

// ─── Cost and tier helpers ────────────────────────────────────────────────────

export function estimateCostCents(
  _priceCents: number,
  _transparencyTag: string | null,
): number {
  // schema_check tests use dry-run mode — no external API calls, zero cost
  return 0;
}

export function assignTier(transparencyTag: string | null, maintenanceClass?: string | null): string {
  // Maintenance-class-aware tier assignment (preferred signal)
  if (maintenanceClass) {
    switch (maintenanceClass) {
      case "pure-computation": return "A";           // zero cost → 6h
      case "free-stable-api": return "B";            // free APIs → 24h
      case "commercial-stable-api": return "B";      // paid APIs → 24h
      case "requires-domain-expertise": return "B";  // moderate cost → 24h
      case "scraping-stable-target": return "C";     // expensive → 72h
      case "scraping-fragile-target": return "C";    // expensive → 72h
    }
  }
  // Fallback: transparency tag (for backwards compatibility)
  if (transparencyTag === "algorithmic") return "A";
  return "B";
}
