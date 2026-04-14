import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const slugs = ["irish-company-data", "danish-company-data", "australian-company-data", "italian-company-data", "polish-company-data"];

for (const slug of slugs) {
  console.log(`\n========== ${slug} ==========`);
  // Test suites
  const suites = await sql`
    SELECT test_type, test_name, input, validation_rules, test_status
    FROM test_suites
    WHERE capability_slug = ${slug} AND active = true
    ORDER BY test_type`;
  console.log(`-- Suites (${suites.length}) --`);
  for (const s of suites) {
    console.log(`  [${s.test_type}/${s.test_name?.slice(0,40)}] status=${s.test_status}`);
    console.log(`    input: ${JSON.stringify(s.input)?.slice(0,150)}`);
  }

  // Last 15 results
  const results = await sql`
    SELECT tr.executed_at, ts.test_type, ts.test_name, tr.passed, tr.failure_reason, tr.failure_classification
    FROM test_results tr
    JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.capability_slug = ${slug}
    ORDER BY tr.executed_at DESC
    LIMIT 15`;
  console.log(`\n-- Last 15 runs --`);
  for (const r of results) {
    const when = new Date(r.executed_at).toISOString().slice(5, 16);
    const status = r.passed ? "PASS" : "FAIL";
    const reason = r.failure_reason ? ` — ${String(r.failure_reason).slice(0, 140)}` : "";
    console.log(`  ${when} ${status} ${r.test_type}/${r.test_name?.slice(0,25)}${reason}`);
  }
}

await sql.end();
