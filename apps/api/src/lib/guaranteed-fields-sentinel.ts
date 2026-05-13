/**
 * Canonical-input sentinel — strict-missing-only assertion on guaranteed fields.
 *
 * Phase 3 Harden for DEC-20260513-B + DEC-20260513-C. Companion to the
 * audit-follow-up test coverage rule (DEC-20260504-A). Catches the class of
 * bug surfaced 2026-05-13 by the CH swiss-company-data bad-fixture incident:
 * Zefix returned 200 OK [] for an invalid UID, the parser yielded an
 * actual_output object that contained none of the declared fields, and the
 * known_answer suite still passed because the `not_null` checks at the
 * expected_fields layer found `value == null` for fields that were never set
 * in the first place and bailed without enforcement.
 *
 * Strict-missing-only semantics: only key absence flips the suite to failed.
 * Field-present-with-null, field-present-with-empty-collection, and
 * field-present-with-empty-string all pass this gate. Validators, scanners,
 * and dedupers legitimately return `findings=[]` / `duplicates_found=[]` /
 * `errors=[]` to mean "no findings / no duplicates / no errors" — those are
 * successful results, not degraded ones. The 50%-null-ratio gate
 * (DEC-20260409-A, lib/null-field-ratio.ts) governs the null and
 * empty-collection signals separately.
 *
 * v1 (halted) used a non-empty rule and would have flipped 40 healthy
 * capabilities to failed at the next scheduler tick. v2 (this module)
 * flips exactly the 4 capabilities with real missing-key parser bugs
 * (charity-lookup-uk.income, japanese-company-data.corporate_number,
 * llm-output-validate.auto_fixed_output, openapi-validate.stats — each
 * surfaces as a separate per-capability triage prompt).
 */

export interface SentinelResult {
  passed: boolean;
  failureReason?: string;
}

export function checkGuaranteedFieldsPresent(
  output: unknown,
  fieldReliability: Record<string, string> | null | undefined,
): SentinelResult {
  if (!fieldReliability) return { passed: true };

  const guaranteedFields = Object.entries(fieldReliability)
    .filter(([, level]) => level === "guaranteed")
    .map(([field]) => field);

  if (guaranteedFields.length === 0) return { passed: true };

  // Root must be a plain object. Array, null, or non-object output fails
  // by definition — there are no named keys to verify against.
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return {
      passed: false,
      failureReason: "guaranteed_field_missing:<root-not-object>",
    };
  }

  const outputRecord = output as Record<string, unknown>;
  for (const field of guaranteedFields) {
    if (!(field in outputRecord)) {
      return {
        passed: false,
        failureReason: `guaranteed_field_missing:${field}`,
      };
    }
  }
  return { passed: true };
}
