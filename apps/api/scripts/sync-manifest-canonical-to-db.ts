/**
 * Sync ALL manifest-canonical fields from a YAML manifest into the capabilities
 * row. Extends sync-manifest-text-to-db.ts (which only covers description +
 * schemas) to also handle category, data_source, maintenance_class,
 * transparency_tag, freshness_category, and output_field_reliability.
 *
 * Why: when migrating an existing capability to a new data source (e.g.
 * Tier-1 violation remediation: Browserless scrape → direct API), several
 * manifest-canonical fields legitimately drift simultaneously.
 * `onboard.ts --backfill --force-override-authority` refuses these — the
 * authority gate treats manifest-canonical drift as a bug, not a migration
 * intent.
 *
 * This script is the migration escape hatch: load the manifest, show drift,
 * push to DB. Direct SQL UPDATE — no orchestrator gates. Use only when the
 * data source has actually changed and the manifest is the new truth.
 *
 * Scope: ONLY manifest-canonical fields. Does not touch pricing, schedules,
 * test suites, limitations, lifecycle_state, or operator-tunable fields.
 *
 * Usage:
 *   npx tsx scripts/sync-manifest-canonical-to-db.ts <slug> [--dry-run]
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
  console.error("Usage: npx tsx scripts/sync-manifest-canonical-to-db.ts <slug> [--dry-run]");
  process.exit(1);
}

const manifestPath = resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`);
const manifest = yaml.load(readFileSync(manifestPath, "utf8")) as {
  slug: string;
  description: string;
  category: string;
  input_schema: unknown;
  output_schema: unknown;
  data_source: string;
  maintenance_class?: string;
  transparency_tag?: string;
  freshness_category?: string;
  output_field_reliability?: Record<string, string>;
  processes_personal_data?: boolean;
  personal_data_categories?: string[];
  // Bucket C — Art. 22 classification, manifest-canonical from
  // 2026-04-30. Optional; the DB applies a 'data_lookup' default
  // when unset.
  gdpr_art_22_classification?: string;
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
  SELECT slug, description, category, input_schema, output_schema,
         data_source, maintenance_class, transparency_tag, freshness_category,
         output_field_reliability, processes_personal_data, personal_data_categories,
         gdpr_art_22_classification
  FROM capabilities
  WHERE slug = ${slug}
`;

if (before.length === 0) {
  console.error(`No capabilities row found for slug "${slug}"`);
  await sql.end();
  process.exit(1);
}

const dbRow = before[0];
const drifts: string[] = [];

/**
 * Serialise with object keys in a stable order, at every depth.
 *
 * Postgres `jsonb` does not preserve insertion order — it stores keys sorted
 * by length then bytewise. A plain `JSON.stringify` comparison therefore
 * reports drift forever for any object whose manifest key order differs from
 * jsonb's, even immediately after a successful write.
 *
 * That phantom drift is not cosmetic. This script pushes ALL manifest-canonical
 * fields in one shot, so a field that always looks dirty is an standing
 * invitation to re-run it — and a re-run happily overwrites a *genuinely*
 * newer prod value with a stale manifest one. That near-miss is exactly what
 * happened with google-search's output_schema during the #160 sync.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function compare(field: string, dbVal: unknown, manifestVal: unknown) {
  const a = canonical(dbVal);
  const b = canonical(manifestVal);
  if (a !== b) {
    drifts.push(field);
    console.log(`\n--- ${field} drift ---`);
    console.log(`  DB:       ${a.slice(0, 300)}${a.length > 300 ? "..." : ""}`);
    console.log(`  Manifest: ${b.slice(0, 300)}${b.length > 300 ? "..." : ""}`);
  }
}

compare("description", dbRow.description, manifest.description);
compare("category", dbRow.category, manifest.category);
compare("input_schema", dbRow.input_schema, manifest.input_schema);
compare("output_schema", dbRow.output_schema, manifest.output_schema);
compare("data_source", dbRow.data_source, manifest.data_source);
if (manifest.maintenance_class !== undefined) {
  compare("maintenance_class", dbRow.maintenance_class, manifest.maintenance_class);
}
if (manifest.transparency_tag !== undefined) {
  compare("transparency_tag", dbRow.transparency_tag, manifest.transparency_tag);
}
if (manifest.freshness_category !== undefined) {
  compare("freshness_category", dbRow.freshness_category, manifest.freshness_category);
}
if (manifest.output_field_reliability !== undefined) {
  compare(
    "output_field_reliability",
    dbRow.output_field_reliability,
    manifest.output_field_reliability,
  );
}
if (manifest.processes_personal_data !== undefined) {
  compare(
    "processes_personal_data",
    dbRow.processes_personal_data,
    manifest.processes_personal_data,
  );
}
if (manifest.personal_data_categories !== undefined) {
  compare(
    "personal_data_categories",
    dbRow.personal_data_categories,
    manifest.personal_data_categories,
  );
}
if (manifest.gdpr_art_22_classification !== undefined) {
  compare(
    "gdpr_art_22_classification",
    dbRow.gdpr_art_22_classification,
    manifest.gdpr_art_22_classification,
  );
}

if (drifts.length === 0) {
  console.log("\nNo drift — DB already matches manifest. Nothing to do.");
  await sql.end();
  process.exit(0);
}

console.log(`\n=== Drift summary: ${drifts.length} field(s) — ${drifts.join(", ")} ===`);

if (dryRun) {
  console.log("\n--dry-run: not writing.");
  await sql.end();
  process.exit(0);
}

const result = await sql`
  UPDATE capabilities
  SET description = ${manifest.description},
      category = ${manifest.category},
      input_schema = ${sql.json(manifest.input_schema as never)},
      output_schema = ${sql.json(manifest.output_schema as never)},
      data_source = ${manifest.data_source},
      maintenance_class = ${manifest.maintenance_class ?? dbRow.maintenance_class},
      transparency_tag = ${manifest.transparency_tag ?? dbRow.transparency_tag},
      freshness_category = ${manifest.freshness_category ?? dbRow.freshness_category},
      output_field_reliability = ${
        manifest.output_field_reliability !== undefined
          ? sql.json(manifest.output_field_reliability)
          : (dbRow.output_field_reliability as never)
      },
      processes_personal_data = ${manifest.processes_personal_data ?? dbRow.processes_personal_data},
      personal_data_categories = ${
        manifest.personal_data_categories !== undefined
          ? sql.array(manifest.personal_data_categories, 1009)
          : (dbRow.personal_data_categories as never)
      },
      gdpr_art_22_classification = ${manifest.gdpr_art_22_classification ?? dbRow.gdpr_art_22_classification}
  WHERE slug = ${slug}
  RETURNING slug, data_source, maintenance_class
`;

console.log(`\nUpdated ${result.length} row(s).`);
console.log(`data_source (new): ${result[0]?.data_source}`);
console.log(`maintenance_class (new): ${result[0]?.maintenance_class}`);

await sql.end();
