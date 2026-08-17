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

const ukSlugs = [
  "uk-epc-rating","uk-flood-risk","uk-sold-prices","uk-rental-yield",
  "uk-crime-stats","uk-deprivation-index","uk-transport-access",
  "council-tax-lookup","stamp-duty-calculate",
];

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'solution_steps' ORDER BY ordinal_position`;
console.log("solution_steps cols:", cols.map((r:any)=>r.column_name).join(","));
const solCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'solutions' ORDER BY ordinal_position`;
console.log("solutions cols:", solCols.map((r:any)=>r.column_name).join(","));

const rows = await sql`
  SELECT s.slug AS solution_slug, s.is_active,
         ARRAY_AGG(ss.capability_slug) AS steps
  FROM solutions s
  JOIN solution_steps ss ON ss.solution_id = s.id
  WHERE EXISTS (
    SELECT 1 FROM solution_steps ss2
    WHERE ss2.solution_id = s.id AND ss2.capability_slug = ANY(${ukSlugs})
  )
  GROUP BY s.slug, s.is_active
  ORDER BY s.slug
`;

console.log("Solutions referencing parked UK property caps:");
for (const row of rows) {
  console.log(`  ${(row.solution_slug as string).padEnd(30)} active=${row.is_active}`);
  console.log(`    steps: ${(row.steps as string[]).join(", ")}`);
}

await sql.end();
