import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";
config({ path: resolve(import.meta.dirname, "../../../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const r = await sql`SELECT slug, onboarding_manifest->'limitations' AS limitations FROM capabilities WHERE slug = 'adverse-media-check'`;
const lims = r[0]?.limitations as Array<{ title: string }> | null;
console.log(`onboardingManifest.limitations on adverse-media-check: ${lims?.length ?? "(null)"} items`);
if (lims) for (const l of lims) console.log(`  - ${l.title}`);

await sql.end();
process.exit(0);
