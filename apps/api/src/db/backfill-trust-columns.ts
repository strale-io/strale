/**
 * One-time backfill: populate matrix_sqs_raw, trend, freshness_level,
 * last_tested_at, and freshness_decayed_at for all active capabilities.
 *
 * Run: cd apps/api && npx tsx src/db/backfill-trust-columns.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./index.js";
import { capabilities, testResults, testSuites } from "./schema.js";
import { computeDualProfileSQS } from "../lib/sqs.js";
import {
  computeFreshnessDecay,
  applyFreshnessDecay,
  shouldOverrideTrend,
} from "../lib/freshness-decay.js";

const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };

async function backfill() {
  const db = getDb();
  const now = new Date();

  const active = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Backfilling ${active.length} active capabilities...`);

  let updated = 0;
  let errors = 0;

  for (const { slug } of active) {
    try {
      // Get last test time
      const [lastTest] = await db
        .select({ executedAt: testResults.executedAt })
        .from(testResults)
        .where(eq(testResults.capabilitySlug, slug))
        .orderBy(desc(testResults.executedAt))
        .limit(1);

      // Get schedule tier
      const [suiteRow] = await db
        .select({ scheduleTier: testSuites.scheduleTier })
        .from(testSuites)
        .where(
          and(
            eq(testSuites.capabilitySlug, slug),
            eq(testSuites.active, true),
          ),
        )
        .orderBy(testSuites.scheduleTier)
        .limit(1);

      const tierHours = TIER_HOURS[suiteRow?.scheduleTier ?? "B"] ?? 24;

      // Compute dual-profile
      const dual = await computeDualProfileSQS(slug);
      if (dual.qp.pending && dual.rp.pending) {
        // No data yet — set reasonable defaults
        await db
          .update(capabilities)
          .set({
            matrixSqsRaw: null,
            trend: "stable",
            freshnessLevel: "unverified",
            lastTestedAt: lastTest?.executedAt ?? null,
            freshnessDecayedAt: now,
          })
          .where(eq(capabilities.slug, slug));
        updated++;
        continue;
      }

      const rawSqs = dual.matrix.score;
      const freshness = computeFreshnessDecay(
        lastTest?.executedAt ?? null,
        tierHours,
        now,
      );
      const decayedSqs = dual.matrix.pending
        ? rawSqs
        : applyFreshnessDecay(rawSqs, freshness);
      const effectiveTrend = shouldOverrideTrend(freshness)
        ? "stale"
        : dual.rp.trend;

      await db
        .update(capabilities)
        .set({
          matrixSqsRaw: String(rawSqs),
          matrixSqs: dual.matrix.pending ? null : String(decayedSqs),
          trend: effectiveTrend,
          freshnessLevel: freshness.staleness_level,
          lastTestedAt: lastTest?.executedAt ?? null,
          freshnessDecayedAt: now,
        })
        .where(eq(capabilities.slug, slug));

      updated++;
    } catch (err) {
      errors++;
      console.error(
        `  ✗ ${slug}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `Done. Updated: ${updated}, Errors: ${errors}, Total: ${active.length}`,
  );
  process.exit(errors > 0 ? 1 : 0);
}

backfill();
