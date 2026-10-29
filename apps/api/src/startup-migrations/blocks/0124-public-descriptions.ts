import { sql } from "drizzle-orm";
import { PUBLIC_DESCRIPTIONS_0124, type PublicDescriptionRow } from "../data/public-descriptions-0124.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// Block 0124 (2026-10-27): remaining public tool descriptions.
// Copy only, guarded on exact GET /v1/capabilities values read on 2026-10-27.
// Unlisted manifests are rewritten in the repository only: no production
// value is guessed for them. Later edits are skipped, never overwritten.
// Like 0123, this deliberately leaves updated_at untouched: invariant-checker
// uses that timestamp for stale ground truth and the suspended-tool clock.
// The optional rows argument permits isolated database tests on synthetic slugs.
export async function runMigration0124_publicDescriptions(
  tx: MigrationExecutor,
  rows: readonly PublicDescriptionRow[] = PUBLIC_DESCRIPTIONS_0124,
): Promise<BlockResult> {
  // migration-data: apps/api/src/lib/public-descriptions-0124.ts
  const startedAt = Date.now();
  const BLOCK = "0124_publicDescriptions";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;
  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  const changes = rows.filter((r) => r.old_description !== r.description);
  const values = sql.join(
    changes.map((r) => sql`(${r.slug}::text, ${r.old_description}::text, ${r.description}::text)`),
    sql`, `,
  );
  const updated = changes.length === 0 ? [] : ((await tx.execute(sql`
    UPDATE capabilities AS c
       SET description = v.new_value
      FROM (VALUES ${values}) AS v (slug, old_value, new_value)
     WHERE c.slug = v.slug
       AND c.description = v.old_value
     RETURNING c.slug
  `)) as unknown as Array<{ slug: string }>);

  // Record only after successful writes; failures propagate and are retried at boot.
  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${updated.length})
    ON CONFLICT (block) DO NOTHING
  `);
  return {
    block: BLOCK,
    outcome: `${updated.length}/${changes.length} description(s); ${changes.length - updated.length} left alone (changed since snapshot or absent)`,
    rows_affected: updated.length,
    duration_ms: Date.now() - startedAt,
  };
}
