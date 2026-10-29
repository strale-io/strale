import { sql } from "drizzle-orm";
import { CAPABILITY_OUTPUT_CONTRACTS, CORRECTED_SLUGS } from "../../lib/capability-output-contracts.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0090 — realign seven capabilities' declared output contract with what
 * their executors actually return.
 *
 * The harness measures a capability against `output_schema.properties` (Gate 2,
 * null-field ratio) and `output_field_reliability` (Gate 3, guaranteed-fields
 * sentinel). Seven capabilities had declarations describing a shape their
 * executors stopped returning, so the harness reported them broken while
 * production answered every call correctly. See
 * lib/capability-output-contracts.ts for each shape and how it was captured.
 *
 * Two capabilities also carry a replacement known-answer fixture input: their
 * stored inputs were placeholders (`test_value`, "This is a test input for
 * automated capability testing.") that exercise the empty branch, so the suite
 * asked the capability to find nothing and then failed it for finding nothing.
 *
 * Idempotent: each UPDATE is guarded by `IS DISTINCT FROM` on the value being
 * written, so a re-run on a corrected row affects zero rows. Changing a suite's
 * input bumps `updated_at`, which invalidates its now-wrong fixture baseline
 * under the staleness rule added in the same release — the suite re-executes
 * live and re-captures. That interaction is deliberate.
 */
export async function runMigration0090_capabilityOutputContracts(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let schemaRows = 0;
  let reliabilityRows = 0;
  let fixtureRows = 0;

  for (const slug of CORRECTED_SLUGS) {
    const contract = CAPABILITY_OUTPUT_CONTRACTS[slug]!;

    // jsonb_set on `properties` alone, so a hand-written `example`, `type` or
    // `required` elsewhere in the schema survives.
    const schemaRes = await tx.execute(sql`
      UPDATE capabilities
      SET output_schema = jsonb_set(
            COALESCE(output_schema, '{"type":"object"}'::jsonb),
            '{properties}',
            ${JSON.stringify(contract.properties)}::jsonb,
            true
          )
      WHERE slug = ${slug}
        AND COALESCE(output_schema->'properties', 'null'::jsonb)
            IS DISTINCT FROM ${JSON.stringify(contract.properties)}::jsonb
    `);
    schemaRows += (schemaRes as { count?: number }).count ?? 0;

    const relRes = await tx.execute(sql`
      UPDATE capabilities
      SET output_field_reliability = ${JSON.stringify(contract.reliability)}::jsonb
      WHERE slug = ${slug}
        AND COALESCE(output_field_reliability, 'null'::jsonb)
            IS DISTINCT FROM ${JSON.stringify(contract.reliability)}::jsonb
    `);
    reliabilityRows += (relRes as { count?: number }).count ?? 0;

    if (contract.knownAnswerInput) {
      const fixRes = await tx.execute(sql`
        UPDATE test_suites
        SET input = ${JSON.stringify(contract.knownAnswerInput)}::jsonb,
            updated_at = now()
        WHERE capability_slug = ${slug}
          AND test_type = 'known_answer'
          AND input IS DISTINCT FROM ${JSON.stringify(contract.knownAnswerInput)}::jsonb
      `);
      fixtureRows += (fixRes as { count?: number }).count ?? 0;
    }
  }

  const total = schemaRows + reliabilityRows + fixtureRows;
  return {
    block: "0090_capabilityOutputContracts",
    outcome:
      total === 0
        ? "no change (all seven contracts already match the executors)"
        : `${schemaRows} schema, ${reliabilityRows} reliability, ${fixtureRows} fixture input(s) realigned`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
