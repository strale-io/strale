/**
 * Sync manifest-canonical fields (description, input_schema, output_schema)
 * from a YAML manifest into the capabilities row.
 *
 * Why: onboard.ts --backfill refuses to push manifest-canonical drifts on the
 * grounds that those fields should be set at create-time only. When the
 * manifest is intentionally updated post-create (e.g. ToS-driven copy change
 * to a platform list, or adding a missing field description), this is the
 * escape hatch.
 *
 * Scope: updates ONLY description, input_schema, output_schema. Does not
 * touch pricing, schedules, test suites, limitations, or any operator-tunable
 * field.
 *
 * Usage:
 *   npx tsx scripts/sync-manifest-text-to-db.ts <slug> [--dry-run]
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";
import * as yaml from "js-yaml";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!slug) {
  console.error("Usage: npx tsx scripts/sync-manifest-text-to-db.ts <slug> [--dry-run]");
  process.exit(1);
}

const manifestPath = resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`);
const manifestRaw = readFileSync(manifestPath, "utf8");
const manifest = yaml.load(manifestRaw) as {
  slug: string;
  description: string;
  input_schema: unknown;
  output_schema: unknown;
};

if (manifest.slug !== slug) {
  console.error(`Manifest slug mismatch: file says "${manifest.slug}", arg says "${slug}"`);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const dbHost = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1];
console.log(`DB host: ${dbHost}`);
console.log(`Slug: ${slug}`);
console.log(`Mode: ${dryRun ? "dry-run" : "WRITE"}`);

const before = await sql`
  SELECT slug, description, input_schema, output_schema
  FROM capabilities
  WHERE slug = ${slug}
`;

if (before.length === 0) {
  console.error(`No capabilities row found for slug "${slug}"`);
  await sql.end();
  process.exit(1);
}

const beforeRow = before[0];
console.log("\n--- BEFORE ---");
console.log(`description: ${beforeRow.description}`);
console.log(`input_schema: ${JSON.stringify(beforeRow.input_schema).slice(0, 200)}...`);
console.log(`output_schema: ${JSON.stringify(beforeRow.output_schema).slice(0, 200)}...`);

console.log("\n--- MANIFEST ---");
console.log(`description: ${manifest.description}`);
console.log(`input_schema: ${JSON.stringify(manifest.input_schema).slice(0, 200)}...`);
console.log(`output_schema: ${JSON.stringify(manifest.output_schema).slice(0, 200)}...`);

const descriptionEqual = beforeRow.description === manifest.description;
const inputSchemaEqual =
  JSON.stringify(beforeRow.input_schema) === JSON.stringify(manifest.input_schema);
const outputSchemaEqual =
  JSON.stringify(beforeRow.output_schema) === JSON.stringify(manifest.output_schema);

if (descriptionEqual && inputSchemaEqual && outputSchemaEqual) {
  console.log("\nNo drift — DB already matches manifest. Nothing to do.");
  await sql.end();
  process.exit(0);
}

console.log("\n--- DRIFT ---");
if (!descriptionEqual) console.log("- description differs");
if (!inputSchemaEqual) console.log("- input_schema differs");
if (!outputSchemaEqual) console.log("- output_schema differs");

if (dryRun) {
  console.log("\n--dry-run: not writing.");
  await sql.end();
  process.exit(0);
}

const result = await sql`
  UPDATE capabilities
  SET description = ${manifest.description},
      input_schema = ${sql.json(manifest.input_schema as object)},
      output_schema = ${sql.json(manifest.output_schema as object)}
  WHERE slug = ${slug}
  RETURNING slug, description
`;

console.log(`\nUpdated ${result.length} row(s).`);
console.log(`description (new): ${result[0]?.description}`);

await sql.end();
