/**
 * Phase 4b.1 — transparency_tag fixup (DB rows + YAMLs).
 *
 * Context:
 *   `transparency_tag` is DB-canonical per 4a FIELD_CATEGORIES. The valid
 *   enum is (algorithmic | ai_generated | mixed | null). Two DB rows still
 *   hold the legacy `external_api` value (not in enum); seven YAMLs carry
 *   that stale value even though five of those seven slugs have already
 *   been corrected in the DB (Class 4 drift per drift-inventory audit).
 *
 * What this script does:
 *   1. Pre-state snapshot: SELECT the 2 invalid DB rows.
 *   2. UPDATE 2 DB rows (domain-age-check, postal-code-lookup) to
 *      `algorithmic` — each was verified against its executor in the
 *      Phase 4b.1 audit (WHOIS-parse and Zippopotam.us respectively;
 *      both deterministic, no AI synthesis).
 *   3. Rewrite 7 YAML files to align with DB:
 *        domain-age-check              external_api → algorithmic (DB: external_api → algorithmic same pass)
 *        postal-code-lookup            external_api → algorithmic (same)
 *        holiday-calendar              external_api → algorithmic (DB already algorithmic)
 *        insolvency-check              external_api → algorithmic (DB already algorithmic)
 *        beneficial-ownership-lookup   external_api → algorithmic (DB already algorithmic)
 *        address-geocode               external_api → algorithmic (DB already algorithmic)
 *        address-validate              external_api → algorithmic (DB already algorithmic)
 *   4. Post-state snapshot: SELECT the 2 rows again, assert update landed.
 *
 * Rollback SQL (keep for reference — DO NOT delete after running):
 *   UPDATE capabilities SET transparency_tag = 'external_api'
 *    WHERE slug IN ('domain-age-check','postal-code-lookup');
 *
 * YAML rollback: git revert the 4b.1 commit.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { readFileSync, writeFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const DB_FIX_SLUGS = ["domain-age-check", "postal-code-lookup"] as const;
const YAML_FIX_SLUGS = [
  "domain-age-check",
  "postal-code-lookup",
  "holiday-calendar",
  "insolvency-check",
  "beneficial-ownership-lookup",
  "address-geocode",
  "address-validate",
] as const;

const MANIFEST_DIR = resolve(import.meta.dirname, "../../../manifests");

async function main() {
  const db = getDb();

  // 1. Pre-state snapshot
  const pre = await db
    .select({
      slug: capabilities.slug,
      transparencyTag: capabilities.transparencyTag,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, [...DB_FIX_SLUGS]));

  console.log("=== PRE-STATE (DB) ===");
  for (const r of pre) console.log(`  ${r.slug}: transparency_tag=${r.transparencyTag}`);

  // Safety: audit predicted these 2 slugs with external_api. Abort if not.
  const preMap = new Map(pre.map((r) => [r.slug, r.transparencyTag]));
  for (const slug of DB_FIX_SLUGS) {
    if (preMap.get(slug) !== "external_api") {
      throw new Error(
        `Pre-state mismatch for ${slug}: expected 'external_api', found ${preMap.get(slug)}. Refusing to UPDATE. Run Phase 4b audit to refresh.`,
      );
    }
  }

  // 2. DB UPDATE (2 rows → algorithmic)
  const res = await db.execute(sql`
    UPDATE capabilities
       SET transparency_tag = 'algorithmic',
           updated_at = NOW()
     WHERE slug IN ('domain-age-check', 'postal-code-lookup')
       AND transparency_tag = 'external_api'
  `);
  console.log(`\nUPDATED ${(res as unknown as { count?: number }).count ?? "n/a"} rows`);

  // 3. YAML fixup (7 files → algorithmic)
  let yamlWritten = 0;
  for (const slug of YAML_FIX_SLUGS) {
    const file = resolve(MANIFEST_DIR, `${slug}.yaml`);
    const original = readFileSync(file, "utf8");
    // Line-level replacement, preserves all other content
    const replaced = original.replace(
      /^transparency_tag: external_api$/m,
      "transparency_tag: algorithmic",
    );
    if (replaced === original) {
      console.log(`  ${slug}.yaml: no change (expected; already algorithmic?)`);
      continue;
    }
    writeFileSync(file, replaced, "utf8");
    yamlWritten++;
    console.log(`  ${slug}.yaml: external_api → algorithmic`);
  }
  console.log(`\nYAML files rewritten: ${yamlWritten}`);

  // 4. Post-state snapshot + assert
  const post = await db
    .select({
      slug: capabilities.slug,
      transparencyTag: capabilities.transparencyTag,
    })
    .from(capabilities)
    .where(inArray(capabilities.slug, [...DB_FIX_SLUGS]));

  console.log("\n=== POST-STATE (DB) ===");
  for (const r of post) console.log(`  ${r.slug}: transparency_tag=${r.transparencyTag}`);

  for (const r of post) {
    if (r.transparencyTag !== "algorithmic") {
      throw new Error(`Post-state: ${r.slug} is '${r.transparencyTag}', expected 'algorithmic'`);
    }
  }
  console.log("\nAll assertions passed.");

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
