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
import { capabilities, solutions, solutionSteps, testResults, testSuites } from "../db/schema.js";
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

  // Fetch provider health once at the start — used by Check 5 to distinguish
  // provider outages from code bugs (avoids N false "CODE BUG" alerts when
  // a single provider like Browserless goes down)
  let unhealthyCapabilities = new Set<string>();
  try {
    const { runDependencyHealthChecks } = await import("../lib/dependency-health.js");
    const { getActiveProviders } = await import("../lib/dependency-manifest.js");
    const providerHealth = await runDependencyHealthChecks();
    for (const provider of getActiveProviders()) {
      const health = providerHealth[provider.name];
      if (health && !health.healthy) {
        for (const cap of provider.capabilities) {
          unhealthyCapabilities.add(cap);
        }
      }
    }
  } catch (err) {
    console.warn("[invariant-checker] Provider health fetch failed — Check 5 will run without provider context");
  }

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

  // Correlated failure detection — fires ONE provider-level alert instead of N
  // individual alerts when a shared provider is down
  try {
    await detectCorrelatedFailures(unhealthyCapabilities);
  } catch (err) {
    console.error("[invariant-checker] Correlated failure detection threw:", err);
  }

  try {
    const r5 = await checkAlgorithmicCorrectnessFloor(unhealthyCapabilities);
    alerts += r5.alerts;
    checked += r5.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 5 (algorithmic correctness floor) failed:", err);
  }

  try {
    const r6 = await checkBrokenSolutions();
    alerts += r6.alerts;
    checked += r6.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 6 (broken solution integrity) failed:", err);
  }

  try {
    const r7 = await checkMigrationCompleteness();
    alerts += r7.alerts;
    checked += r7.checked;
  } catch (err) {
    console.error("[invariant-checker] CHECK 7 (migration completeness) failed:", err);
  }

  // Log provider outage summary if any capabilities were skipped
  if (unhealthyCapabilities.size > 0) {
    try {
      const { getActiveProviders } = await import("../lib/dependency-manifest.js");
      const { runDependencyHealthChecks: _ } = await import("../lib/dependency-health.js");
      const affectedProviders = getActiveProviders()
        .filter((p) => p.capabilities.some((c) => unhealthyCapabilities.has(c)))
        .map((p) => `${p.displayName} (${p.capabilities.length} capabilities)`)
        .join(", ");
      console.warn(
        `[invariant-checker] Check 5 skipped ${unhealthyCapabilities.size} capabilities due to provider outages: ${affectedProviders}`,
      );
    } catch {}
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

  // Also check for inactive solutions where all steps are now active (reactivation candidates)
  const reactivationCandidates = await db.execute(sql`
    SELECT DISTINCT s.slug, s.name,
      COUNT(ss.id)::text AS step_count,
      COUNT(*) FILTER (WHERE c.is_active = true)::text AS active_step_count
    FROM solutions s
    INNER JOIN solution_steps ss ON ss.solution_id = s.id
    LEFT JOIN capabilities c ON c.slug = ss.capability_slug
    WHERE s.is_active = false
    GROUP BY s.slug, s.name
    HAVING COUNT(*) FILTER (WHERE c.is_active = true) = COUNT(ss.id)
  `);

  const reactivationRows = (Array.isArray(reactivationCandidates)
    ? reactivationCandidates
    : (reactivationCandidates as any)?.rows ?? []) as Array<{
    slug: string;
    name: string;
    step_count: string;
    active_step_count: string;
  }>;

  if (reactivationRows.length > 0) {
    const slugs = reactivationRows.map((r) => r.slug);
    console.log(
      `[invariant-checker] CHECK 3: ${slugs.length} inactive solution(s) could be reactivated (all steps active): ${slugs.join(", ")}`,
    );
    await logHealthEvent({
      eventType: "invariant_alert",
      tier: 3,
      actionTaken: `${slugs.length} inactive solution(s) have all steps active — candidates for reactivation via onCapabilityReactivated`,
      details: {
        check: "reactivation_candidates",
        solutions: reactivationRows.map((r) => ({ slug: r.slug, name: r.name, steps: parseInt(r.step_count, 10) })),
      },
    });
  }

  return { alerts: bySolution.size + (reactivationRows.length > 0 ? 1 : 0), checked: 1 };
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

// ─── Correlated failure detection ────────────────────────────────────────────
// When a shared provider (Browserless, Anthropic, Dilisense) is down, multiple
// capabilities fail simultaneously. This detector fires ONE provider-level
// alert instead of letting Check 5 fire N individual capability alerts.

async function detectCorrelatedFailures(
  unhealthyCapabilities: Set<string>,
): Promise<void> {
  if (unhealthyCapabilities.size === 0) return;

  const { getActiveProviders } = await import("../lib/dependency-manifest.js");
  const { runDependencyHealthChecks } = await import("../lib/dependency-health.js");

  const db = getDb();
  const MIN_CORRELATED = 3;
  const WINDOW_MINUTES = 30;
  const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const providerHealth = await runDependencyHealthChecks().catch(() => ({} as Record<string, { healthy: boolean; error?: string }>));

  for (const provider of getActiveProviders()) {
    const health = providerHealth[provider.name] as { healthy: boolean; error?: string } | undefined;
    if (!health || health.healthy) continue;
    if (provider.capabilities.length < MIN_CORRELATED) continue;

    // Count recent failures across this provider's capabilities
    const capSlugs = provider.capabilities;
    const recentFailures = await db.execute(sql`
      SELECT
        tr.capability_slug,
        COUNT(*)::text AS fail_count
      FROM test_results tr
      WHERE tr.capability_slug = ANY(${capSlugs})
        AND tr.executed_at >= ${cutoff}::timestamptz
        AND tr.passed = false
      GROUP BY tr.capability_slug
      HAVING COUNT(*) > 0
    `);

    const rows = (Array.isArray(recentFailures)
      ? recentFailures
      : (recentFailures as any)?.rows ?? []) as Array<{
      capability_slug: string;
      fail_count: string;
    }>;

    if (rows.length < MIN_CORRELATED) continue;

    const affectedSlugs = rows.map((r) => r.capability_slug);
    const message = [
      `PROVIDER OUTAGE DETECTED: ${provider.displayName}`,
      `${rows.length} of ${provider.capabilities.length} capabilities have recent failures`,
      `Provider health probe: ${health.error ?? "unhealthy"}`,
      `Affected capabilities: ${affectedSlugs.slice(0, 10).join(", ")}${affectedSlugs.length > 10 ? ` (+${affectedSlugs.length - 10} more)` : ""}`,
      `Individual capability alerts are suppressed while provider is unhealthy.`,
    ].join("\n");

    console.error(`[invariant-checker] ${message}`);

    await logHealthEvent({
      eventType: "provider_outage",
      tier: 1,
      actionTaken: message,
      details: {
        check: "correlated_failure_detector",
        providerName: provider.name,
        providerDisplayName: provider.displayName,
        affectedCapabilities: affectedSlugs,
        totalAffected: rows.length,
        windowMinutes: WINDOW_MINUTES,
        probeError: health.error ?? null,
      },
    });
  }
}

// ─── CHECK 5: Algorithmic correctness floor (Tier 1 — CRITICAL ALERT) ───────
// Pure algorithmic capabilities have zero environmental variability.
// Correctness below 85% is definitionally a code defect, not a transient issue.

async function checkAlgorithmicCorrectnessFloor(
  unhealthyCapabilities: Set<string>,
): Promise<{ alerts: number; checked: number }> {
  const db = getDb();
  const CORRECTNESS_FLOOR = 85;
  const ROLLING_WINDOW_HOURS = 12;
  const cutoff = new Date(Date.now() - ROLLING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const algorithmicCaps = await db
    .select({ slug: capabilities.slug, name: capabilities.name })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        eq(capabilities.transparencyTag, "algorithmic"),
      ),
    );

  if (algorithmicCaps.length === 0) return { alerts: 0, checked: 0 };

  let alerts = 0;

  for (const cap of algorithmicCaps) {
    const recentResults = await db.execute(sql`
      SELECT
        ts.test_name,
        tr.passed,
        tr.failure_reason,
        tr.executed_at
      FROM test_results tr
      INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
      WHERE tr.capability_slug = ${cap.slug}
        AND ts.test_type = 'known_answer'
        AND tr.executed_at >= ${cutoff}::timestamptz
      ORDER BY tr.executed_at DESC
      LIMIT 20
    `);

    const rows = (Array.isArray(recentResults)
      ? recentResults
      : (recentResults as any)?.rows ?? []) as Array<{
      test_name: string;
      passed: boolean;
      failure_reason: string | null;
      executed_at: string;
    }>;

    if (rows.length === 0) continue;

    const passed = rows.filter((r) => r.passed).length;
    const correctnessRate = Math.round((passed / rows.length) * 100);

    if (correctnessRate < CORRECTNESS_FLOOR) {
      // Check if failures are explained by a known provider outage
      if (unhealthyCapabilities.has(cap.slug)) {
        console.log(
          `[invariant-checker] Check 5: ${cap.slug} correctness ${correctnessRate}% — ` +
            `SKIPPED (provider unhealthy, failures are upstream not code bugs)`,
        );
        continue;
      }

      // Check for potential ground truth contamination before classifying as code bug.
      // If the capability was modified after an auto-generated test was created, the
      // test's ground truth may be stale (captured before the fix).
      const contaminatedTests = await db.execute(sql`
        SELECT ts.test_name
        FROM test_suites ts
        JOIN capabilities c ON c.slug = ts.capability_slug
        WHERE ts.capability_slug = ${cap.slug}
          AND ts.test_type = 'known_answer'
          AND ts.generation_capability_updated_at IS NOT NULL
          AND ts.ground_truth_verified_at IS NULL
          AND c.updated_at > ts.generation_capability_updated_at
      `);

      const contamRows = (Array.isArray(contaminatedTests)
        ? contaminatedTests
        : (contaminatedTests as any)?.rows ?? []) as Array<{ test_name: string }>;

      if (contamRows.length > 0) {
        const testNames = contamRows.map((r) => r.test_name).join(", ");
        console.warn(
          `[invariant-checker] Check 5: ${cap.slug} has ${contamRows.length} ` +
            `auto-generated test(s) with unverified ground truth: ${testNames}. ` +
            `Capability was modified after test generation. ` +
            `Suppressing CODE BUG alert — run tests manually to re-verify.`,
        );

        await logHealthEvent({
          eventType: "ground_truth_contamination_risk",
          capabilitySlug: cap.slug,
          tier: 2,
          actionTaken: `Auto-generated tests for ${cap.slug} may have contaminated ground truth: ${testNames}`,
          details: {
            check: "ground_truth_contamination",
            capabilitySlug: cap.slug,
            contaminatedTests: contamRows.map((r) => r.test_name),
            actionRequired: "Run the capability manually to verify ground truth is still correct",
          },
        });
        continue; // Skip CODE BUG alert for this capability
      }

      const failingTests = rows
        .filter((r) => !r.passed)
        .map((r) => `"${r.test_name}": ${r.failure_reason ?? "no reason recorded"}`)
        .slice(0, 5);

      const message = [
        `ALGORITHMIC CORRECTNESS VIOLATION: ${cap.slug}`,
        `Correctness rate: ${correctnessRate}% (floor: ${CORRECTNESS_FLOOR}%)`,
        `Provider health: verified healthy — this is a CODE BUG, not a provider issue`,
        `Tests checked: ${rows.length} | Passed: ${passed} | Failed: ${rows.length - passed}`,
        `Failing tests:`,
        ...failingTests.map((t) => `  - ${t}`),
        `Investigate the capability code immediately.`,
      ].join("\n");

      console.error(`[invariant-checker] ${message}`);
      alerts++;

      await logHealthEvent({
        eventType: "invariant_violation",
        capabilitySlug: cap.slug,
        tier: 1,
        actionTaken: message,
        details: {
          check: "algorithmic_correctness_floor",
          capability_slug: cap.slug,
          capability_name: cap.name,
          correctness_rate: correctnessRate,
          floor: CORRECTNESS_FLOOR,
          failing_tests: failingTests,
          window_hours: ROLLING_WINDOW_HOURS,
          provider_health: "verified_healthy",
        },
      });
    }
  }

  return { alerts, checked: algorithmicCaps.length };
}

