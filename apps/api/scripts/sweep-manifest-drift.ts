/**
 * Drift sweep across all manifests vs DB.
 *
 * Compares the canonical fields between manifests/*.yaml and the
 * capabilities table for every YAML manifest. Reports drift per cap.
 * Read-only — does NOT apply fixes; for that, run
 * sync-manifest-canonical-to-db.ts <slug> per drifted cap.
 *
 * Why: yesterday's audit-grade hardening for adverse-media-check ran
 * sync-manifest-text-to-db.ts (which only covers description + schemas)
 * but never the canonical-sync, leaving transparency_tag and other
 * runtime-affecting fields out of sync. The audit-honesty work this
 * session caught it for adverse-media-check; this sweep checks every
 * other capability for the same gap.
 *
 * Usage: cd apps/api && npx tsx scripts/sweep-manifest-drift.ts [--apply]
 *   default: dry-run, prints drift report.
 *   --apply: also runs the canonical sync per drifted cap (CAUTION:
 *            changes runtime behavior on caps where transparency_tag
 *            / data_source / output_field_reliability / etc differ).
 */
import { config } from "dotenv";
import { resolve, basename } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

interface Manifest {
  slug: string;
  data_source?: unknown;
  maintenance_class?: unknown;
  transparency_tag?: unknown;
  freshness_category?: unknown;
  output_field_reliability?: unknown;
  processes_personal_data?: unknown;
  personal_data_categories?: unknown[];
}

interface Drift {
  slug: string;
  fields: Array<{ field: string; db: unknown; manifest: unknown }>;
}

const manifestDir = resolve(import.meta.dirname, "../../../manifests");
const manifestFiles = readdirSync(manifestDir).filter((f) => f.endsWith(".yaml"));
console.log(`Sweeping ${manifestFiles.length} manifests against DB...\n`);

const drifts: Drift[] = [];
let cleanCount = 0;
let missingCount = 0;
const transparencyDrifts: Drift[] = [];

for (const file of manifestFiles) {
  const slug = basename(file, ".yaml");
  let manifest: Manifest;
  try {
    manifest = yaml.load(readFileSync(resolve(manifestDir, file), "utf8")) as Manifest;
  } catch (err) {
    console.log(`✗ ${slug}: failed to parse YAML — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  if (manifest.slug !== slug) {
    console.log(`✗ ${slug}: manifest slug mismatch (${manifest.slug})`);
    continue;
  }

  const rows = await sql`
    SELECT slug, data_source, maintenance_class, transparency_tag, freshness_category,
           output_field_reliability, processes_personal_data, personal_data_categories
    FROM capabilities
    WHERE slug = ${slug}
  `;
  if (rows.length === 0) {
    missingCount++;
    continue;
  }
  const dbRow = rows[0];

  const fields: Array<{ field: string; db: unknown; manifest: unknown }> = [];
  // Stable canonical-form comparison — JSONB roundtrip in PostgreSQL doesn't
  // preserve object-key insertion order, so naive JSON.stringify on the same
  // {a: 1, b: 2} vs {b: 2, a: 1} produces "different" strings. Sort keys
  // recursively so semantically-equal objects compare equal.
  function canonicalize(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonicalize);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) sorted[k] = canonicalize(o[k]);
      return sorted;
    }
    return v;
  }
  function compare(field: string, dbVal: unknown, manifestVal: unknown) {
    if (manifestVal === undefined) return; // manifest doesn't declare this field — skip
    if (JSON.stringify(canonicalize(dbVal)) !== JSON.stringify(canonicalize(manifestVal))) {
      fields.push({ field, db: dbVal, manifest: manifestVal });
    }
  }
  compare("data_source", dbRow.data_source, manifest.data_source);
  compare("maintenance_class", dbRow.maintenance_class, manifest.maintenance_class);
  compare("transparency_tag", dbRow.transparency_tag, manifest.transparency_tag);
  compare("freshness_category", dbRow.freshness_category, manifest.freshness_category);
  compare("output_field_reliability", dbRow.output_field_reliability, manifest.output_field_reliability);
  compare("processes_personal_data", dbRow.processes_personal_data, manifest.processes_personal_data);
  compare("personal_data_categories", dbRow.personal_data_categories, manifest.personal_data_categories);

  if (fields.length === 0) {
    cleanCount++;
  } else {
    const drift = { slug, fields };
    drifts.push(drift);
    if (fields.some((f) => f.field === "transparency_tag")) {
      transparencyDrifts.push(drift);
    }
  }
}

console.log(`=== Sweep summary ===\n`);
console.log(`Manifests examined: ${manifestFiles.length}`);
console.log(`Clean (no drift):   ${cleanCount}`);
console.log(`Drifted:            ${drifts.length}`);
console.log(`Missing in DB:      ${missingCount}`);
console.log(`Of which transparency_tag drifts (audit-honesty critical): ${transparencyDrifts.length}\n`);

if (transparencyDrifts.length > 0) {
  console.log(`=== TRANSPARENCY_TAG DRIFTS — audit body lying about AI involvement ===\n`);
  for (const d of transparencyDrifts) {
    const t = d.fields.find((f) => f.field === "transparency_tag")!;
    console.log(`  ${d.slug.padEnd(36)} db=${JSON.stringify(t.db)}  →  manifest=${JSON.stringify(t.manifest)}`);
  }
  console.log();
}

if (drifts.length > 0) {
  console.log(`=== All drifts (one line per cap) ===\n`);
  for (const d of drifts) {
    console.log(`  ${d.slug.padEnd(36)} ${d.fields.map((f) => f.field).join(", ")}`);
  }
  console.log();
}

if (apply && drifts.length > 0) {
  console.log(`\n=== APPLYING canonical sync to ${drifts.length} drifted caps ===\n`);
  // Spawn the existing sync-manifest-canonical-to-db.ts per cap so we
  // benefit from its existing field-by-field write logic.
  const { spawn } = await import("node:child_process");
  let applied = 0;
  let failed = 0;
  for (const d of drifts) {
    const result = await new Promise<{ code: number; out: string }>((resolveP) => {
      let out = "";
      const child = spawn("npx", ["tsx", "scripts/sync-manifest-canonical-to-db.ts", d.slug], {
        cwd: resolve(import.meta.dirname, ".."),
        shell: true,
      });
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (out += chunk));
      child.on("close", (code) => resolveP({ code: code ?? -1, out }));
    });
    if (result.code === 0) {
      applied++;
      console.log(`  ✓ ${d.slug}`);
    } else {
      failed++;
      console.log(`  ✗ ${d.slug} (exit ${result.code})`);
      console.log(`    ${result.out.split("\n").filter((l) => l).slice(-3).join(" | ")}`);
    }
  }
  console.log(`\nApplied: ${applied}  Failed: ${failed}`);
}

await sql.end();
process.exit(0);
