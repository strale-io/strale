/**
 * Pause 3 Italian KYB solutions whose chains include italian-company-data,
 * which was deactivated 2026-04-28 alongside eu-court-case-search per the
 * Strale Tier 1 doctrine (DEC-20260428-A). Mirrors the pattern used by
 * apps/api/scripts/drop-aggregator-kyb.ts (DEC-20260427-I).
 *
 * Idempotent — safe to re-run.
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

const slugs = ["kyb-essentials-it", "kyb-complete-it", "invoice-verify-it"];

const before = await sql<{ slug: string; is_active: boolean; x402_enabled: boolean }[]>`
  SELECT slug, is_active, x402_enabled FROM solutions WHERE slug = ANY(${slugs})
`;
console.log("before:");
for (const r of before) console.log(`  ${r.slug.padEnd(25)} active=${r.is_active} x402=${r.x402_enabled}`);

const drift = before.filter((r) => r.is_active || r.x402_enabled);
if (drift.length === 0) {
  console.log("\nAll already paused — nothing to do.");
  await sql.end();
  process.exit(0);
}

if (process.argv.includes("--dry-run")) {
  console.log("\n--dry-run: would update", drift.length, "rows");
  await sql.end();
  process.exit(0);
}

const result = await sql<{ slug: string }[]>`
  UPDATE solutions
  SET is_active = false, x402_enabled = false, updated_at = NOW()
  WHERE slug = ANY(${slugs}) AND (is_active = true OR x402_enabled = true)
  RETURNING slug
`;
console.log(`\nUpdated ${result.length} rows: ${result.map((r) => r.slug).join(", ")}`);

await sql.end();
