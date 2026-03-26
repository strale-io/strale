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
    console.log("[startup] Schema validation passed — all required columns present.");
    return;
  }

  // Group by migration for cleaner output
  const byMigration = new Map<string, string[]>();
  for (const { table, column, migration } of missing) {
    if (!byMigration.has(migration)) byMigration.set(migration, []);
    byMigration.get(migration)!.push(`${table}.${column}`);
  }

  console.error("[startup] ════════════════════════════════════════════");
  console.error("[startup] SCHEMA MISMATCH — DB is missing required columns");
  console.error("[startup] The following migrations have not been applied:");
  console.error("[startup]");

  for (const [migration, columns] of byMigration) {
    console.error(`[startup]   Migration: ${migration}`);
    console.error(`[startup]   Missing:   ${columns.join(", ")}`);
    console.error("[startup]");
  }

  console.error("[startup] To fix, run:");
  console.error("[startup]   cd apps/api && npx drizzle-kit migrate");
  console.error("[startup] ════════════════════════════════════════════");

  process.exit(1);
}
