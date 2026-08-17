import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const rows = await sql`
  SELECT slug, matrix_sqs, matrix_sqs_raw, qp_score, rp_score
  FROM capabilities
  WHERE slug IN ('german-company-data', 'email-validate')`;
for (const r of rows) {
  console.log(`${r.slug}: matrix_sqs=${r.matrix_sqs} raw=${r.matrix_sqs_raw} QP=${r.qp_score} RP=${r.rp_score}`);
}
await sql.end();
