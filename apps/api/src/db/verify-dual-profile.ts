/**
 * Verification script: compare legacy SQS vs dual-profile SQS for all capabilities.
 *
 * Usage: npx tsx src/db/verify-dual-profile.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { computeDualProfileSQS } from "../lib/sqs.js";

async function verify() {
  const db = getDb();

  const allCaps = await db
    .select({ slug: capabilities.slug, capabilityType: capabilities.capabilityType })
    .from(capabilities)
    .orderBy(capabilities.slug);

  console.log(`Verifying dual-profile SQS for ${allCaps.length} capabilities...\n`);

  const stats = {
    total: allCaps.length,
    computed: 0,
    pending: 0,
    byType: { deterministic: 0, stable_api: 0, scraping: 0, ai_assisted: 0 } as Record<string, number>,
    diffs: [] as { slug: string; legacy: number; matrix: number; diff: number; qpGrade: string; rpGrade: string; type: string }[],
    bigDiffs: 0,
  };

  for (const cap of allCaps) {
    try {
      const dual = await computeDualProfileSQS(cap.slug);

      if (dual.qp.pending || dual.rp.pending) {
        stats.pending++;
        continue;
      }

      stats.computed++;
      stats.byType[cap.capabilityType] = (stats.byType[cap.capabilityType] ?? 0) + 1;

      const diff = dual.matrix.score - dual.legacy_score;
      stats.diffs.push({
        slug: cap.slug,
        legacy: dual.legacy_score,
        matrix: dual.matrix.score,
        diff: Math.round(diff * 10) / 10,
        qpGrade: dual.qp.grade,
        rpGrade: dual.rp.grade,
        type: cap.capabilityType,
      });

      if (Math.abs(diff) > 15) stats.bigDiffs++;
    } catch (err) {
      console.error(`  ERR ${cap.slug}: ${(err as Error).message}`);
    }
  }

  // Sort by absolute diff descending
  stats.diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // Print results
  console.log("=== SUMMARY ===");
  console.log(`Total: ${stats.total} | Computed: ${stats.computed} | Pending: ${stats.pending}`);
  console.log(`By type: ${JSON.stringify(stats.byType)}`);
  console.log(`Big diffs (>15 pts): ${stats.bigDiffs}\n`);

  console.log("=== TOP 20 LARGEST DIFFS ===");
  console.log("Slug                                     Type           Legacy  Matrix  Diff   QP  RP");
  console.log("-".repeat(95));
  for (const d of stats.diffs.slice(0, 20)) {
    console.log(
      `${d.slug.padEnd(40)} ${d.type.padEnd(14)} ${String(d.legacy).padStart(6)}  ${String(d.matrix).padStart(6)}  ${(d.diff > 0 ? "+" : "") + d.diff}`.padEnd(78) +
      `  ${d.qpGrade}   ${d.rpGrade}`,
    );
  }

  // Distribution
  const bins = { "0-5": 0, "5-10": 0, "10-15": 0, "15-20": 0, "20+": 0 };
  for (const d of stats.diffs) {
    const abs = Math.abs(d.diff);
    if (abs <= 5) bins["0-5"]++;
    else if (abs <= 10) bins["5-10"]++;
    else if (abs <= 15) bins["10-15"]++;
    else if (abs <= 20) bins["15-20"]++;
    else bins["20+"]++;
  }
  console.log("\n=== DIFF DISTRIBUTION ===");
  for (const [range, count] of Object.entries(bins)) {
    const bar = "█".repeat(Math.round(count / 2));
    console.log(`  ${range.padEnd(6)} ${String(count).padStart(4)}  ${bar}`);
  }

  // Average scores by type
  console.log("\n=== AVERAGE SCORES BY TYPE ===");
  const typeGroups: Record<string, { legacy: number[]; matrix: number[]; qp: number[]; rp: number[] }> = {};
  for (const d of stats.diffs) {
    if (!typeGroups[d.type]) typeGroups[d.type] = { legacy: [], matrix: [], qp: [], rp: [] };
    typeGroups[d.type].legacy.push(d.legacy);
    typeGroups[d.type].matrix.push(d.matrix);
  }
  for (const [type, group] of Object.entries(typeGroups)) {
    const avgLegacy = Math.round(group.legacy.reduce((s, v) => s + v, 0) / group.legacy.length * 10) / 10;
    const avgMatrix = Math.round(group.matrix.reduce((s, v) => s + v, 0) / group.matrix.length * 10) / 10;
    console.log(`  ${type.padEnd(14)} Legacy avg: ${avgLegacy}  Matrix avg: ${avgMatrix}  (n=${group.legacy.length})`);
  }

  process.exit(0);
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
