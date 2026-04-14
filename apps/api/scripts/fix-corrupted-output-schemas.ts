import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

/**
 * Fixes capabilities where output_schema was stored as a stringified JSON
 * that got character-indexed by JSONB (keys "0", "1", "2", ... each mapping
 * to one character of the JSON string).
 *
 * Reconstructs by:
 *   1. Collecting all numeric string keys in order, joining values into a JSON string
 *   2. JSON.parse-ing that string
 *   3. Preserving any non-numeric keys (like "example") into the rebuilt object
 */
async function main() {
  const dryRun = !process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql<{ slug: string; output_schema: any }[]>`
    SELECT slug, output_schema FROM capabilities WHERE is_active = true`;

  const toFix: Array<{ slug: string; before: any; after: any }> = [];

  for (const r of rows) {
    const s = r.output_schema;
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    if ("type" in s || "properties" in s) continue; // healthy
    if (!("0" in s) || !("1" in s)) continue; // not char-indexed

    // Collect numeric keys in order
    const numericKeys = Object.keys(s)
      .filter((k) => /^\d+$/.test(k))
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);

    const jsonStr = numericKeys.map((k) => s[String(k)]).join("");
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error(`❌ ${r.slug}: could not parse reconstructed string`);
      console.error(`   str: ${jsonStr.slice(0, 200)}...`);
      continue;
    }

    // Preserve non-numeric keys (like "example") — they were stored correctly
    // at the object level alongside the char-indexed string
    const nonNumeric: Record<string, any> = {};
    for (const k of Object.keys(s)) {
      if (!/^\d+$/.test(k)) nonNumeric[k] = s[k];
    }

    const rebuilt = { ...parsed, ...nonNumeric };
    toFix.push({ slug: r.slug, before: s, after: rebuilt });
  }

  console.log(`Found ${toFix.length} corrupted output_schemas`);
  for (const f of toFix) {
    const hasType = "type" in f.after;
    const hasProps = "properties" in f.after;
    console.log(`  ${f.slug}: type=${hasType} properties=${hasProps}`);
  }

  if (dryRun) {
    console.log("\n-- DRY RUN -- Re-run with --apply to write changes");
    await sql.end();
    return;
  }

  for (const f of toFix) {
    await sql`
      UPDATE capabilities
      SET output_schema = ${sql.json(f.after)}
      WHERE slug = ${f.slug}`;
    console.log(`✅ fixed ${f.slug}`);
  }
  console.log(`\nApplied ${toFix.length} fixes`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
