/**
 * Sync ALL manifest-canonical fields from a YAML manifest into the capabilities
 * row. Extends sync-manifest-text-to-db.ts (which only covers description +
 * schemas) to also handle name, category, data_source, maintenance_class,
 * transparency_tag, freshness_category, output_field_reliability, and the
 * Phase A0b cost-class group (cost_class, quota_window, quota_cap,
 * quota_reset_dom).
 *
 * Field set contract: every `category: "manifest"` entry in
 * FIELD_CATEGORIES (src/lib/capability-field-authority.ts) must be synced
 * here, so one run of this script clears every AuthorityViolationError the
 * onboarding gate can raise. The 2026-08-27 austrian-company-data backfill
 * aborted on cost_class drift immediately after a sync run because this
 * script predated the A0b taxonomy — that gap class is what the parity
 * check below prevents.
 *
 * Optional-field semantics mirror checkAuthorityDrift exactly: a field
 * ABSENT from the manifest is left untouched in the DB (the gate tolerates
 * manifest-undefined), while an explicit `field: null` in the YAML writes
 * NULL — which is how a cost-class transition clears its old quota fields.
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

import { openOperatorWriteDb } from "../src/lib/operator-db.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
config({ path: resolve(import.meta.dirname, "../../../.env") });

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
  name?: string;
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
  // Phase A0b cost-class taxonomy. All four are manifest-canonical;
  // quota_* may be explicit null (clears the DB value) or absent (keeps it).
  cost_class?: string | null;
  quota_window?: string | null;
  quota_cap?: number | null;
  quota_reset_dom?: number | null;
};

if (manifest.slug !== slug) {
  console.error(`Manifest slug mismatch: file says "${manifest.slug}", arg says "${slug}"`);
  process.exit(1);
}

const sql = openOperatorWriteDb(autonomousAuthority("catalogue_metadata_sync", "DEC-20260812-A"));
const dbHost = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1];
console.log(`DB host: ${dbHost}`);
console.log(`Slug: ${slug}`);
console.log(`Mode: ${dryRun ? "dry-run" : "WRITE"}`);

const before = await sql`
  SELECT slug, name, description, category, input_schema, output_schema,
         data_source, maintenance_class, transparency_tag, freshness_category,
         output_field_reliability, processes_personal_data, personal_data_categories,
         gdpr_art_22_classification, cost_class, quota_window, quota_cap,
         quota_reset_dom
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

if (manifest.name !== undefined) {
  compare("name", dbRow.name, manifest.name);
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
// Phase A0b cost-class group. Explicit null in the YAML is a declared value
// and participates in drift (it clears the DB field on write).
if (manifest.cost_class !== undefined) {
  compare("cost_class", dbRow.cost_class, manifest.cost_class);
}
if (manifest.quota_window !== undefined) {
  compare("quota_window", dbRow.quota_window, manifest.quota_window);
}
if (manifest.quota_cap !== undefined) {
  compare("quota_cap", dbRow.quota_cap, manifest.quota_cap);
}
if (manifest.quota_reset_dom !== undefined) {
  compare("quota_reset_dom", dbRow.quota_reset_dom, manifest.quota_reset_dom);
}

// transparency_tag is db-canonical (drift-audit 5.1: DB corrected invalid
// manifest values) and freshness_category is hybrid. This escape hatch still
// pushes them for genuine data-source migrations, but make the overwrite of
// a DB-authoritative value impossible to miss.
if (drifts.includes("transparency_tag") || drifts.includes("freshness_category")) {
  console.log(
    "\n⚠ transparency_tag / freshness_category are NOT manifest-canonical " +
      "(db / hybrid authority). Pushing the manifest value overwrites a " +
      "DB-corrected or operator-set value — confirm the manifest side is " +
      "actually the new truth before running without --dry-run.",
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
  SET name = ${manifest.name ?? dbRow.name},
      description = ${manifest.description},
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
      gdpr_art_22_classification = ${manifest.gdpr_art_22_classification ?? dbRow.gdpr_art_22_classification},
      cost_class = ${manifest.cost_class !== undefined ? manifest.cost_class : (dbRow.cost_class as never)},
      quota_window = ${manifest.quota_window !== undefined ? manifest.quota_window : (dbRow.quota_window as never)},
      quota_cap = ${manifest.quota_cap !== undefined ? manifest.quota_cap : (dbRow.quota_cap as never)},
      quota_reset_dom = ${manifest.quota_reset_dom !== undefined ? manifest.quota_reset_dom : (dbRow.quota_reset_dom as never)}
  WHERE slug = ${slug}
  RETURNING slug, data_source, maintenance_class, cost_class
`;

console.log(`\nUpdated ${result.length} row(s).`);
console.log(`data_source (new): ${result[0]?.data_source}`);
console.log(`maintenance_class (new): ${result[0]?.maintenance_class}`);

await sql.end();
