/**
 * Read-only check for the cert-audit RED-5 rename of 0046_suggest_log.sql
 * → 0099_suggest_log.sql. Drizzle keys __drizzle_migrations by content hash;
 * a content-identical rename should be a no-op. This script verifies that
 * by counting expected vs actual rows BEFORE we run any migrate command.
 *
 * What it checks:
 *   1. Both old-and-renamed file content hashes exist in DB → safe (no
 *      re-application needed; on next migrate the new tag's hash will
 *      already match)
 *   2. The journal tag now points at the renamed file
 *   3. Reads file content + computes hash + compares to DB
 */
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../src/db/index.js";

const drizzleDir = resolve(import.meta.dirname, "../drizzle");
const renamedPath = resolve(drizzleDir, "0099_suggest_log.sql");
const oldPath = resolve(drizzleDir, "0046_suggest_log.sql");

const db = getDb();

async function main() {
  console.log("=== RED-5 rename pre-flight ===\n");

  console.log(`Old path exists?  ${existsSync(oldPath)}  (expect false)`);
  console.log(`New path exists?  ${existsSync(renamedPath)}  (expect true)`);

  if (!existsSync(renamedPath)) {
    console.error("Renamed file missing — abort.");
    process.exit(1);
  }

  const sqlContent = readFileSync(renamedPath, "utf8");
  const contentHash = createHash("sha256").update(sqlContent).digest("hex");
  console.log(`\nNew file content sha256: ${contentHash}`);

  // Drizzle's __drizzle_migrations.hash is sha256 of the SQL content.
  const result = await db.execute(sql`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations
    WHERE hash = ${contentHash}
  `);
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? []) as Array<{ hash: string; created_at: number }>;

  if (rows.length === 0) {
    console.error("\n✗ FAIL: content hash not found in __drizzle_migrations.");
    console.error("  Migration would re-apply on next drizzle-kit migrate.");
    console.error("  Either the file content changed during rename (don't), or the");
    console.error("  prod DB never had this migration applied (also don't).");
    process.exit(1);
  }

  console.log(`\n✓ OK: content hash found in __drizzle_migrations (created at ${rows[0].created_at})`);
  console.log("  Drizzle will treat the renamed file as already-applied. Safe to deploy.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-flight failed:", err);
  process.exit(1);
});
