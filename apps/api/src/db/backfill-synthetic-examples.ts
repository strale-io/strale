import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { eq, sql } from "drizzle-orm";
import { readJsonbObject } from "./lib/jsonb-value.js";

const db = getDb();

// Synthetic examples for capabilities that have never had a successful transaction.
// These are realistic shapes based on what the executor returns — not placeholder "string" values.

const SYNTHETIC_EXAMPLES: Record<string, Record<string, unknown>> = {
  "au-company-data": {
    company_name: "BHP Group Limited",
    abn: "49004028077",
    acn: "004028077",
    status: "active",
    type: "Australian Public Company",
    state: "VIC",
    postcode: "3000",
    business_names: ["BHP"],
  },
  "australian-company-data": {
    company_name: "Commonwealth Bank of Australia",
    registration_number: "123456789",
    status: "active",
    business_type: "Public Company",
    address: "Sydney, NSW, Australia",
    industry: "Banking",
    registration_date: "1911-01-01",
    directors: [],
  },
  "austrian-company-data": {
    company_name: "Red Bull GmbH",
    registration_number: "FN 83457 z",
    status: "active",
    business_type: "GmbH",
    address: "Am Brunnen 1, 5330 Fuschl am See",
    registration_date: null,
    industry: "Beverage Manufacturing",
    directors: [],
  },
  "belgian-company-data": {
    company_name: "Anheuser-Busch InBev SA/NV",
    registration_number: "0417497106",
    status: "active",
    business_type: "SA/NV",
    address: "Brouwerijplein 1, 3000 Leuven",
    registration_date: null,
    industry: "Beverage Manufacturing",
    directors: [],
  },
  "brazilian-company-data": {
    company_name: "Petróleo Brasileiro S.A. - Petrobras",
    registration_number: "33000167000101",
    status: "active",
    business_type: "S.A.",
    address: "Rio de Janeiro, RJ, Brazil",
    registration_date: "1953-10-03",
    industry: "Oil & Gas",
    directors: [],
  },
  "canadian-company-data": {
    company_name: "Shopify Inc.",
    registration_number: "8837201",
    status: "active",
    business_type: "Corporation",
    address: "Ottawa, ON, Canada",
    registration_date: "2004-09-28",
    industry: "Software",
    directors: [],
  },
  "company-enrich": {
    company_name: "Strale",
    domain: "strale.dev",
    description: "Data layer for AI agents",
    industry: "Software / AI Infrastructure",
    employee_count: null,
    founded_year: 2026,
    location: "Sweden",
    social_profiles: {},
  },
  "dutch-company-data": {
    company_name: "ASML Holding N.V.",
    registration_number: "52081644",
    status: "active",
    business_type: "N.V.",
    address: "Veldhoven, Netherlands",
    registration_date: "1984-01-01",
    industry: "Semiconductor Equipment",
    directors: [],
  },
  "eu-court-case-search": {
    cases: [
      {
        case_number: "C-311/18",
        title: "Data Protection Commissioner v Facebook Ireland and Maximillian Schrems",
        court: "CJEU",
        date: "2020-07-16",
        summary: "Schrems II — invalidation of EU-US Privacy Shield",
      },
    ],
    query: "data protection",
    court: "cjeu",
    total_results: 1,
  },
  "irish-company-data": {
    company_name: "Ryanair Holdings plc",
    registration_number: "249885",
    status: "active",
    business_type: "PLC",
    address: "Dublin, Ireland",
    registration_date: "1996-06-26",
    industry: "Airlines",
    directors: [],
  },
  "italian-company-data": {
    company_name: "Ferrari S.p.A.",
    registration_number: "IT09084570016",
    status: "active",
    business_type: "S.p.A.",
    address: "Maranello, Modena, Italy",
    registration_date: null,
    industry: "Automotive",
    directors: [],
  },
  "japanese-company-data": {
    company_name: "Toyota Motor Corporation",
    registration_number: "0100-01-008846",
    status: "active",
    business_type: "Kabushiki Kaisha",
    address: "Toyota City, Aichi, Japan",
    registration_date: "1937-08-28",
    industry: "Automotive",
    directors: [],
  },
  "lithuanian-company-data": {
    company_name: "AB Lietuvos Geležinkeliai",
    registration_number: "110053842",
    status: "active",
    business_type: "AB",
    address: "Vilnius, Lithuania",
    registration_date: null,
    industry: "Railways",
    directors: [],
  },
  "patent-search": {
    patents: [
      {
        title: "Method and system for data verification",
        patent_number: "US12345678",
        filing_date: "2024-01-15",
        inventor: "Jane Doe",
        assignee: "Tech Corp",
        status: "granted",
      },
    ],
    query: "data verification AI",
    total_results: 1,
  },
  "portuguese-company-data": {
    company_name: "Energias de Portugal, S.A.",
    registration_number: "500697256",
    status: "active",
    business_type: "S.A.",
    address: "Lisbon, Portugal",
    registration_date: null,
    industry: "Energy",
    directors: [],
  },
  "return-policy-extract": {
    store_name: "Example Store",
    return_window_days: 30,
    refund_method: "Original payment method",
    conditions: ["Item must be unused", "Original packaging required"],
    exceptions: ["Sale items are final sale"],
    exchange_available: true,
    free_returns: false,
    url: "https://example.com/returns",
  },
  "spanish-company-data": {
    company_name: "Banco Santander, S.A.",
    registration_number: "A39000013",
    status: "active",
    business_type: "S.A.",
    address: "Santander, Cantabria, Spain",
    registration_date: null,
    industry: "Banking",
    directors: [],
  },
  "swiss-company-data": {
    company_name: "Nestlé S.A.",
    registration_number: "CHE-105.923.987",
    status: "active",
    business_type: "SA",
    address: "Vevey, Switzerland",
    registration_date: "1866-01-01",
    industry: "Food & Beverage",
    directors: [],
  },
  "youtube-summarize": {
    title: "How DNS Works",
    channel: "Computerphile",
    summary: "An explanation of how the Domain Name System resolves domain names to IP addresses, covering root servers, TLD servers, and recursive resolvers.",
    key_points: ["DNS is hierarchical", "Root servers delegate to TLD servers", "Caching reduces lookup time"],
    topics: ["networking", "DNS", "internet infrastructure"],
    timestamps_of_interest: [{ time: "2:30", topic: "Root server explanation" }],
    sentiment: "educational",
    recommended_for: "Developers learning about networking fundamentals",
    video_id: "uOfonONtIuk",
    video_url: "https://www.youtube.com/watch?v=uOfonONtIuk",
    transcript_length: 4523,
  },
};

