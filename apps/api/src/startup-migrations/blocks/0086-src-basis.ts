import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0086 — how we know where a caller came from.
 *
 * `src_basis` records HOW a discovery hit was attributed: 'tagged' (a ?src=
 * parameter we added ourselves), 'referer' (the venue's page linked to us), or
 * 'agent' (the venue's crawler identified itself). Without it, a weak signal
 * and a strong one are indistinguishable once stored, and the weakest is the
 * most numerous.
 *
 * Nullable with no backfill: the 2,196 rows written before this point have no
 * recoverable basis, and inventing one would be worse than leaving it unknown.
 * DEC-20260504-B does not apply — an ADD COLUMN with no default rewrites
 * nothing.
 */
export async function runMigration0086_srcBasis(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`ALTER TABLE discovery_hits ADD COLUMN IF NOT EXISTS src_basis TEXT`);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_discovery_hits_src
      ON discovery_hits (src_tag, created_at) WHERE src_tag IS NOT NULL`);
  return { block: "0086_srcBasis", outcome: "applied", duration_ms: Date.now() - startedAt };
}
