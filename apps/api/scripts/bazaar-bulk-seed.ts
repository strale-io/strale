/**
 * One-shot tool: backup + discount + restore x402 prices so we can pay a
 * minimal $0.01 per capability to trigger Bazaar discovery indexing.
 *
 * Usage:
 *   npx tsx scripts/bazaar-bulk-seed.ts backup           # writes backup.json
 *   npx tsx scripts/bazaar-bulk-seed.ts discount         # sets all x402_enabled caps to $0.01
 *   npx tsx scripts/bazaar-bulk-seed.ts restore          # restores prices from backup.json
 *
 * The actual payments are made by c:/tmp/x402-test/bulk-seed.mjs which reads
 * the live /x402/catalog on api.strale.io and iterates every x402-enabled slug.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const BACKUP_PATH = path.join(process.cwd(), "bazaar-bulk-seed-backup.json");

async function backup() {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT slug, x402_price_usd::text AS price
    FROM capabilities
    WHERE x402_enabled = true
    ORDER BY slug
  `);
  const data: Record<string, string | null> = {};
  for (const r of rows as unknown as Array<{ slug: string; price: string | null }>) {
    data[r.slug] = r.price;
  }
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2));
  console.log(`Backed up ${Object.keys(data).length} capability prices to ${BACKUP_PATH}`);
}

async function discount() {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error(`ERROR: No backup at ${BACKUP_PATH}. Run 'backup' first.`);
    process.exit(1);
  }
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE capabilities
    SET x402_price_usd = '0.01'
    WHERE x402_enabled = true
  `);
  console.log(`Discount applied. Rows affected: ${(result as any).rowCount ?? "(unknown)"}`);
  console.log("Wait ~60s for the x402-gateway in-process cache to expire before seeding.");
}

async function restore() {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error(`ERROR: No backup at ${BACKUP_PATH}.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(BACKUP_PATH, "utf-8")) as Record<string, string | null>;
  const db = getDb();
  let restored = 0;
  for (const [slug, price] of Object.entries(data)) {
    if (price === null) continue;
    await db.execute(sql`
      UPDATE capabilities
      SET x402_price_usd = ${price}::numeric
      WHERE slug = ${slug}
    `);
    restored++;
  }
  console.log(`Restored ${restored} capability prices from ${BACKUP_PATH}`);
}

const cmd = process.argv[2];
const fn = { backup, discount, restore }[cmd as "backup" | "discount" | "restore"];
if (!fn) {
  console.error("Usage: bazaar-bulk-seed.ts <backup|discount|restore>");
  process.exit(1);
}
await fn();
process.exit(0);