// ─── CHECK 6: Broken solution integrity (Tier 1 — CRITICAL ALERT) ───────────
// Detects active solutions where one or more step capabilities are missing or
// inactive. This is the sole ongoing enforcement layer — the lifecycle hooks
// (onCapabilityDeactivated) prevent new broken states, but this check catches
// anything that slipped through or was caused by direct DB changes.

async function checkBrokenSolutions(): Promise<{ alerts: number; checked: number }> {
  const db = getDb();

  const brokenRows = await db.execute(sql`
    SELECT
      s.slug AS solution_slug,
      s.name AS solution_name,
      ss.capability_slug,
      CASE
        WHEN c.slug IS NULL THEN 'missing'
        WHEN c.is_active = false THEN 'inactive'
        ELSE 'ok'
      END AS step_status
    FROM solutions s
    INNER JOIN solution_steps ss ON ss.solution_id = s.id
    LEFT JOIN capabilities c ON c.slug = ss.capability_slug
    WHERE s.is_active = true
      AND (c.slug IS NULL OR c.is_active = false)
    ORDER BY s.slug
    LIMIT ${MAX_ITEMS_PER_CHECK}
  `);

  const rows = (Array.isArray(brokenRows)
    ? brokenRows
    : (brokenRows as any)?.rows ?? []) as Array<{
    solution_slug: string;
    solution_name: string;
    capability_slug: string;
    step_status: "missing" | "inactive";
  }>;

  if (rows.length === 0) return { alerts: 0, checked: 1 };

  // Group by solution for cleaner reporting
  const bySolution = new Map<
    string,
    { name: string; brokenSteps: Array<{ slug: string; status: string }> }
  >();

  for (const row of rows) {
    if (!bySolution.has(row.solution_slug)) {
      bySolution.set(row.solution_slug, { name: row.solution_name, brokenSteps: [] });
    }
    bySolution.get(row.solution_slug)!.brokenSteps.push({
      slug: row.capability_slug,
      status: row.step_status,
    });
  }

  let alerts = 0;

  for (const [solutionSlug, { name, brokenSteps }] of bySolution) {
    const stepDescriptions = brokenSteps
      .map((s) => `${s.slug} (${s.status})`)
      .join(", ");

    alerts++;

    await logHealthEvent({
      eventType: "invariant_violation",
      tier: 1,
      actionTaken: `BROKEN SOLUTION: '${solutionSlug}' (${name}) is active but has broken steps: ${stepDescriptions}. ` +
        `Deactivate solution or repair broken capability steps. ` +
        `Call onCapabilityDeactivated for each inactive capability.`,
      details: {
        check: "broken_solution_integrity",
        solutionSlug,
        solutionName: name,
        brokenSteps,
        actionRequired: "Deactivate solution or repair broken capability steps",
      },
    });

    console.error(
      `[invariant-checker] CHECK 6: Active solution '${solutionSlug}' has broken steps: ${stepDescriptions}`,
    );
  }

  return { alerts, checked: 1 };
}

