/**
 * Bucket C — backfill the gdpr_art_22_classification column for the
 * compliance capability set. The migration sets a 'data_lookup' default
 * for every row (correct for the 200+ non-compliance caps); this script
 * sets the explicit non-default values for the 5 caps where the audit
 * body needs to surface a screening / risk-synthesis disclosure.
 *
 * Idempotent: re-running sets the same values.
 *
 * Run: cd apps/api && npx tsx --env-file=../../.env scripts/backfill-art22-classifications.ts
 */
import { sql, inArray, eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";

const db = getDb();

// Per the cert-audit's Payee Assurance Readiness analysis, the compliance
// capabilities + risk-synthesis cap are the rows where Art. 22 disclosure
// matters. beneficial-ownership-lookup stays as data_lookup because it
// returns factual UBO data; the customer's downstream KYB rules are what
// turn that into a decision.
const SCREENING_SIGNAL = [
  "sanctions-check",
  "pep-check",
  "adverse-media-check",
  "insolvency-check",
];
const RISK_SYNTHESIS = ["risk-narrative-generate"];

async function setClassification(slugs: string[], value: string) {
  if (slugs.length === 0) return;
  // Use Drizzle's inArray (not sql`= ANY(${arr})`) — the latter expands
  // a JS array into N parameters instead of a single PG array, producing
  // operator-mismatch error 42809. Same gotcha as the
  // auto-register-deactivated-sync ANY() bug from session 2026-04-29.
  const updated = await db
    .update(capabilities)
    .set({ gdprArt22Classification: value, updatedAt: new Date() })
    .where(inArray(capabilities.slug, slugs))
    .returning({ slug: capabilities.slug, value: capabilities.gdprArt22Classification });
  console.log(`Set ${updated.length} cap(s) to ${value}:`);
  for (const r of updated) console.log(`  ${r.slug.padEnd(36)} ${r.value}`);
  // Surface any slugs that weren't found (typo / cap not in DB).
  const found = new Set(updated.map((u) => u.slug));
  const missing = slugs.filter((s) => !found.has(s));
  if (missing.length > 0) {
    console.warn(`  ⚠ ${missing.length} slug(s) not found in capabilities table:`);
    for (const s of missing) console.warn(`    ${s}`);
  }
}

void eq; // silence unused-import lint if future edits drop the helper

async function main() {
  console.log("=== Backfill gdpr_art_22_classification ===\n");
  await setClassification(SCREENING_SIGNAL, "screening_signal");
  await setClassification(RISK_SYNTHESIS, "risk_synthesis");

  // Verify final distribution
  const dist = await db.execute(sql`
    SELECT gdpr_art_22_classification, COUNT(*)::int AS n
    FROM capabilities
    GROUP BY gdpr_art_22_classification
    ORDER BY n DESC
  `);
  const distRows = (Array.isArray(dist) ? dist : (dist as { rows?: unknown[] })?.rows ?? []) as Array<{ gdpr_art_22_classification: string; n: number }>;
  console.log("\nFinal distribution:");
  for (const r of distRows) console.log(`  ${r.gdpr_art_22_classification.padEnd(20)} ${r.n}`);

  console.log("\n=== Backfill done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
