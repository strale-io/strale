/**
 * Staleness refresh job — re-decays matrix_sqs for capabilities that haven't
 * been tested recently. Runs every 2 hours to ensure cached scores in the
 * capabilities table reflect current freshness state.
 *
 * This job does NOT re-run tests or recompute dual-profile scores from scratch.
 * It only updates the freshness-dependent columns:
 *   matrix_sqs, trend, freshness_level, freshness_decayed_at
 *
 * The raw QP/RP/matrix scores are NOT changed — only the decay applied on top.
 */

import { randomUUID } from "node:crypto";
import { eq, and, isNotNull, lt, inArray, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";
import {
  computeFreshnessDecay,
  applyFreshnessDecay,
  shouldOverrideTrend,
} from "../lib/freshness-decay.js";
import { log } from "../lib/log.js";

const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };

export async function refreshStaleScores(): Promise<number> {
  const db = getDb();
  const runId = randomUUID();
  const jobLog = log.child({ job: "refresh-stale-scores", job_run_id: runId });
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);

  // Find active capabilities whose freshness was last computed more than 2h ago
  const stale = await db
    .select({
      slug: capabilities.slug,
      matrixSqsRaw: capabilities.matrixSqsRaw,
      lastTestedAt: capabilities.lastTestedAt,
      trend: capabilities.trend,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        isNotNull(capabilities.matrixSqsRaw),
        lt(capabilities.freshnessDecayedAt, twoHoursAgo),
      ),
    );

  if (stale.length === 0) return 0;

  // Batch-fetch schedule tiers for all stale capabilities in one query
  const staleSlugs = stale.map((c) => c.slug);
  const tierRows = await db
    .select({
      capabilitySlug: testSuites.capabilitySlug,
      scheduleTier: testSuites.scheduleTier,
    })
    .from(testSuites)
    .where(
      and(
        inArray(testSuites.capabilitySlug, staleSlugs),
        eq(testSuites.active, true),
      ),
    )
    .orderBy(testSuites.capabilitySlug, asc(testSuites.scheduleTier));

  // Build tier map — first row per slug is the most frequent (ASC sort)
  const tierMap = new Map<string, string>();
  for (const r of tierRows) {
    if (!tierMap.has(r.capabilitySlug)) {
      tierMap.set(r.capabilitySlug, r.scheduleTier);
    }
  }

  let refreshed = 0;
  const now = new Date();

  for (const cap of stale) {
    try {
      const tierHours = TIER_HOURS[tierMap.get(cap.slug) ?? "B"] ?? 24;
      const rawSqs = cap.matrixSqsRaw ? parseFloat(cap.matrixSqsRaw) : 0;

      // Recompute freshness with current time
      const freshness = computeFreshnessDecay(cap.lastTestedAt, tierHours, now);
      const decayedSqs = applyFreshnessDecay(rawSqs, freshness);

      // Trend: if freshness overrides, use "stale"; otherwise keep existing trend
      const effectiveTrend = shouldOverrideTrend(freshness)
        ? "stale"
        : (cap.trend ?? "stable");

      await db
        .update(capabilities)
        .set({
          matrixSqs: String(decayedSqs),
          trend: effectiveTrend,
          freshnessLevel: freshness.staleness_level,
          freshnessDecayedAt: now,
          updatedAt: now,
        })
        .where(eq(capabilities.slug, cap.slug));

      refreshed++;
    } catch (err) {
      jobLog.error(
        { label: "stale-refresh-failed", capability_slug: cap.slug, err: err instanceof Error ? { message: err.message } : err },
        "stale-refresh-failed",
      );
    }
  }

  jobLog.info(
    { label: "stale-refresh-done", refreshed, total: stale.length },
    "stale-refresh-done",
  );
  return refreshed;
}
