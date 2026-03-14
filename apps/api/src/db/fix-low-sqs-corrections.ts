import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { testSuites, capabilities } from "./schema.js";
import { eq, and, inArray } from "drizzle-orm";

const db = getDb();

// ─── Corrections: Use real registry numbers for company data capabilities ────
// The previous script mapped company names to registry number fields.
// These need actual registry numbers for well-known companies with guaranteed address data.

interface Correction {
  slug: string;
  input: Record<string, unknown>;
  note: string;
}

// First, look up all input schemas to know the correct field names
const slugs = [
  "austrian-company-data", "hong-kong-company-data", "singapore-company-data",
  "italian-company-data", "belgian-company-data", "canadian-company-data",
  "irish-company-data", "latvian-company-data", "german-company-data",
  "portuguese-company-data", "swiss-company-data", "japanese-company-data",
  "dutch-company-data", "indian-company-data", "australian-company-data",
  "credit-report-summary", "image-to-text", "schema-migration-generate",
  "youtube-summarize",
];

const capRows = await db
  .select({ slug: capabilities.slug, inputSchema: capabilities.inputSchema })
  .from(capabilities)
  .where(inArray(capabilities.slug, slugs));

console.log("=== Input schemas for correction targets ===");
for (const r of capRows) {
  const schema = r.inputSchema as any;
  const props = schema?.properties ? Object.keys(schema.properties) : [];
  const required = schema?.required ?? [];
  console.log(`  ${r.slug}: fields=${JSON.stringify(props)} required=${JSON.stringify(required)}`);
}

// Now apply corrections with correct registry numbers
const corrections: Correction[] = [
  // Austrian: FN number format "FN 123456 a"
  { slug: "austrian-company-data", input: { fn_number: "FN 77652 f" }, note: "Red Bull GmbH FN number" },
  // Hong Kong: CR number format (8 digits)
  { slug: "hong-kong-company-data", input: { cr_number: "0012768" }, note: "Cathay Pacific Airways" },
  // Singapore: UEN format
  { slug: "singapore-company-data", input: { uen: "196800306E" }, note: "DBS Group Holdings" },
  // Italy: Partita IVA format
  { slug: "italian-company-data", input: { partita_iva: "00484960588" }, note: "Eni S.p.A." },
  // Belgium: Enterprise number (10 digits)
  { slug: "belgian-company-data", input: { enterprise_number: "0417497106" }, note: "Anheuser-Busch InBev" },
  // Canada: Corporation number
  { slug: "canadian-company-data", input: { corporation_number: "795979-4" }, note: "Shopify Inc" },
  // Ireland: CRO number
  { slug: "irish-company-data", input: { cro_number: "461onal" }, note: "Ryanair — use task instead" },
  // Latvia: Registration number (11 digits)
  { slug: "latvian-company-data", input: { reg_number: "40003245752" }, note: "airBaltic" },
  // Germany: HRB number
  { slug: "german-company-data", input: { hrb_number: "HRB 6684" }, note: "Siemens AG, Munich" },
  // Portugal: NIPC (9 digits)
  { slug: "portuguese-company-data", input: { nipc: "503504564" }, note: "EDP Energias de Portugal" },
  // Switzerland: UID format CHE-xxx.xxx.xxx
  { slug: "swiss-company-data", input: { uid: "CHE-116.281.710" }, note: "Nestlé SA" },
  // Japan: Corporate number (13 digits)
  { slug: "japanese-company-data", input: { corporate_number: "1180301018771" }, note: "Toyota Motor Corporation" },
  // Netherlands: KVK number (8 digits)
  { slug: "dutch-company-data", input: { kvk_number: "17085" }, note: "Royal Philips" },
  // India: CIN (Corporate Identity Number)
  { slug: "indian-company-data", input: { cin: "L22210MH1995PLC084781" }, note: "TCS" },
  // Australia: ABN (11 digits)
  { slug: "australian-company-data", input: { abn: "48123123124" }, note: "Commonwealth Bank" },
  // Credit report: org_number field — use a Swedish org number (reliable for Allabolag)
  { slug: "credit-report-summary", input: { org_number: "556703-7485" }, note: "Spotify" },
  // Image to text: use image_url not url
  { slug: "image-to-text", input: { image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/English_stop_sign%2C_green_grass%2C_blue_sky.JPG/220px-English_stop_sign%2C_green_grass%2C_blue_sky.JPG" }, note: "Wikipedia stop sign image" },
  // Schema migration: correct field mapping
  { slug: "schema-migration-generate", input: { current_schema: "users(id INT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at TIMESTAMP DEFAULT NOW())", desired_schema: "users(id INT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, age INT, created_at TIMESTAMP DEFAULT NOW())" }, note: "Add age column migration" },
  // YouTube: url field (mapped correctly, but use a proper YouTube URL)
  { slug: "youtube-summarize", input: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, note: "Rick Astley — always has captions" },
];

console.log("\n=== Applying corrections ===");
for (const c of corrections) {
  await db
    .update(testSuites)
    .set({
      input: c.input,
      expectedOutput: null,
      baselineOutput: null,
      baselineCapturedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(testSuites.capabilitySlug, c.slug),
        eq(testSuites.testType, "known_answer"),
        eq(testSuites.active, true),
      ),
    );

  // Also update dependency_health for the same slug
  await db
    .update(testSuites)
    .set({
      input: c.input,
      expectedOutput: null,
      baselineOutput: null,
      baselineCapturedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(testSuites.capabilitySlug, c.slug),
        eq(testSuites.testType, "dependency_health"),
        eq(testSuites.active, true),
      ),
    );

  console.log(`  ${c.slug}: corrected (${c.note})`);
}

// Fix irish-company-data — CRO numbers are numeric, Ryanair is 461461
// Let me fix the typo
await db
  .update(testSuites)
  .set({
    input: { cro_number: "461461" },
    expectedOutput: null,
    baselineOutput: null,
    baselineCapturedAt: null,
    updatedAt: new Date(),
  })
  .where(
    and(
      eq(testSuites.capabilitySlug, "irish-company-data"),
      eq(testSuites.testType, "known_answer"),
      eq(testSuites.active, true),
    ),
  );
console.log("  irish-company-data: corrected CRO to 461461 (Ryanair)");

console.log("\n=== Corrections complete ===");
process.exit(0);
