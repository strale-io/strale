import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0079: ee_directors + ee_directors_sync tables ────────────────────
//
// Estonian directors/representatives cache, populated by the nightly
// `ingest-ee-directors.ts` job from the RIK Ariregister CC BY 4.0 open-data
// dump. PK is `kirje_id` from upstream (unique per registry-card filing);
// queries filter by `entity_reg_code` and `end_date IS NULL` for active
// representatives. `ee_directors_sync` is a single-row marker tracking the
// upstream Last-Modified header so the ingest can skip on no-op days.
//
// Idempotency: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// Re-runs on a healthy DB are no-ops.

export async function runMigration0079_eeDirectors(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS ee_directors (
      kirje_id INTEGER PRIMARY KEY,
      entity_reg_code TEXT NOT NULL,
      person_type TEXT NOT NULL,
      role_code TEXT NOT NULL,
      role_text TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      isikukood_hash TEXT,
      foreign_code TEXT,
      foreign_country_code TEXT,
      foreign_country_text TEXT,
      address_text TEXT,
      address_country_code TEXT,
      start_date DATE,
      end_date DATE,
      last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS ee_directors_entity_idx
      ON ee_directors (entity_reg_code)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS ee_directors_last_synced_idx
      ON ee_directors (last_synced_at)
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS ee_directors_sync (
      id INTEGER PRIMARY KEY,
      last_modified_upstream TEXT,
      last_success_at TIMESTAMP WITH TIME ZONE,
      last_attempt_at TIMESTAMP WITH TIME ZONE,
      row_count INTEGER
    )
  `);

  // CHECK constraint guarded against re-add. Pinning id=1 keeps the marker
  // a single-row table without needing a separate enum / UUID.
  const checkExists = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM pg_constraint
    WHERE conname = 'ee_directors_sync_singleton_chk'
      AND conrelid = 'ee_directors_sync'::regclass
  `);
  const rows = Array.isArray(checkExists)
    ? checkExists
    : (checkExists as { rows?: unknown[] })?.rows ?? [];
  if ((rows[0] as { cnt?: string })?.cnt === "0") {
    await tx.execute(sql`
      ALTER TABLE ee_directors_sync
        ADD CONSTRAINT ee_directors_sync_singleton_chk CHECK (id = 1)
    `);
  }

  return {
    block: "0079_ee_directors",
    outcome: "ee_directors + ee_directors_sync tables + indexes ensured",
    duration_ms: Date.now() - startedAt,
  };
}
