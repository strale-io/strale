import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { sql } from "drizzle-orm";

const db = getDb();

// Maintenance-class-aware tier assignment:
// pure-computation       → A (6h)  — zero cost, fast feedback
// free-stable-api        → B (24h) — free APIs, moderate frequency
// commercial-stable-api  → B (24h) — paid APIs with SLAs
// requires-domain-expertise → B (24h)
// scraping-stable-target → C (72h) — expensive, stable targets
// scraping-fragile-target → C (72h) — expensive, fragile targets

console.log("=== Backfilling schedule_tier based on maintenance_class ===\n");

const updates = [
  { class: "pure-computation", tier: "A" },
  { class: "free-stable-api", tier: "B" },
  { class: "commercial-stable-api", tier: "B" },
  { class: "requires-domain-expertise", tier: "B" },
  { class: "scraping-stable-target", tier: "C" },
  { class: "scraping-fragile-target", tier: "C" },
];

let totalUpdated = 0;

for (const { class: mc, tier } of updates) {
  const result = await db.execute(sql`
    UPDATE test_suites ts
    SET schedule_tier = ${tier}
    FROM capabilities c
    WHERE c.slug = ts.capability_slug
      AND c.is_active = true
      AND ts.active = true
      AND c.maintenance_class = ${mc}
      AND ts.schedule_tier != ${tier}
  `);
  const count = (result as any).rowCount ?? (result as any).count ?? 0;
  console.log(`  ${mc.padEnd(30)} → tier ${tier}: ${count} suites updated`);
  totalUpdated += Number(count);
}

console.log(`\nTotal suites updated: ${totalUpdated}`);

// Verify
console.log("\n=== Verification: new distribution ===");
const dist = await db.execute(sql`
  SELECT c.maintenance_class, ts.schedule_tier, COUNT(*)::int as count
  FROM test_suites ts
  JOIN capabilities c ON c.slug = ts.capability_slug
  WHERE c.is_active = true AND ts.active = true
  GROUP BY c.maintenance_class, ts.schedule_tier
  ORDER BY c.maintenance_class, ts.schedule_tier
`);
for (const row of dist as unknown as Array<Record<string, unknown>>) {
  console.log(`  ${String(row.maintenance_class).padEnd(30)} tier ${row.schedule_tier}: ${row.count}`);
}

process.exit(0);
