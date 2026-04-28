/**
 * One-shot sync of the DEACTIVATED map in auto-register.ts to the DB
 * catalog columns (is_active / visible / x402_enabled).
 *
 * Background: DEACTIVATED was added to skip executor registration for caps
 * that violate ToS or are otherwise non-functional, but the DB rows kept
 * is_active=true / visible=true / x402_enabled=true. Result: the public
 * catalog and x402 storefront still listed broken caps that returned
 * "no executor registered" on call. The fix is to keep the DB in lockstep
 * with the runtime DEACTIVATED set.
 *
 * This script is idempotent — safe to re-run. autoRegisterCapabilities()
 * also runs this on every boot (see auto-register.ts), so this script is
 * mainly for ad-hoc invocation when you don't want to wait for a deploy.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });
if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = line.substring("DATABASE_URL=".length);
      break;
    }
  }
}

import postgres from "postgres";
import { getDeactivatedCapabilities } from "../src/capabilities/auto-register.js";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const dryRun = process.argv.includes("--dry-run");
const deactivated = getDeactivatedCapabilities();
const slugs = [...deactivated.keys()];

console.log(`DEACTIVATED list: ${slugs.length} caps`);

const before = await sql<
  { slug: string; is_active: boolean; visible: boolean; x402_enabled: boolean }[]
>`
  SELECT slug, is_active, visible, x402_enabled
  FROM capabilities
  WHERE slug = ANY(${slugs})
    AND (is_active = true OR visible = true OR x402_enabled = true)
`;

console.log(`\nDrift detected: ${before.length} caps still publicly active`);
for (const r of before) {
  console.log(`  ${r.slug.padEnd(30)} active=${r.is_active} visible=${r.visible} x402=${r.x402_enabled}`);
  console.log(`    reason: ${deactivated.get(r.slug)?.slice(0, 100) ?? ""}`);
}

if (dryRun) {
  console.log("\n--dry-run: not applying");
  await sql.end();
  process.exit(0);
}

if (before.length === 0) {
  console.log("\nNothing to update — DB already in sync.");
  await sql.end();
  process.exit(0);
}

const result = await sql<{ slug: string }[]>`
  UPDATE capabilities
  SET is_active = false,
      visible = false,
      x402_enabled = false,
      updated_at = NOW()
  WHERE slug = ANY(${slugs})
    AND (is_active = true OR visible = true OR x402_enabled = true)
  RETURNING slug
`;

console.log(`\nUpdated ${result.length} rows.`);
await sql.end();
