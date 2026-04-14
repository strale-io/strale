import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const rows = await sql<{ slug: string; output_schema: any }[]>`
    SELECT slug, output_schema FROM capabilities WHERE is_active = true`;
  let corrupted = 0;
  let healthy = 0;
  let empty = 0;
  const bad: string[] = [];
  for (const r of rows) {
    const s = r.output_schema;
    if (!s) { empty++; continue; }
    if (typeof s === "object" && !Array.isArray(s)) {
      if ("type" in s || "properties" in s) { healthy++; continue; }
      // likely char-indexed
      if ("0" in s && "1" in s) { corrupted++; bad.push(r.slug); continue; }
      empty++;
    }
  }
  console.log(`healthy: ${healthy}`);
  console.log(`corrupted (char-indexed): ${corrupted}`);
  console.log(`empty/other: ${empty}`);
  console.log(`sample corrupted: ${bad.slice(0, 20).join(", ")}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
