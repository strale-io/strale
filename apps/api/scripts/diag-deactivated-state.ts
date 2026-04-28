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

const slugs = [
  "linkedin-url-validate","austrian-company-data","dutch-company-data",
  "portuguese-company-data","lithuanian-company-data","spanish-company-data",
  "german-company-data","trustpilot-score","salary-benchmark",
  "employer-review-summary","patent-search",
];

const rows = await sql`
  SELECT slug, is_active, visible, x402_enabled, name
  FROM capabilities WHERE slug = ANY(${slugs})
  ORDER BY slug
`;
console.log("=== Catalog state of caps in DEACTIVATED list ===");
for (const r of rows) {
  console.log(`  ${(r.slug as string).padEnd(30)} active=${r.is_active} visible=${r.visible} x402=${r.x402_enabled}`);
}

console.log("\n=== Solutions referencing these slugs ===");
const sols = await sql`
  SELECT DISTINCT s.slug, s.is_active
  FROM solutions s
  INNER JOIN solution_steps ss ON ss.solution_id = s.id
  WHERE ss.capability_slug = ANY(${slugs})
  ORDER BY s.slug
`;
for (const s of sols) console.log(`  ${(s.slug as string).padEnd(30)} active=${s.is_active}`);

await sql.end();
