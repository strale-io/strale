import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // Check current state first
  const before = await sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name IN ('user_id', 'is_free_tier')
    ORDER BY column_name`;
  console.log("Before migration:", before);

  if (before.find((r: any) => r.column_name === "is_free_tier")) {
    console.log("Migration 0021 already applied — is_free_tier column exists.");
    await sql.end();
    return;
  }

  console.log("Applying migration 0021...");
  await sql`ALTER TABLE "transactions" ALTER COLUMN "user_id" DROP NOT NULL`;
  await sql`ALTER TABLE "transactions" ADD COLUMN "is_free_tier" boolean NOT NULL DEFAULT false`;

  const after = await sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name IN ('user_id', 'is_free_tier')
    ORDER BY column_name`;
  console.log("After migration:", after);
  console.log("Migration 0021 complete.");

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
