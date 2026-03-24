/**
 * Self-Healing Invariant Checker
 *
 * Detects data inconsistencies in the trust/SQS pipeline and either
 * auto-heals them (Tier 1) or logs alerts (Tier 2).
 *
 * Runs every 2 hours + once 60s after startup.
 *
 * Tier 1 (auto-heal): re-persists scores when test results exist but DB columns are stale
 * Tier 2 (alert only): flags structural issues that need human attention
 *
 * Rate limit: max 20 items processed per check per run.
 */

import { sql, eq, and, inArray, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps, testResults } from "../db/schema.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { persistDualProfileScores } from "../lib/test-runner.js";
import { computeSolutionScore } from "../lib/trust-labels.js";

const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const STARTUP_DELAY_MS = 60_000; // 60 seconds
const MAX_ITEMS_PER_CHECK = 20;

let _running = false;

// ─── Main entry point ───────────────────────────────────────────────────────

export async function runInvariantChecks(): Promise<void> {
  const start = Date.now();
  let healed = 0;
  let alerts = 0;
  let checked = 0;

  try {
    const r1 = await checkScorePersistenceDrift();
    healed += r1.healed;
    alerts += r1.alerts;
    checked += r1.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 1 (score persistence) failed:", err);
  }

  try {
    const r2 = await checkSolutionScoreSanity();
    alerts += r2.alerts;
    checked += r2.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 2 (solution sanity) failed:", err);
  }

  try {
    const r3 = await checkOrphanedSolutionSteps();
    alerts += r3.alerts;
    checked += r3.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 3 (orphaned steps) failed:", err);
  }

  try {
    const r4 = await checkFreshnessDecayDrift();
    healed += r4.healed;
    alerts += r4.alerts;
    checked += r4.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 4 (freshness drift) failed:", err);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (healed === 0 && alerts === 0) {
    console.log(`[invariant-checker] Run complete: all clear, ${checked} items checked (${elapsed}s)`);
  } else {
    console.log(`[invariant-checker] Run complete: ${healed} healed, ${alerts} alert${alerts !== 1 ? "s" : ""}, ${checked} checked (${elapsed}s)`);
  }
}

export function startInvariantChecker(): void {
  if (_running) return;
  _running = true;

  console.log("[invariant-checker] Started (2h interval, 60s initial delay)");

  // Run once on startup after DB warms up
  setTimeout(() => {
    runInvariantChecks().catch((err) =>
      console.error("[invariant-checker] Startup run failed:", err),
    );
  }, STARTUP_DELAY_MS);

  // Recurring 2-hour check
  setInterval(() => {
    runInvariantChecks().catch((err) =>
      console.error("[invariant-checker] Scheduled run failed:", err),
    );
  }, CHECK_INTERVAL_MS);
}

// ─── CHECK 1: Score persistence drift (Tier 1 — AUTO-HEAL) ──────────────────

