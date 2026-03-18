import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const SLUGS = [
  "address-geocode", "address-validate", "adverse-media-check", "age-verify",
  "aml-risk-score", "beneficial-ownership-lookup", "business-day-check",
  "company-industry-classify", "company-name-match", "credit-score-band",
  "domain-age-check", "email-reputation-score", "holiday-calendar",
  "iban-to-bank", "id-number-validate", "insolvency-check", "ip-risk-score",
  "language-detect", "pep-check", "phone-type-detect", "phone-validate",
  "postal-code-lookup", "tax-id-validate", "timezone-lookup",
];

const db = getDb();
const slugList = SLUGS.map(s => `'${s}'`).join(",");
const rows = await db.execute(sql.raw(`
  SELECT slug, lifecycle_state, visible
  FROM capabilities
  WHERE slug IN (${slugList})
  ORDER BY slug
`));

const r = (rows as any[]).map ? rows as any[] : (rows as any).rows;
console.log(`${"Slug".padEnd(42)} State       Visible`);
console.log("-".repeat(60));
let active = 0, other = 0;
for (const row of r) {
  const icon = row.lifecycle_state === "active" ? "✓" : "○";
  console.log(`${icon} ${row.slug.padEnd(40)} ${String(row.lifecycle_state).padEnd(12)} ${row.visible}`);
  if (row.lifecycle_state === "active") active++; else other++;
}
console.log(`\n${active} active, ${other} other`);
process.exit(0);