// ─── CHECK 7: Migration completeness (Tier 2 — ALERT) ──────────────────────
// Verifies that retired providers have no remaining references in capability
// files. Catches incomplete migrations (e.g. leftover OpenSanctions URLs).

async function checkMigrationCompleteness(): Promise<{ alerts: number; checked: number }> {
  const { getRetiredProviders } = await import("../lib/dependency-manifest.js");
  const retired = getRetiredProviders();

  if (retired.length === 0) return { alerts: 0, checked: 0 };

  let alerts = 0;

  for (const provider of retired) {
    if (!provider.baseUrl) continue;

    try {
      const { execSync } = await import("child_process");
      const result = execSync(
        `grep -rl "${provider.baseUrl}" apps/api/src/capabilities/ --include="*.ts" 2>/dev/null || true`,
        { encoding: "utf-8", cwd: process.cwd() },
      ).trim();

      if (result) {
        const files = result.split("\n").filter(Boolean);
        alerts++;

        await logHealthEvent({
          eventType: "invariant_alert",
          tier: 2,
          actionTaken: `INCOMPLETE MIGRATION: Retired provider '${provider.name}' (${provider.baseUrl}) still referenced in ${files.length} file(s): ${files.join(", ")}`,
          details: {
            check: "migration_completeness",
            retiredProvider: provider.name,
            retiredBaseUrl: provider.baseUrl,
            replacedBy: provider.replacedFrom ? undefined : provider.name,
            filesWithReferences: files,
          },
        });

        console.error(
          `[invariant-checker] CHECK 7: Retired provider '${provider.name}' still referenced in: ${files.join(", ")}`,
        );
      }
    } catch {
      // grep not available or cwd issue — skip silently
    }
  }

  return { alerts, checked: retired.length };
}
