import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";
config({ path: resolve(import.meta.dirname, "../../../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const slug = process.argv[2] || "address-geocode";
const r = await sql`SELECT output_field_reliability FROM capabilities WHERE slug = ${slug}`;
const dbVal = r[0]?.output_field_reliability;
const m = yaml.load(
  readFileSync(resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`), "utf8"),
) as { output_field_reliability?: Record<string, string> };
const yamlVal = m.output_field_reliability;
console.log(`Slug: ${slug}`);
console.log(`\nDB (keys=${Object.keys((dbVal as object) ?? {}).length}):`);
console.log(JSON.stringify(dbVal, null, 2));
console.log(`\nYAML (keys=${Object.keys(yamlVal ?? {}).length}):`);
console.log(JSON.stringify(yamlVal, null, 2));
console.log(`\nIdentical (JSON.stringify): ${JSON.stringify(dbVal) === JSON.stringify(yamlVal)}`);
console.log(`Same keys: ${JSON.stringify(Object.keys((dbVal as object) ?? {}).sort()) === JSON.stringify(Object.keys(yamlVal ?? {}).sort())}`);
await sql.end();
process.exit(0);
