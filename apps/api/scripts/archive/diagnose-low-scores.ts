import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const slugs = ["german-company-data", "email-validate"];

  for (const slug of slugs) {
    console.log(`\n========== ${slug} ==========`);

    const suites = await sql`
      SELECT id, test_type, test_mode, active, test_status, input, validation_rules
      FROM test_suites
      WHERE capability_slug = ${slug}
      ORDER BY test_type, test_name`;
    console.log(`\n-- Test suites (${suites.length}) --`);
    for (const s of suites) {
      console.log(`  [${s.test_type}] id=${s.id.slice(0,8)} mode=${s.test_mode} active=${s.active} status=${s.test_status}`);
      console.log(`    input: ${JSON.stringify(s.input)?.slice(0, 200)}`);
      console.log(`    rules: ${JSON.stringify(s.validation_rules)?.slice(0, 300)}`);
    }

    const recent = await sql`
      SELECT tr.executed_at, ts.test_type, ts.test_name, tr.passed, tr.failure_reason,
             tr.failure_classification, tr.response_time_ms
      FROM test_results tr
      JOIN test_suites ts ON ts.id = tr.test_suite_id
      WHERE tr.capability_slug = ${slug}
      ORDER BY tr.executed_at DESC
      LIMIT 25`;
    console.log(`\n-- Recent 25 test_results --`);
    for (const r of recent) {
      const status = r.passed ? "PASS" : "FAIL";
      const when = new Date(r.executed_at).toISOString().slice(5, 19);
      const reason = r.failure_reason ? ` — ${String(r.failure_reason).slice(0, 180)}` : "";
      const cls = r.failure_classification ? ` [${r.failure_classification}]` : "";
      console.log(`  ${when} ${status} ${r.test_type}/${r.test_name?.slice(0,25)}${cls} ${r.response_time_ms}ms${reason}`);
    }

    const failed = await sql`
      SELECT ts.test_type, ts.test_name, tr.failure_reason, tr.actual_output
      FROM test_results tr
      JOIN test_suites ts ON ts.id = tr.test_suite_id
      WHERE tr.capability_slug = ${slug} AND tr.passed = false
      ORDER BY tr.executed_at DESC
      LIMIT 4`;
    console.log(`\n-- Sample failing actual_output --`);
    for (const f of failed) {
      console.log(`\n  [${f.test_type}/${f.test_name}]`);
      console.log(`  reason: ${f.failure_reason}`);
      console.log(`  actual: ${JSON.stringify(f.actual_output)?.slice(0, 500)}`);
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
