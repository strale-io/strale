import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(import.meta.dirname, '../../../.env') });
import { getDb } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Check column defaults
  const result = await db.execute(sql`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_name = 'capabilities'
      AND column_name IN ('lifecycle_state', 'visible', 'degraded_recovery_count')
    ORDER BY column_name
  `);

  const rows = Array.isArray(result) ? result : (result as any).rows;
  console.log('Column defaults:');
  for (const row of rows) {
    console.log(`  ${row.column_name}: DEFAULT = ${row.column_default}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
