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
const rows = await sql<Array<{ capability_slug: string; n: number; first: Date; last: Date }>>`
  SELECT capability_slug, COUNT(*)::int AS n, MIN(executed_at) AS first, MAX(executed_at) AS last
  FROM test_results
  WHERE executed_at >= NOW() - INTERVAL '7 days'
  GROUP BY capability_slug
  ORDER BY n DESC
`;
console.log(`\n=== ${rows.length} caps tested in last 7 days ===\n`);
for (const r of rows) {
  console.log(`  ${r.capability_slug.padEnd(35)} n=${String(r.n).padStart(5)} first=${r.first.toISOString().slice(0, 19)} last=${r.last.toISOString().slice(0, 19)}`);
}
await sql.end();
process.exit(0);