console.log(`=== Backfilling ${Object.keys(SYNTHETIC_EXAMPLES).length} synthetic examples ===\n`);

let updated = 0;

for (const [slug, example] of Object.entries(SYNTHETIC_EXAMPLES)) {
  const rows = await db.execute(sql`
    SELECT output_schema FROM capabilities WHERE slug = ${slug} AND is_active = true
  `);
  const r = rows as unknown as Array<Record<string, unknown>>;
  if (r.length === 0) {
    console.log(`  ${slug}: not found or not active — skipping`);
    continue;
  }

  const schema = readJsonbObject(r[0].output_schema);
  if (schema.example) {
    console.log(`  ${slug}: already has example — skipping`);
    continue;
  }

  const updatedSchema = { ...schema, example };
  await db
    .update(capabilities)
    .set({ outputSchema: updatedSchema, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  console.log(`  ${slug}: added synthetic example (${Object.keys(example).length} fields)`);
  updated++;
}

console.log(`\n  Updated: ${updated}`);

// Final count
const remaining = await db.execute(sql`
  SELECT COUNT(*)::int as count FROM capabilities
  WHERE is_active = true AND output_schema::text NOT LIKE '%"example"%'
`);
console.log(`  Remaining without example: ${(remaining as unknown as Array<Record<string, unknown>>)[0].count}`);

process.exit(0);
