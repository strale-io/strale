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

const slugs = ["italian-company-data", "eu-court-case-search"];
const rows = await sql`
  SELECT s.slug AS solution_slug, s.is_active, s.x402_enabled,
         ARRAY_AGG(ss.capability_slug) AS steps
  FROM solutions s
  JOIN solution_steps ss ON ss.solution_id = s.id
  WHERE EXISTS (
    SELECT 1 FROM solution_steps ss2
    WHERE ss2.solution_id = s.id AND ss2.capability_slug = ANY(${slugs})
  )
  GROUP BY s.slug, s.is_active, s.x402_enabled
  ORDER BY s.slug
`;

console.log(`Solutions referencing ${slugs.join(" / ")}:`);
for (const row of rows) {
  console.log(`  ${(row.solution_slug as string).padEnd(30)} active=${row.is_active} x402=${row.x402_enabled}`);
  console.log(`    steps: ${(row.steps as string[]).join(", ")}`);
}

await sql.end();
