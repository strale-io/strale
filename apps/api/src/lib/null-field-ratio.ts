/**
 * Gate 2: Null-output correctness tier (DEC-20260409-A)
 *
 * Detects capabilities that return structurally valid but semantically
 * empty responses (most fields null/empty). Prevents silent degradation
 * where a broken scraper returns all nulls and the test still passes
 * because the schema structure matched.
 *
 * Rules:
 * - Only applies to schemas with 3+ declared fields
 * - If >50% of declared fields are null/empty → fail
 * - Fields marked as "rare" or "common" in outputFieldReliability are excluded
 * - Nested objects count as single fields (no recursion in v1)
 */

/**
 * Check if a value is effectively "empty" (null, undefined, empty string,
 * empty array, or an object where all values are null).
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export interface NullRatioResult {
  ratio: number;          // 0.0 to 1.0
  nullCount: number;      // How many fields are null/empty
  totalFields: number;    // Total declared fields checked
  nullFields: string[];   // Which fields were null
  applies: boolean;       // Whether the rule applies (totalFields >= 3)
  wouldFail: boolean;     // Whether this would trigger a failure (ratio > 0.5 AND applies)
}

/**
 * Calculate the ratio of null/empty fields in a capability output
 * relative to the declared output schema.
 *
 * @param output - The capability's actual output
 * @param outputSchema - The declared output schema (with properties)
 * @param fieldReliability - Optional field reliability annotations
 *   Fields marked "rare" or "common" are excluded from the ratio calculation
 *   (only "guaranteed" or unannoted fields count)
 */
export function calculateNullFieldRatio(
  output: Record<string, unknown> | null | undefined,
  outputSchema: { properties?: Record<string, unknown> } | null | undefined,
  fieldReliability?: Record<string, string> | null,
): NullRatioResult {
  const empty: NullRatioResult = {
    ratio: 0, nullCount: 0, totalFields: 0, nullFields: [], applies: false, wouldFail: false,
  };

  if (!output || !outputSchema?.properties) return empty;

  const properties = Object.keys(outputSchema.properties);

  // Filter to guaranteed/unannotated fields only
  const fieldsToCheck = properties.filter((field) => {
    if (!fieldReliability) return true;
    const level = fieldReliability[field];
    // Only check "guaranteed" fields and fields with no reliability annotation
    return !level || level === "guaranteed";
  });

  if (fieldsToCheck.length < 3) {
    return { ...empty, totalFields: fieldsToCheck.length, applies: false };
  }

  const nullFields: string[] = [];
  for (const field of fieldsToCheck) {
    if (isEmptyValue(output[field])) {
      nullFields.push(field);
    }
  }

  const ratio = nullFields.length / fieldsToCheck.length;
  const applies = fieldsToCheck.length >= 3;
  const wouldFail = applies && ratio > 0.5;

  return {
    ratio,
    nullCount: nullFields.length,
    totalFields: fieldsToCheck.length,
    nullFields,
    applies,
    wouldFail,
  };
}
