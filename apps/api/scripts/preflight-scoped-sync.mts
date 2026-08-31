/**
 * READ-ONLY preflight for a scoped manifest sync.
 *
 * Drives the MERGED tooling's own functions — parseFieldSelection,
 * buildAssignments, and the same canonical() comparison the script uses — but
 * against the read-only DATABASE_URL. It never imports operator-db and never
 * constructs a write connection.
 *
 * Why this exists rather than `sync-... --dry-run`: the script opens
 * openOperatorWriteDb() at line 127, before it reaches the `if (dryRun)` exit
 * at 282. So --dry-run cannot run without a write credential, which makes it
 * useless as the artefact a founder approves a mutation against. Reported as a
 * residual; this preflight is the read-only stand-in.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";

import {
  parseFieldSelection,
  buildAssignments,
  unwritableSelected,
  CANONICAL_SYNC_FIELD_NAMES,
} from "../src/lib/manifest-sync-fields.js";

config({ path: "C:/Users/pette/Projects/strale/.env" });

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"))!;
const selection = parseFieldSelection(args);

const manifest = yaml.load(
  readFileSync(resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`), "utf8"),
) as Record<string, unknown>;

// READ-ONLY connection. Deliberately the plain DATABASE_URL.
const url = process.env.DATABASE_URL!;
console.log(`DB host:      ${url.match(/@([^/:]+)/)?.[1]}`);
console.log(`Slug:         ${slug}`);
console.log(`Mode:         PREFLIGHT (read-only; no write connection opened)`);
console.log(`Field scope:  ${selection.mode} -> ${selection.fields.join(", ")}`);
console.log(
  `Write creds:  DATABASE_URL_WRITE=${process.env.DATABASE_URL_WRITE ? "SET" : "unset"}  ` +
    `STRALE_FOUNDER_GRANT=${process.env.STRALE_FOUNDER_GRANT ? "SET" : "unset"}`,
);

const sql = postgres(url, { ssl: false, max: 1 });

const [dbRow] = await sql`
  SELECT slug, name, description, category, input_schema, output_schema,
         data_source, maintenance_class, transparency_tag, freshness_category,
         output_field_reliability, processes_personal_data, personal_data_categories,
         gdpr_art_22_classification, cost_class, quota_window, quota_cap,
         quota_reset_dom
  FROM capabilities WHERE slug = ${slug}`;

/** Byte-for-byte the script's comparison, including the key-order normalisation. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

const selected = new Set(selection.fields);
const drifts: string[] = [];

console.log(`\n=== Comparison, restricted to the selected scope ===`);
for (const field of CANONICAL_SYNC_FIELD_NAMES) {
  if (!selected.has(field)) continue;
  if (manifest[field] === undefined) {
    console.log(`  ${field}: absent from the manifest — would be left untouched`);
    continue;
  }
  const a = canonical((dbRow as Record<string, unknown>)[field]);
  const b = canonical(manifest[field]);
  if (a === b) {
    console.log(`  ${field}: identical — nothing to write`);
  } else {
    drifts.push(field);
    console.log(`\n  --- ${field} DRIFT ---`);
    console.log(`    DB:       ${a}`);
    console.log(`    Manifest: ${b}`);
  }
}

// The write set, from the same function the script calls.
const assignments = buildAssignments(drifts, manifest);
const skipped = unwritableSelected(drifts, manifest);

console.log(`\n=== The write that WOULD be executed ===`);
console.log(`  columns: ${assignments.length ? assignments.map((a) => a.column).join(", ") : "(none)"}`);
if (skipped.length) console.log(`  skipped (absent from manifest): ${skipped.join(", ")}`);

console.log(`\n=== Columns NOT in scope (left untouched regardless of drift) ===`);
for (const field of CANONICAL_SYNC_FIELD_NAMES) {
  if (selected.has(field)) continue;
  if (manifest[field] === undefined) continue;
  const differs =
    canonical((dbRow as Record<string, unknown>)[field]) !== canonical(manifest[field]);
  console.log(`  ${field.padEnd(28)} ${differs ? "DRIFTED — and NOT written" : "identical"}`);
}

console.log(
  `\nDIFF_FIELDS=${drifts.join(",")}\nWRITE_FIELDS=${assignments.map((a) => a.column).join(",")}`,
);
await sql.end();
