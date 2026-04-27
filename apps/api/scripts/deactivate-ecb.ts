/**
 * One-shot: deactivate ecb-interest-rates in production DB.
 * Reason: ECB SDW geo-restricted from Railway US East. Cap stuck at
 * last_tested_at=2026-03-23, consuming ~89% of scheduler bandwidth.
 * See 2026-04-27 staleness investigation in handoff log.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) { process.env.DATABASE_URL = line.substring("DATABASE_URL=".length); break; }
  }
}

import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const before = await sql<Array<{ slug: string; is_active: boolean; last_tested_at: Date | null }>>`
  SELECT slug, is_active, last_tested_at FROM capabilities WHERE slug = 'ecb-interest-rates'
`;
console.log("BEFORE:", before[0]);

const result = await sql`
  UPDATE capabilities
  SET is_active = false, updated_at = NOW()
  WHERE slug = 'ecb-interest-rates' AND is_active = true
  RETURNING slug, is_active
`;
console.log(`UPDATED: ${result.length} row(s)`, result[0] ?? null);

const after = await sql<Array<{ slug: string; is_active: boolean; last_tested_at: Date | null }>>`
  SELECT slug, is_active, last_tested_at FROM capabilities WHERE slug = 'ecb-interest-rates'
`;
console.log("AFTER:", after[0]);

await sql.end();
process.exit(0);