async function checkScorePersistenceDrift(): Promise<{ healed: number; alerts: number; checked: number }> {
  const db = getDb();
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000);

  // Find capabilities where test_results has recent entries but capabilities.last_tested_at is stale
  const driftRows = await db.execute(sql`
    SELECT c.slug,
           c.last_tested_at AS cap_tested,
           MAX(tr.executed_at) AS result_tested
    FROM capabilities c
    INNER JOIN test_results tr ON tr.capability_slug = c.slug
    WHERE c.is_active = true
      AND tr.executed_at >= ${oneDayAgo.toISOString()}::timestamptz
    GROUP BY c.slug, c.last_tested_at
    HAVING COALESCE(c.last_tested_at, '1970-01-01'::timestamptz) < ${oneDayAgo.toISOString()}::timestamptz
    ORDER BY MAX(tr.executed_at) - COALESCE(c.last_tested_at, '1970-01-01'::timestamptz) DESC
    LIMIT ${MAX_ITEMS_PER_CHECK}
  `);

  const rows = (Array.isArray(driftRows) ? driftRows : (driftRows as any)?.rows ?? []) as Array<{
    slug: string;
    cap_tested: Date | null;
    result_tested: Date;
  }>;

  if (rows.length === 0) {
    return { healed: 0, alerts: 0, checked: 0 };
  }

  let healed = 0;
  let alerts = 0;

  const slugs = rows.map((r) => r.slug);
  console.log(`[invariant-checker] CHECK 1: ${slugs.length} capabilities with score persistence drift`);

  try {
    await persistDualProfileScores(slugs);
    healed = slugs.length;

    await logHealthEvent({
      eventType: "invariant_healed",
      tier: 1,
      actionTaken: `Score persistence drift auto-healed for ${slugs.length} capabilities`,
      details: { check: "score_persistence_drift", slugs, count: slugs.length },
    });
  } catch (err) {
    alerts = slugs.length;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[invariant-checker] CHECK 1 heal failed: ${msg}`);

    await logHealthEvent({
      eventType: "invariant_alert",
      tier: 2,
      actionTaken: `Score persistence drift detected but auto-heal failed: ${msg}`,
      details: { check: "score_persistence_drift", slugs, error: msg },
    });
  }

  return { healed, alerts, checked: rows.length };
}

// ─── CHECK 2: Solution score sanity (Tier 2 — ALERT ONLY) ───────────────────

async function checkSolutionScoreSanity(): Promise<{ alerts: number; checked: number }> {
  const db = getDb();

  // Get a sample of active solutions with their stored SQS
  const solRows = await db
    .select({
      id: solutions.id,
      slug: solutions.slug,
    })
    .from(solutions)
    .where(eq(solutions.isActive, true))
    .orderBy(asc(solutions.slug))
    .limit(MAX_ITEMS_PER_CHECK);

  if (solRows.length === 0) return { alerts: 0, checked: 0 };

  // Batch-fetch all steps for these solutions
  const solIds = solRows.map((s) => s.id);
  const allSteps = await db
    .select({
      solutionId: solutionSteps.solutionId,
      capabilitySlug: solutionSteps.capabilitySlug,
      matrixSqs: capabilities.matrixSqs,
    })
    .from(solutionSteps)
    .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(inArray(solutionSteps.solutionId, solIds));

  const stepsBySol = new Map<string, number[]>();
  for (const step of allSteps) {
    const list = stepsBySol.get(step.solutionId) ?? [];
    list.push(step.matrixSqs ? parseFloat(step.matrixSqs) : 0);
    stepsBySol.set(step.solutionId, list);
  }

  let alerts = 0;

  for (const sol of solRows) {
    const stepScores = stepsBySol.get(sol.id) ?? [];
    if (stepScores.length === 0) continue;

    const expectedSqs = computeSolutionScore(stepScores);

    // We don't have the stored solution SQS directly — it's computed at request time.
    // Instead, check if the expected score is at the "20 Degraded" floor due to a 0-score step.
    if (expectedSqs <= 20 && stepScores.some((s) => s === 0)) {
      alerts++;
      await logHealthEvent({
        eventType: "invariant_alert",
        tier: 2,
        actionTaken: `Solution ${sol.slug} scores ${expectedSqs} due to zero-score step`,
        details: {
          check: "solution_score_sanity",
          solutionSlug: sol.slug,
          expectedSqs,
          stepScores,
          zeroSteps: allSteps
            .filter((s) => s.solutionId === sol.id && (!s.matrixSqs || parseFloat(s.matrixSqs) === 0))
            .map((s) => s.capabilitySlug),
        },
      });
    }
  }

  return { alerts, checked: solRows.length };
}

// ─── CHECK 3: Orphaned solution steps (Tier 2 — ALERT ONLY) ─────────────────

async function checkOrphanedSolutionSteps(): Promise<{ alerts: number; checked: number }> {
  const db = getDb();

  // Find solution steps where the capability is missing, inactive, or has NULL matrixSqs
  const orphaned = await db.execute(sql`
    SELECT ss.solution_id,
           s.slug AS solution_slug,
           ss.capability_slug,
           c.is_active,
           c.matrix_sqs,
           c.lifecycle_state
    FROM solution_steps ss
    INNER JOIN solutions s ON s.id = ss.solution_id AND s.is_active = true
    LEFT JOIN capabilities c ON c.slug = ss.capability_slug
    WHERE c.slug IS NULL
       OR c.is_active = false
       OR c.matrix_sqs IS NULL
    LIMIT ${MAX_ITEMS_PER_CHECK}
  `);

  const rows = (Array.isArray(orphaned) ? orphaned : (orphaned as any)?.rows ?? []) as Array<{
    solution_slug: string;
    capability_slug: string;
    is_active: boolean | null;
    matrix_sqs: string | null;
    lifecycle_state: string | null;
  }>;

  if (rows.length === 0) return { alerts: 0, checked: 1 };

  // Group by solution for cleaner logging
  const bySolution = new Map<string, string[]>();
  for (const r of rows) {
    const list = bySolution.get(r.solution_slug) ?? [];
    list.push(r.capability_slug);
    bySolution.set(r.solution_slug, list);
  }

  for (const [solSlug, capSlugs] of bySolution) {
    await logHealthEvent({
      eventType: "invariant_alert",
      tier: 2,
      actionTaken: `Solution ${solSlug} has ${capSlugs.length} orphaned/unscored step(s): ${capSlugs.join(", ")}`,
      details: {
        check: "orphaned_solution_steps",
        solutionSlug: solSlug,
        orphanedSlugs: capSlugs,
      },
    });
  }

  return { alerts: bySolution.size, checked: 1 };
}

// ─── CHECK 4: Freshness decay drift (Tier 1 — AUTO-HEAL) ────────────────────

async function checkFreshnessDecayDrift(): Promise<{ healed: number; alerts: number; checked: number }> {
  const db = getDb();
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000);

  // Find capabilities where freshness is expired/unverified but recent passing tests exist
  const driftRows = await db.execute(sql`
    SELECT c.slug, c.freshness_level
    FROM capabilities c
    WHERE c.is_active = true
      AND c.freshness_level IN ('expired', 'unverified')
      AND EXISTS (
        SELECT 1 FROM test_results tr
        WHERE tr.capability_slug = c.slug
          AND tr.passed = true
          AND tr.executed_at >= ${twoDaysAgo.toISOString()}::timestamptz
      )
    LIMIT ${MAX_ITEMS_PER_CHECK}
  `);

  const rows = (Array.isArray(driftRows) ? driftRows : (driftRows as any)?.rows ?? []) as Array<{
    slug: string;
    freshness_level: string;
  }>;

  if (rows.length === 0) return { healed: 0, alerts: 0, checked: 0 };

  const slugs = rows.map((r) => r.slug);
  console.log(`[invariant-checker] CHECK 4: ${slugs.length} capabilities with freshness decay drift`);

  let healed = 0;
  let alerts = 0;

  try {
    await persistDualProfileScores(slugs);
    healed = slugs.length;

    await logHealthEvent({
      eventType: "invariant_healed",
      tier: 1,
      actionTaken: `Freshness decay drift auto-healed for ${slugs.length} capabilities`,
      details: {
        check: "freshness_decay_drift",
        slugs,
        previousLevels: rows.map((r) => ({ slug: r.slug, was: r.freshness_level })),
      },
    });
  } catch (err) {
    alerts = slugs.length;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[invariant-checker] CHECK 4 heal failed: ${msg}`);

    await logHealthEvent({
      eventType: "invariant_alert",
      tier: 2,
      actionTaken: `Freshness decay drift detected but auto-heal failed: ${msg}`,
      details: { check: "freshness_decay_drift", slugs, error: msg },
    });
  }

  return { healed, alerts, checked: rows.length };
}
