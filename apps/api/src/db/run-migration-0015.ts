import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "./index.js";

const db = getDb();

const statements = [
  `ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS freshness_category TEXT`,
  `ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS data_update_cycle_days INTEGER`,
  `ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS dataset_last_updated TIMESTAMPTZ`,
  `ALTER TABLE test_results ADD COLUMN IF NOT EXISTS output_hash TEXT`,
];

for (const stmt of statements) {
  console.log(`  ${stmt}`);
  await db.execute(sql.raw(stmt));
}

console.log("Migration 0015 complete.");
process.exit(0);
