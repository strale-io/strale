import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  await sql.unsafe("ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS geography VARCHAR(50)");
  console.log("Column added/exists");

  const r1 = await sql.unsafe("UPDATE capabilities SET geography = 'nordic' WHERE slug IN ('swedish-company-data', 'danish-company-data', 'norwegian-company-data', 'finnish-company-data', 'swedish-annual-report', 'swedish-beneficial-owner', 'business-license-check-se', 'job-board-search')");
  console.log("Nordic:", r1.count);

  const r2 = await sql.unsafe("UPDATE capabilities SET geography = 'uk' WHERE slug IN ('uk-company-data', 'charity-lookup-uk', 'food-safety-rating-uk')");
  console.log("UK:", r2.count);

  const r3 = await sql.unsafe("UPDATE capabilities SET geography = 'us' WHERE slug IN ('us-company-data', 'us-sec-filing', 'us-trademark-search', 'fda-recall-search', 'us-state-business-search')");
  console.log("US:", r3.count);

  const r4 = await sql.unsafe("UPDATE capabilities SET geography = 'eu' WHERE slug IN ('vat-validate', 'eori-validate', 'gdpr-website-check', 'eu-ai-act-classify', 'data-protection-authority-lookup', 'eu-court-case-search', 'gdpr-fine-lookup', 'ted-procurement', 'customs-duty-lookup', 'ecb-interest-rates', 'austrian-company-data', 'german-company-data', 'french-company-data', 'dutch-company-data', 'belgian-company-data', 'spanish-company-data', 'italian-company-data', 'portuguese-company-data', 'irish-company-data', 'estonian-company-data', 'latvian-company-data', 'lithuanian-company-data', 'polish-company-data', 'swiss-company-data', 'sepa-xml-validate', 'vat-rate-lookup', 'vat-format-validate')");
  console.log("EU:", r4.count);

  const r5 = await sql.unsafe("UPDATE capabilities SET geography = 'global' WHERE geography IS NULL");
  console.log("Global:", r5.count);

  const counts = await sql`SELECT geography, count(*)::int as cnt FROM capabilities WHERE is_active = true GROUP BY geography ORDER BY cnt DESC`;
  console.log("\nGeography distribution:");
  for (const r of counts) {
    console.log(`  ${r.geography}: ${r.cnt}`);
  }

  await sql.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
