/**
 * Startup schema validation — catches missing DB columns before requests are served.
 *
 * MAINTENANCE CONTRACT:
 * When a Drizzle migration adds a column that is actively queried by the code,
 * add an entry to REQUIRED_COLUMNS. This ensures that if the migration is not
 * applied before deployment, the API fails fast on startup with a clear message
 * rather than silently serving 503s.
 *
 * Pattern: one entry per column, grouped by migration.
 * Never remove entries — they serve as a history of required schema state.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log } from "./log.js";

const REQUIRED_COLUMNS: Array<{
  table: string;
  column: string;
  migration: string;
}> = [
  {
    table: "test_suites",
    column: "generation_capability_updated_at",
    migration: "0035_test_suites_generation_metadata",
  },
  {
    table: "test_suites",
    column: "ground_truth_verified_at",
    migration: "0035_test_suites_generation_metadata",
  },
  // F-0-002: DB-backed rate limits depend on this table. If the migration
  // has not been applied, /v1/signup and /v1/auth/* return 503 (fail closed).
  // Fail fast at startup so the operator sees the real cause.
  {
    table: "rate_limit_counters",
    column: "bucket_key",
    migration: "0046_rate_limit_counters",
  },
  // F-0-009 Stage 2: retry worker needs this column. Missing column
  // means the worker would fail on every poll and pending transactions
  // would never get hashed. Column name is compliance_hash_state, not
  // integrity_hash_status — see PHASE_C_COLUMN_INVESTIGATION.md.
  {
    table: "transactions",
    column: "compliance_hash_state",
    migration: "0047_compliance_hash_state",
  },
  // F-A-001: GDPR Article 17 soft-delete. Column is queried by the
  // DELETE handler (for idempotency), the GET handler (to gate redacted
  // response), and the chain walker (to skip hash recomputation).
  {
    table: "transactions",
    column: "deleted_at",
    migration: "0048_add_transactions_deleted_at",
  },
  // Add future migration columns here as they are added
  // { table: 'table_name', column: 'column_name', migration: '0036_...' },
];

/**
 * Validate that all required DB columns exist.
 * Call at startup before serving any requests.
 *
 * On mismatch: logs the missing columns with the migration to run,
 * then exits with code 1.
 */
export async function validateSchema(): Promise<void> {
  const db = getDb();
  const missing: Array<{ table: string; column: string; migration: string }> = [];

  for (const { table, column, migration } of REQUIRED_COLUMNS) {
    const result = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    `);

    const rows = Array.isArray(result) ? result : (result as any)?.rows ?? [];
    if (rows.length === 0) {
      missing.push({ table, column, migration });
    }
  }

  if (missing.length === 0) {
    log.info({ label: "startup-schema-ok" }, "Schema validation passed — all required columns present");
    return;
  }

  // Group by migration for cleaner output
  const byMigration = new Map<string, string[]>();
  for (const { table, column, migration } of missing) {
    if (!byMigration.has(migration)) byMigration.set(migration, []);
    byMigration.get(migration)!.push(`${table}.${column}`);
  }

  log.error(
    {
      label: "startup-schema-mismatch",
      missing_by_migration: Object.fromEntries(byMigration),
      fix: "cd apps/api && npx drizzle-kit migrate",
    },
    "SCHEMA MISMATCH — DB is missing required columns. See missing_by_migration.",
  );

  process.exit(1);
}
