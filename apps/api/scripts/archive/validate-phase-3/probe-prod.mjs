import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

// Gate 4 pre-check: any hook_failed rows on prod TODAY?
console.log("=== Gate 4 pre-check: existing hook_failed rows ===");
const preHookFailed = await sql`SELECT slug, lifecycle_state, updated_at FROM capabilities WHERE lifecycle_state = 'hook_failed'`;
console.log(`  count: ${preHookFailed.length}`);
for (const r of preHookFailed) console.log(`  - ${r.slug} updated_at=${r.updated_at}`);

// Candidate slugs for Gate 2: stable, active, high-SQS, NOT on obvious hot paths
console.log("");
console.log("=== Gate 2 candidates: active, SQS>=70, algorithmic or free-stable ===");
const candidates = await sql`
  SELECT slug, lifecycle_state, matrix_sqs, visible, price_cents, freshness_category,
         processes_personal_data, maintenance_class, transparency_tag,
         updated_at, last_tested_at
  FROM capabilities
  WHERE lifecycle_state = 'active'
    AND matrix_sqs IS NOT NULL
    AND matrix_sqs::float >= 70
    AND maintenance_class IN ('pure-computation', 'free-stable-api')
    AND slug NOT LIKE '%pep%'
    AND slug NOT LIKE '%sanctions%'
    AND slug NOT IN ('email-validate','dns-lookup','json-repair','url-to-markdown','iban-validate')
  ORDER BY matrix_sqs DESC
  LIMIT 10
`;
for (const r of candidates) {
  console.log(`  ${r.slug} sqs=${r.matrix_sqs} class=${r.maintenance_class} last_tested=${r.last_tested_at}`);
}

// Pretty snapshot of the top candidate (for before/after diff)
if (candidates.length > 0) {
  console.log("");
  console.log("=== Top candidate full row (Gate 2 target if accepted) ===");
  console.log(JSON.stringify(candidates[0], null, 2));
}

await sql.end();
