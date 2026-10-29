import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0081 — channel attribution (design doc 2026-08-12).
 * client_meta JSONB on transactions (write-only at execution time) and the
 * discovery_hits table (90-day retention via db-retention RULES). New table
 * starts empty — DEC-20260504-B backlog-drain does not apply.
 */
export async function runMigration0081_attribution(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_meta JSONB
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS discovery_hits (
      id BIGSERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      src_tag TEXT,
      ua TEXT,
      ip_hash TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS discovery_hits_created_at_idx
      ON discovery_hits (created_at)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS discovery_hits_src_tag_idx
      ON discovery_hits (src_tag) WHERE src_tag IS NOT NULL
  `);

  return {
    block: "0081_attribution",
    outcome: "client_meta column + discovery_hits table ensured (idempotent)",
    duration_ms: Date.now() - startedAt,
  };
}
