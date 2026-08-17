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

const cap = await sql<Array<{ slug: string; last_tested_at: Date | null; matrix_sqs: string | null; is_active: boolean }>>`
  SELECT slug, last_tested_at, matrix_sqs::text, is_active FROM capabilities WHERE slug = 'ecb-interest-rates'
`;
console.log("ecb-interest-rates row:");
console.log(cap[0]);

const suites = await sql<Array<{ id: string; test_name: string; test_type: string; schedule_tier: string; test_status: string; active: boolean }>>`
  SELECT id::text, test_name, test_type, schedule_tier, test_status, active FROM test_suites WHERE capability_slug = 'ecb-interest-rates'
`;
console.log(`\n${suites.length} test suites:`);
for (const s of suites) console.log(`  ${s.test_name.padEnd(40)} type=${s.test_type} tier=${s.schedule_tier} status=${s.test_status} active=${s.active}`);

const recent = await sql<Array<{ executed_at: Date; passed: boolean; test_name: string }>>`
  SELECT tr.executed_at, tr.passed, ts.test_name
  FROM test_results tr
  JOIN test_suites ts ON ts.id = tr.test_suite_id
  WHERE tr.capability_slug = 'ecb-interest-rates'
  ORDER BY tr.executed_at DESC
  LIMIT 10
`;
console.log("\nLast 10 test results:");
for (const r of recent) console.log(`  ${r.executed_at.toISOString().slice(0,19)} passed=${r.passed} test=${r.test_name}`);

const passRate = await sql<Array<{ passed: boolean; n: number }>>`
  SELECT passed, COUNT(*)::int AS n FROM test_results
  WHERE capability_slug = 'ecb-interest-rates' AND executed_at >= NOW() - INTERVAL '7 days'
  GROUP BY passed
`;
console.log("\nLast 7 days pass distribution:");
for (const r of passRate) console.log(`  passed=${r.passed}  n=${r.n}`);

await sql.end();
process.exit(0);
