/**
 * Field volatility classification (DEC-20260319-E).
 *
 * Determines whether a field's value is stable enough for an exact-value
 * (`equals`) assertion in known_answer tests.
 *
 * - stable:   Value doesn't change (IDs, country codes, names, formats)
 * - volatile: Value changes over time (financials, counts, rates, prices)
 * - computed: Derived from external data that updates (sanctions, risk scores)
 *
 * Volatile and computed fields get a `type` check instead of `equals`,
 * preventing the "Spotify AB sanctions-check" class of fixture drift.
 */

export type FieldVolatility = "stable" | "volatile" | "computed";

// ─── Heuristic patterns ────────────────────────────────────────────────────

const VOLATILE_PATTERNS = [
  // Financial
  /revenue|profit|income|turnover|balance|debt|asset|equity|market_cap/,
  // Headcount
  /employee|headcount|staff|workforce|fte/,
  // Pricing / rates
  /price|cost|rate|exchange|fee|amount|salary|wage/,
  // Counts — require segment boundary to avoid matching "country_code"
  /(^|_)(count|total)($|_)|num_|number_of/,
  // Scores / rankings
  /score|rating|rank|position/,
  // Temporal
  /date|time|updated|modified|fetched|last_|created_at|_at$/,
  /age|tenure|duration/,
];

const COMPUTED_PATTERNS = [
  // Sanctions / screening
  /is_sanctioned|is_pep|is_blocked|is_listed/,
  // Risk assessments
  /risk_level|risk_score|risk_rating|risk_category/,
  // Match results
  /match_count|matches|hits|findings/,
  // Reputation / sentiment
  /reputation|sentiment|confidence/,
  // Status (changes over time — but NOT status_code which is fixed)
  /^status$/,
];

const STABLE_PATTERNS = [
  // Identifiers
  /^id$|_id$|slug|code|type|format|kind|category|classification/,
  // Names / labels
  /name|title|label|description/,
  // Geography
  /country|region|city|address|location/,
  // URLs
  /url|uri|link|website|domain/,
  // Code fields
  /currency_code|country_code|language_code|_code$/,
  // Validation results (boolean flags from our code, not external data)
  /^valid$|^is_valid$|^verified$|^format_valid$/,
];

// ─── Classification function ────────────────────────────────────────────────

/**
 * Classify a field's volatility based on its name and value.
 *
 * Priority: manifest override → heuristic patterns → type-based default.
 */
export function classifyFieldVolatility(
  fieldName: string,
  value: unknown,
  manifestOverrides?: Record<string, FieldVolatility> | null,
): FieldVolatility {
  // 1. Manifest override takes precedence
  if (manifestOverrides?.[fieldName]) {
    return manifestOverrides[fieldName];
  }

  const name = fieldName.toLowerCase();

  // 2. Check computed patterns first — specific patterns like match_count,
  //    is_sanctioned should win over broader volatile patterns like _count
  if (COMPUTED_PATTERNS.some((p) => p.test(name))) return "computed";

  // 3. Check stable patterns — stable identifiers like country_code
  //    should not be caught by volatile's _count pattern
  if (STABLE_PATTERNS.some((p) => p.test(name))) return "stable";

  // 4. Check volatile patterns last (broadest)
  if (VOLATILE_PATTERNS.some((p) => p.test(name))) return "volatile";

  // 5. Default by value type: numbers tend to change, others tend to be stable
  if (typeof value === "number") return "volatile";
  return "stable";
}

/**
 * Generate the appropriate validation check for a known_answer field
 * based on its volatility classification.
 *
 * - stable → { field, operator: "equals", value }
 * - volatile/computed → { field, operator: "type", value: typeString }
 */
export function makeVolatilityAwareCheck(
  field: string,
  value: unknown,
  volatility: FieldVolatility,
): { field: string; operator: string; value?: unknown } | null {
  if (volatility === "stable") {
    return { field, operator: "equals", value };
  }

  // For volatile/computed fields: assert the type, not the value
  if (typeof value === "boolean") {
    return { field, operator: "type", value: "boolean" };
  }
  if (typeof value === "number") {
    return { field, operator: "type", value: "number" };
  }
  if (typeof value === "string") {
    return { field, operator: "type", value: "string" };
  }
  if (Array.isArray(value)) {
    return { field, operator: "type", value: "array" };
  }

  // For objects or other types, not_null (from Layer 1) is sufficient
  return null;
}
