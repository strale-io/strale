/**
 * One-shot: sync onboarding_manifest.limitations from YAML to DB for
 * specific capabilities. Neither sync-manifest-text-to-db.ts nor
 * sync-manifest-canonical-to-db.ts covers limitations — they're flagged
 * as operator-tunable in those scripts. But when the limitations array in
 * the YAML is the source of truth (newly-discovered coverage gaps,
 * documentation updates), the DB needs to follow.
 *
 * Scope: ONLY onboarding_manifest['limitations']. Does not touch other
 * fields, test suites, or any operator-tunable knobs.
 *
 * Usage: cd apps/api && npx tsx scripts/sync-limitations-2026-04-29.ts <slug> [--dry-run]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!slug) {
  console.error("Usage: npx tsx scripts/sync-limitations-2026-04-29.ts <slug> [--dry-run]");
  process.exit(1);
}

const manifestPath = resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`);
const manifest = yaml.load(readFileSync(manifestPath, "utf8")) as { slug: string; limitations?: unknown[] };
if (manifest.slug !== slug) {
  console.error(`Manifest slug mismatch: file=${manifest.slug}, arg=${slug}`);
  process.exit(1);
}
const newLims = manifest.limitations ?? [];
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
console.log(`Slug: ${slug}`);
console.log(`Manifest limitations: ${newLims.length}`);
console.log(`Mode: ${dryRun ? "dry-run" : "WRITE"}`);

const before = await sql`SELECT onboarding_manifest->'limitations' AS lims FROM capabilities WHERE slug = ${slug}`;
const oldLims = (before[0]?.lims as Array<{ title?: string }> | null) ?? [];
console.log(`\nDB current limitations: ${oldLims.length}`);
for (const l of oldLims) console.log(`  - ${l.title ?? "(no title)"}`);
console.log(`\nNew limitations from manifest:`);
for (const l of newLims as Array<{ title?: string }>) console.log(`  - ${l.title ?? "(no title)"}`);

if (dryRun) {
  console.log("\n--dry-run: not writing.");
  await sql.end();
  process.exit(0);
}

const result = await sql`
  UPDATE capabilities
  SET onboarding_manifest = jsonb_set(
    COALESCE(onboarding_manifest, '{}'::jsonb),
    '{limitations}',
    ${JSON.stringify(newLims)}::jsonb,
    true
  )
  WHERE slug = ${slug}
`;
console.log(`\nUpdated ${(result as any).count ?? "?"} row(s).`);
await sql.end();
process.exit(0);
