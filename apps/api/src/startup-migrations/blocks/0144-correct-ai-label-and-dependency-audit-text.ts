import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0144 — two narrowing corrections found by the promise audit
 * (docs/research/2026-11-06-customer-promise-inventory.md, P-039 and P-038).
 *
 * 1. `env-template-generate` asks a Claude model to write each variable's
 *    description and example value, yet production tags it `algorithmic`, so
 *    its tool page prints "Computed by fixed rules and lookups; no AI model
 *    writes the answer." `transparency_tag` is db-canonical
 *    (capability-field-authority.ts), so the boot manifest sync never writes
 *    it; this block does. The manifest carries the same value.
 * 2. `dependency-audit` queries the npm or PyPI registry and OSV.dev, uses no
 *    AI model, and its limitation still reads "AI-based audit of declared
 *    dependencies". Limitations are not part of the boot text sync, so this
 *    block rewrites that one row, guarded on the exact production text read
 *    from strale.io/tools/dependency-audit on 2026-11-06. Its `data_source`
 *    ("no external data") is manifest-canonical and reaches production
 *    through the boot sync (developer-tools is not report-only).
 *
 * Both only narrow a claim, inside DEC-20260822-A part 2. Neither is a
 * compliance-category row.
 *
 * capabilities.updated_at is deliberately not written (same rule as blocks
 * 0123 and 0143: invariant-checker.ts reads it as "the capability changed").
 *
 * Run policy "once". Each statement is guarded on the old value, so a second
 * run writes 0 rows and a later edit is never overwritten. Rows touched: at
 * most one capability and one limitation; no bulk operation (DEC-20260504-B).
 * Only strings are bound (DEC-20260504-A).
 */
export const ENV_TEMPLATE_SLUG = "env-template-generate";
export const DEPENDENCY_AUDIT_SLUG = "dependency-audit";

export const DEPENDENCY_AUDIT_OLD_LIMITATION =
  "AI-based audit of declared dependencies — cannot detect transitive vulnerability chains or runtime-only dependencies";
export const DEPENDENCY_AUDIT_NEW_LIMITATION =
  "Checks only the dependencies declared in the file, against the npm or PyPI registry and OSV.dev; it cannot detect transitive vulnerability chains or runtime-only dependencies";

export async function runMigration0144_correctAiLabelAndDependencyAuditText(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const rowCount = (res: unknown) => (res as { count?: number }).count ?? 0;

  const tag = rowCount(
    await tx.execute(sql`
      UPDATE capabilities
         SET transparency_tag = ${"ai_generated"}
       WHERE slug = ${ENV_TEMPLATE_SLUG}
         AND transparency_tag = ${"algorithmic"}
    `),
  );

  const limitation = rowCount(
    await tx.execute(sql`
      UPDATE capability_limitations
         SET limitation_text = ${DEPENDENCY_AUDIT_NEW_LIMITATION},
             updated_at = now()
       WHERE capability_slug = ${DEPENDENCY_AUDIT_SLUG}
         AND active = true
         AND limitation_text = ${DEPENDENCY_AUDIT_OLD_LIMITATION}
    `),
  );

  const total = tag + limitation;
  return {
    block: "0144_correctAiLabelAndDependencyAuditText",
    outcome:
      total === 0
        ? "no change (both corrections already applied)"
        : `corrected (env-template-generate tag ${tag}, dependency-audit limitation ${limitation})`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
