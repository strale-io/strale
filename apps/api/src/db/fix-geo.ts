import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  // Fix eu-trademark-search
  await sql.unsafe("UPDATE capabilities SET geography = 'eu' WHERE slug = 'eu-trademark-search'");
  console.log("Fixed eu-trademark-search -> eu");

  // Fix public-holiday-lookup (Nager.Date, EU-focused)
  await sql.unsafe("UPDATE capabilities SET geography = 'eu' WHERE slug = 'public-holiday-lookup'");

  // Fix salary-benchmark, employer-review-summary (EU source data)
  // Actually these are global tools, leave as global

  // Check lei-lookup (GLEIF is global)
  // Check container-track (global)

  // Verify final counts
  const counts = await sql`SELECT geography, count(*)::int as cnt FROM capabilities WHERE is_active = true GROUP BY geography ORDER BY cnt DESC`;
  console.log("\nFinal distribution:");
  for (const r of counts) console.log(`  ${r.geography}: ${r.cnt}`);

  await sql.end();
}

run().catch(console.error);
