/**
 * Backfill country-data manifest output_schemas to declare vat_number,
 * company_name, status fields that the runtime executors return but the
 * authoring-time YAML schemas omit.
 *
 * Background
 * ──────────
 *
 * 2026-05-01 seed-kyb-solutions run failed Gate 4a on `$steps[0].vat_number
 * not in <slug> output schema` for kyb-essentials-{no,de,ie,...}. The DB
 * output_schemas were patched directly to add the missing fields; this
 * script closes the resulting manifest-vs-DB drift by adding the same
 * fields to the YAML manifests.
 *
 * Affects 22 country-data caps; only adds missing keys, never removes
 * existing schema entries.
 *
 * Usage:
 *   npx tsx scripts/backfill-country-data-manifest-schemas.ts --dry-run
 *   npx tsx scripts/backfill-country-data-manifest-schemas.ts
 */

import { resolve, basename } from "node:path";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");
const manifestsDir = resolve(import.meta.dirname, "../../../manifests");

const COUNTRY_DATA_SLUGS = [
  "german-company-data",
  "dutch-company-data",
  "italian-company-data",
  "spanish-company-data",
  "portuguese-company-data",
  "austrian-company-data",
  "belgian-company-data",
  "irish-company-data",
  "latvian-company-data",
  "lithuanian-company-data",
  "singapore-company-data",
  "swiss-company-data",
  "polish-company-data",
  "croatian-company-data",
  "greek-company-data",
  "estonian-company-data",
  "cz-company-data",
  "us-company-data",
  "canadian-company-data",
  "au-company-data",
  "uk-company-data",
  "norwegian-company-data",
];

// Standard fields all country-data caps return at runtime — checked against
// each capability's executor output. company_name + status + vat_number are
// the ones the seed gate enforces; the others are commonly present too.
const STANDARD_FIELDS = [
  { key: "company_name", yaml: "    company_name:\n      type: string" },
  { key: "status", yaml: "    status:\n      type:\n        - string\n        - \"null\"" },
  { key: "vat_number", yaml: "    vat_number:\n      type:\n        - string\n        - \"null\"" },
];

let updated = 0;
let alreadyComplete = 0;
let skipped = 0;
const updates: string[] = [];

for (const slug of COUNTRY_DATA_SLUGS) {
  const path = resolve(manifestsDir, `${slug}.yaml`);
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    skipped++;
    console.log(`  ⚠ ${slug}: no manifest file`);
    continue;
  }

  // Find the output_schema.properties block. Heuristic: look for a line
  // matching ^output_schema: then ^  properties: under it. We then insert
  // missing field entries directly under that properties block.
  const outputSchemaMatch = content.match(/^output_schema:\s*$([\s\S]*?)^[a-z_]+:/m);
  if (!outputSchemaMatch) {
    skipped++;
    console.log(`  ⚠ ${slug}: no output_schema block found`);
    continue;
  }

  const propertiesIdx = content.indexOf("\n  properties:", content.indexOf("output_schema:"));
  if (propertiesIdx === -1) {
    skipped++;
    console.log(`  ⚠ ${slug}: no output_schema.properties block found`);
    continue;
  }

  // Find the line after "  properties:" — that's where we insert.
  const insertLineEnd = content.indexOf("\n", propertiesIdx + 1);
  const insertAt = insertLineEnd + 1;

  // For each missing field, insert under properties.
  let modified = false;
  let newContent = content;
  const propertiesEndPattern = /^[a-z_]+:|^output_schema:\s*$|^output_field_reliability:/m;
  // Scope: just the output_schema block. Quick scan of the substring from
  // properties: to next top-level key.
  const propertiesBlockEnd = (() => {
    const after = newContent.slice(propertiesIdx);
    const m = after.match(/\n([a-z_]+):/);
    return m ? propertiesIdx + (m.index ?? 0) : newContent.length;
  })();
  const propertiesBlock = newContent.slice(propertiesIdx, propertiesBlockEnd);

  const fieldsToAdd: typeof STANDARD_FIELDS = [];
  for (const field of STANDARD_FIELDS) {
    const fieldRe = new RegExp(`^    ${field.key}:\\s*$`, "m");
    if (!fieldRe.test(propertiesBlock)) {
      fieldsToAdd.push(field);
    }
  }

  if (fieldsToAdd.length === 0) {
    alreadyComplete++;
    continue;
  }

  const insertion = fieldsToAdd.map((f) => f.yaml).join("\n") + "\n";
  newContent = newContent.slice(0, insertAt) + insertion + newContent.slice(insertAt);
  modified = true;

  if (modified) {
    updates.push(`${slug}: + ${fieldsToAdd.map((f) => f.key).join(", ")}`);
    updated++;
    if (!dryRun) {
      writeFileSync(path, newContent, "utf-8");
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Updated:           ${updated}`);
console.log(`Already complete:  ${alreadyComplete}`);
console.log(`Skipped:           ${skipped}`);
if (updates.length) {
  console.log(`\nFields added:`);
  for (const u of updates) console.log(`  ${u}`);
}
if (dryRun) {
  console.log(`\n(dry-run — no files written)`);
}
process.exit(0);
