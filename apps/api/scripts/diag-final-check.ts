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

const slugs = ["italian-company-data","eu-court-case-search","irish-company-data","latvian-company-data","uk-rental-yield"];
const r = await sql`SELECT slug, is_active, visible, x402_enabled FROM capabilities WHERE slug = ANY(${slugs}) ORDER BY slug`;
for (const row of r) console.log(`  ${(row.slug as string).padEnd(30)} active=${row.is_active} visible=${row.visible} x402=${row.x402_enabled}`);

const totals = await sql`SELECT COUNT(*) FILTER (WHERE is_active = true AND visible = true) AS public_count, COUNT(*) AS total FROM capabilities`;
console.log("\n  publicly active:", totals[0].public_count, "of", totals[0].total);

await sql.end();
