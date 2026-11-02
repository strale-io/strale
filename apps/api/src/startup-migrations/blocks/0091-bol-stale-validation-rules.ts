import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0091 — drop assertions on fields `beneficial-ownership-lookup` does
 * not return.
 *
 * Two of its suites still assert the pre-rewrite field names — `coverage_note`,
 * `query`, `total_owners`, `lookup_date`. The executor returns none of them in
 * either of its two response shapes; the same drift that block 0090 fixed in
 * the declared schema also reached the suites' validation_rules.
 *
 * Until 0090 these checks were masked: `output_field_reliability` carried
 * `coverage_note: common`, and Gate 1 excuses a failing check on a
 * common/rare field. Removing the dead names from the reliability map — correct
 * in itself, since they are not fields — made Gate 1 treat them as unannotated
 * and therefore enforced. The honest repair is to stop asserting fields that do
 * not exist, not to re-add fictional entries to the reliability map so the
 * assertions stay excused.
 *
 * The known_answer suite already lost its `coverage_note` check to
 * auto-remediation at 2026-08-17T07:41:03Z; this covers the two it did not
 * reach. Replacement checks name only fields observed in production.
 *
 * Idempotent via `IS DISTINCT FROM` on the value being written.
 */
export const BOL_DEPENDENCY_HEALTH_CHECKS = {
  checks: [
    { field: "jurisdiction", operator: "not_null" },
    { field: "beneficial_owners", operator: "not_null" },
    { field: "data_source", operator: "not_null" },
  ],
};

export const BOL_SCHEMA_CHECK_CHECKS = {
  checks: [
    { field: "company_name", operator: "not_null" },
    { field: "jurisdiction", operator: "not_null" },
    { field: "beneficial_owners", operator: "not_null" },
    { field: "data_source", operator: "not_null" },
    { field: "total_beneficial_owners", operator: "not_null" },
    { field: "has_psc_data", operator: "not_null" },
  ],
};

export async function runMigration0091_bolStaleValidationRules(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const dep = await tx.execute(sql`
    UPDATE test_suites
    SET validation_rules = ${JSON.stringify(BOL_DEPENDENCY_HEALTH_CHECKS)}::jsonb,
        updated_at = now()
    WHERE capability_slug = 'beneficial-ownership-lookup'
      AND test_type = 'dependency_health'
      AND validation_rules IS DISTINCT FROM ${JSON.stringify(BOL_DEPENDENCY_HEALTH_CHECKS)}::jsonb
  `);

  // Only the one schema_check suite that carries the dead names. The other
  // three assert real fields and are left alone.
  const schema = await tx.execute(sql`
    UPDATE test_suites
    SET validation_rules = ${JSON.stringify(BOL_SCHEMA_CHECK_CHECKS)}::jsonb,
        updated_at = now()
    WHERE capability_slug = 'beneficial-ownership-lookup'
      AND test_type = 'schema_check'
      AND validation_rules::text LIKE '%coverage_note%'
      AND validation_rules IS DISTINCT FROM ${JSON.stringify(BOL_SCHEMA_CHECK_CHECKS)}::jsonb
  `);

  const total =
    ((dep as { count?: number }).count ?? 0) + ((schema as { count?: number }).count ?? 0);
  return {
    block: "0091_bolStaleValidationRules",
    outcome:
      total === 0
        ? "no change (no suite still asserts the removed field names)"
        : `${total} suite(s) stopped asserting fields the executor does not return`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
