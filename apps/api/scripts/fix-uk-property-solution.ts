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

const before = await sql`SELECT slug, is_active, x402_enabled FROM solutions WHERE slug = 'uk-property-check'`;
console.log("before:", before);

if (before[0] && (before[0].is_active || before[0].x402_enabled)) {
  await sql`UPDATE solutions SET is_active = false, x402_enabled = false, updated_at = NOW() WHERE slug = 'uk-property-check'`;
  const after = await sql`SELECT slug, is_active, x402_enabled FROM solutions WHERE slug = 'uk-property-check'`;
  console.log("after:", after);
} else {
  console.log("no change needed");
}

await sql.end();
