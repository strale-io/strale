/**
 * READ-ONLY pre/post snapshot for the authorised one-field write.
 *
 * Run once BEFORE the write and once after; the two outputs are the
 * before/after evidence. Captures:
 *   - every canonical column on image-resize, hashed and in full for the two
 *     that matter;
 *   - a checksum over EVERY capability row, so "no unrelated capability row
 *     changed" is a comparison rather than an assurance.
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import postgres from "postgres";

config({ path: "C:/Users/pette/Projects/strale/.env" });
const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v) ?? "null").digest("hex").slice(0, 16);

const [row] = await sql`
  SELECT slug, name, description, category, input_schema, output_schema,
         data_source, maintenance_class, transparency_tag, freshness_category,
         output_field_reliability, processes_personal_data, personal_data_categories,
         gdpr_art_22_classification, cost_class, quota_window, quota_cap,
         quota_reset_dom, price_cents, is_active, x402_enabled, lifecycle_state,
         updated_at
  FROM capabilities WHERE slug = 'image-resize'`;

console.log("=== image-resize, per-column digest ===");
for (const [k, v] of Object.entries(row!)) {
  console.log(`  ${k.padEnd(28)} ${sha(v)}  ${JSON.stringify(v)?.slice(0, 60) ?? ""}`);
}

console.log("\n=== the two columns in full ===");
console.log(`INPUT_SCHEMA=${JSON.stringify(row!.input_schema)}`);
console.log(`OUTPUT_SCHEMA_SHA=${sha(row!.output_schema)}`);
console.log(`OUTPUT_SCHEMA_LEN=${JSON.stringify(row!.output_schema)?.length}`);

// Whole-table fingerprint, excluding image-resize, so an unrelated row change
// is detectable without dumping the catalogue.
const [all] = await sql`
  SELECT count(*)::int AS n,
         md5(string_agg(t.row_text, '|' ORDER BY t.slug)) AS fingerprint
  FROM (
    SELECT slug, (slug || coalesce(name,'') || coalesce(description,'') ||
                  coalesce(category,'') || coalesce(input_schema::text,'') ||
                  coalesce(output_schema::text,'') || coalesce(data_source,'') ||
                  coalesce(cost_class,'') || coalesce(transparency_tag,'')) AS row_text
    FROM capabilities WHERE slug <> 'image-resize'
  ) t`;
console.log(`\nOTHER_CAPABILITIES_COUNT=${all!.n}`);
console.log(`OTHER_CAPABILITIES_FINGERPRINT=${all!.fingerprint}`);

await sql.end();
