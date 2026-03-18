import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(import.meta.dirname, '../../../.env') });
import { getDb } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  const stmts = [
    "ALTER TABLE capabilities ALTER COLUMN lifecycle_state SET DEFAULT 'draft'",
    "ALTER TABLE capabilities ALTER COLUMN visible SET DEFAULT false",
    "ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS degraded_recovery_count INTEGER NOT NULL DEFAULT 0",
  ];

  const db = getDb();
  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
    console.log('OK:', stmt.substring(0, 70));
  }
  console.log('Migration 0024 applied.');
}

main().catch(e => { console.error(e); process.exit(1); });
