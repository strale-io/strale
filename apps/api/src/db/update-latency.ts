import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { eq } from "drizzle-orm";

const updates: [string, number][] = [
  ["norwegian-company-data", 3000],
  ["danish-company-data", 3000],
  ["finnish-company-data", 3000],
  ["iban-validate", 50],
  ["pii-redact", 3000],
  ["pdf-extract", 5000],
  ["company-enrich", 15000],
  ["ted-procurement", 5000],
];

const db = getDb();
for (const [slug, ms] of updates) {
  await db
    .update(capabilities)
    .set({ avgLatencyMs: ms })
    .where(eq(capabilities.slug, slug));
  console.log(`  ${slug} -> ${ms}ms ${ms > 10000 ? "(async)" : "(sync)"}`);
}

console.log("Done.");
process.exit(0);
