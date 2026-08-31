/** Property-level diff of input_schema: DB vs manifest. READ-ONLY. */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";

config({ path: "C:/Users/pette/Projects/strale/.env" });

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });
const [row] = await sql`SELECT input_schema FROM capabilities WHERE slug = 'image-resize'`;
const manifest = yaml.load(
  readFileSync(resolve(import.meta.dirname, "../../../manifests/image-resize.yaml"), "utf8"),
) as { input_schema: any };

const db = row!.input_schema as any;
const mf = manifest.input_schema;

const changes: string[] = [];

function walk(path: string, a: any, b: any) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    const av = a?.[k];
    const bv = b?.[k];
    const bothObj =
      av && bv && typeof av === "object" && typeof bv === "object" &&
      !Array.isArray(av) && !Array.isArray(bv);
    if (bothObj) {
      walk(p, av, bv);
    } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
      const kind = av === undefined ? "ADDED" : bv === undefined ? "REMOVED" : "CHANGED";
      changes.push(`${kind.padEnd(8)} ${p}: ${JSON.stringify(av)} -> ${JSON.stringify(bv)}`);
    }
  }
}
walk("", db, mf);

console.log("=== input_schema, property-level diff (DB -> manifest) ===");
for (const c of changes) console.log("  " + c);
console.log(`\nTOTAL_CHANGES=${changes.length}`);

const expected = [
  "properties.format.enum",
  "properties.fit.enum",
  "properties.quality.minimum",
  "properties.quality.maximum",
].sort();
const actual = changes.map((c) => c.split(/\s+/)[1]!.replace(/:$/, "")).sort();
console.log(`EXPECTED_SET=${JSON.stringify(expected)}`);
console.log(`ACTUAL_SET  =${JSON.stringify(actual)}`);
console.log(`EXACT_MATCH=${JSON.stringify(expected) === JSON.stringify(actual)}`);
await sql.end();
