/**
 * Fix missing avg_latency_ms values.
 *
 * For each capability with null avg_latency_ms:
 *   1. Check test_results for actual response_time_ms measurements → use median
 *   2. Fall back to heuristic based on transparency_tag
 *
 * Run: cd apps/api && npx tsx src/db/fix-missing-latency.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, testResults } from "./schema.js";
import { eq, isNull, sql } from "drizzle-orm";

function heuristicLatency(transparencyTag: string | null): number {
  switch (transparencyTag) {
    case "algorithmic":
      return 20;
    case "ai_generated":
      return 3000;
    case "mixed":
      return 2000;
    default:
      return 1000;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  const db = getDb();

  // Find all capabilities with null avg_latency_ms
  const missing = await db
    .select({
      slug: capabilities.slug,
      transparencyTag: capabilities.transparencyTag,
    })
    .from(capabilities)
    .where(isNull(capabilities.avgLatencyMs));

  if (missing.length === 0) {
    console.log("No capabilities with missing avg_latency_ms. Nothing to fix.");
    process.exit(0);
  }

  console.log(`Found ${missing.length} capabilities with null avg_latency_ms.\n`);

  const updates: Array<{ slug: string; new_ms: number; source: string }> = [];

  for (const cap of missing) {
    // Check for actual test result measurements
    const measurements = await db
      .select({ responseTimeMs: testResults.responseTimeMs })
      .from(testResults)
      .where(eq(testResults.capabilitySlug, cap.slug));

    const times = measurements
      .map((m) => m.responseTimeMs)
      .filter((t) => t > 0);

    let newMs: number;
    let source: string;

    if (times.length >= 3) {
      newMs = median(times);
      source = `median of ${times.length} test results`;
    } else {
      newMs = heuristicLatency(cap.transparencyTag);
      source = `heuristic (${cap.transparencyTag ?? "no tag"})`;
    }

    await db
      .update(capabilities)
      .set({ avgLatencyMs: newMs, updatedAt: new Date() })
      .where(eq(capabilities.slug, cap.slug));

    updates.push({ slug: cap.slug, new_ms: newMs, source });
    console.log(`  ${cap.slug}: ${newMs}ms (${source})`);
  }

  console.log(`\nUpdated ${updates.length} capabilities.`);
  console.log(JSON.stringify({ updated: updates, count: updates.length }, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
