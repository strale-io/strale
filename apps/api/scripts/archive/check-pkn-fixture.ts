import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const rows = await sql`
  SELECT test_name, input, validation_rules
  FROM test_suites
  WHERE capability_slug='polish-company-data' AND test_type='known_answer'`;
for (const r of rows) console.log(r.test_name, "\n  input:", JSON.stringify(r.input), "\n  rules:", JSON.stringify(r.validation_rules), "\n");
await sql.end();
