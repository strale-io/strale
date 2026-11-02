import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0080: cy_directors + cy_directors_sync tables ────────────────────
//
// Cyprus directors/officers cache, populated by the monthly
// `ingest-cy-directors.ts` job from the data.gov.cy DRCOR open-data CSV
// (`organisation_officials_83.csv`, CC BY 4.0). DRCOR has no stable per-row
// identifier upstream, so the natural composite PK is (entity_reg_code,
// person_or_organisation_name, official_position) — directly mirroring the
// uniqueness semantics of one (person × position) per company. Queries filter
// by entity_reg_code; the sweep DELETE relies on last_synced_at for the
// retire-stale-rows pass.
//
// Idempotency: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// The composite PK is created in-line with the table, so it lands once and
// re-runs are no-ops.

export async function runMigration0080_cyDirectors(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS cy_directors (
      entity_reg_code TEXT NOT NULL,
      person_or_organisation_name TEXT NOT NULL,
      official_position TEXT NOT NULL,
      organisation_name TEXT,
      organisation_type_code TEXT,
      organisation_type TEXT,
      role_standardized TEXT NOT NULL,
      last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_reg_code, person_or_organisation_name, official_position)
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS cy_directors_entity_idx
      ON cy_directors (entity_reg_code)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS cy_directors_last_synced_idx
      ON cy_directors (last_synced_at)
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS cy_directors_sync (
      id INTEGER PRIMARY KEY,
      last_modified_upstream TEXT,
      last_success_at TIMESTAMP WITH TIME ZONE,
      last_attempt_at TIMESTAMP WITH TIME ZONE,
      row_count INTEGER
    )
  `);

  const checkExists = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM pg_constraint
    WHERE conname = 'cy_directors_sync_singleton_chk'
      AND conrelid = 'cy_directors_sync'::regclass
  `);
  const rows = Array.isArray(checkExists)
    ? checkExists
    : (checkExists as { rows?: unknown[] })?.rows ?? [];
  if ((rows[0] as { cnt?: string })?.cnt === "0") {
    await tx.execute(sql`
      ALTER TABLE cy_directors_sync
        ADD CONSTRAINT cy_directors_sync_singleton_chk CHECK (id = 1)
    `);
  }

  return {
    block: "0080_cy_directors",
    outcome: "cy_directors + cy_directors_sync tables + indexes ensured",
    duration_ms: Date.now() - startedAt,
  };
}
