import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, transactions } from "./schema.js";
import { eq, sql, and, isNotNull, desc } from "drizzle-orm";

const db = getDb();

// Find all capabilities missing an example in output_schema
const missing = await db.execute(sql`
  SELECT slug, output_schema, maintenance_class
  FROM capabilities
  WHERE is_active = true
    AND output_schema::text NOT LIKE '%"example"%'
  ORDER BY slug
`);

const missingList = missing as unknown as Array<Record<string, unknown>>;
console.log(`Found ${missingList.length} capabilities missing output_schema example.\n`);

let updated = 0;
let skipped = 0;
const skippedSlugs: string[] = [];

for (const row of missingList) {
  const slug = row.slug as string;
  const schema = row.output_schema as Record<string, unknown>;

  // Strategy: find the most recent successful transaction for this capability
  // and use its output as the example
  const [recentTx] = await db
    .select({ output: transactions.output })
    .from(transactions)
    .innerJoin(capabilities, eq(capabilities.id, transactions.capabilityId))
    .where(
      and(
        eq(capabilities.slug, slug),
        eq(transactions.status, "completed"),
        isNotNull(transactions.output),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  if (!recentTx?.output || typeof recentTx.output !== "object") {
    console.log(`  ${slug}: no successful transaction found — skipping`);
    skipped++;
    skippedSlugs.push(slug);
    continue;
  }

  // Add example to the existing output_schema
  const updatedSchema = { ...schema, example: recentTx.output };

  await db
    .update(capabilities)
    .set({ outputSchema: updatedSchema, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  const exampleKeys = Object.keys(recentTx.output as object);
  console.log(`  ${slug}: added example (${exampleKeys.length} fields)`);
  updated++;
}

console.log(`\n── Summary ──`);
console.log(`  Updated: ${updated}`);
console.log(`  Skipped (no successful transaction): ${skipped}`);
if (skippedSlugs.length > 0) {
  console.log(`  Skipped slugs: ${skippedSlugs.join(", ")}`);
}

// Verify
const remaining = await db.execute(sql`
  SELECT COUNT(*)::int as count FROM capabilities
  WHERE is_active = true AND output_schema::text NOT LIKE '%"example"%'
`);
console.log(`\n  Remaining without example: ${(remaining as unknown as Array<Record<string, unknown>>)[0].count}`);

process.exit(0);
