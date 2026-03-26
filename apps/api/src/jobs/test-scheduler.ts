/**
 * DB-Driven Test Scheduler
 *
 * Replaces the old setInterval-based scheduler that counted time from process
 * start. That approach broke on every Railway deploy (timers reset, tests
 * never fire during active development).
 *
 * This scheduler polls the DB every 5 minutes for capabilities whose
 * last_tested_at is overdue relative to their schedule tier. It is
 * deploy-resistant because it relies on DB state, not process uptime.
 *
 * Also runs auxiliary periodic tasks (health checks, chromium probes,
 * weekly sweep, diagnostics, snapshots, retention, staleness refresh,
 * weekly digest) using "time since last run" checks rather than bare
 * setInterval.
 */

import { sql, eq, and, inArray, asc, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites, testResults } from "../db/schema.js";
import { runTests, persistDualProfileScores } from "../lib/test-runner.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { isCacheExpired, refreshUpstreamMapping } from "../lib/upstream-health-gate.js";
import { probeChromiumHealth } from "../lib/chromium-health.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5 * 60 * 1000;            // 5 minutes
const BATCH_SIZE = 20;                              // max capabilities per poll cycle
const DELAY_BETWEEN_CAPABILITIES_MS = 2_000;        // 2s between capabilities
const STARTUP_DELAY_MS = 90_000;                    // 90 seconds after startup

const TIER_HOURS: Record<string, number> = { A: 6, B: 24, C: 72 };

// Auxiliary task intervals (in ms)
const HEALTH_CHECK_INTERVAL_MS      = 6 * 60 * 60 * 1000;   // 6h
const CHROMIUM_PROBE_INTERVAL_MS    = 30 * 60 * 1000;        // 30min
const WEEKLY_SWEEP_INTERVAL_MS      = 7 * 24 * 60 * 60 * 1000;
const DIAGNOSTIC_INTERVAL_MS        = 24 * 60 * 60 * 1000;   // 24h
const SNAPSHOT_INTERVAL_MS          = 24 * 60 * 60 * 1000;   // 24h
const RETENTION_INTERVAL_MS         = 7 * 24 * 60 * 60 * 1000;
const STALE_REFRESH_INTERVAL_MS     = 2 * 60 * 60 * 1000;    // 2h

// ─── State ──────────────────────────────────────────────────────────────────

let _isRunning = false;
let _started = false;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

// Track last-run timestamps for auxiliary tasks (in-memory — reset on deploy is fine)
const _lastRun: Record<string, number> = {};

function shouldRun(taskName: string, intervalMs: number): boolean {
  const last = _lastRun[taskName] ?? 0;
  if (Date.now() - last >= intervalMs) {
    _lastRun[taskName] = Date.now();
    return true;
  }
  return false;
}

// ─── Advisory lock helpers ──────────────────────────────────────────────────

const LOCK_ID = 314159; // arbitrary unique lock ID for test scheduler

async function tryAcquireLock(): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db.execute(sql`SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`);
    const rows = Array.isArray(result) ? result : (result as any)?.rows ?? [];
    return rows[0]?.acquired === true;
  } catch {
    return true; // If lock query fails, proceed anyway (single-instance fallback)
  }
}

async function releaseLock(): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_ID})`);
  } catch {
    // Best-effort release
  }
}

// ─── Core polling query ─────────────────────────────────────────────────────

interface OverdueCapability {
  slug: string;
  lastTestedAt: Date | null;
  scheduleTier: string;
}

async function findOverdueCapabilities(): Promise<OverdueCapability[]> {
  const db = getDb();

  // Find capabilities where last_tested_at is overdue for their tier.
  // Uses MIN(schedule_tier) to pick the most frequent tier per capability.
  const rows = await db.execute(sql`
    SELECT
      c.slug,
      c.last_tested_at AS "lastTestedAt",
      MIN(ts.schedule_tier) AS "scheduleTier"
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.test_status IN ('normal', 'env_dependent', 'upstream_broken')
      AND (
        c.last_tested_at IS NULL
        OR (ts.schedule_tier = 'A' AND c.last_tested_at < NOW() - INTERVAL '6 hours')
        OR (ts.schedule_tier = 'B' AND c.last_tested_at < NOW() - INTERVAL '24 hours')
        OR (ts.schedule_tier = 'C' AND c.last_tested_at < NOW() - INTERVAL '72 hours')
      )
    GROUP BY c.slug, c.last_tested_at
    ORDER BY c.last_tested_at ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows.map((r: any) => ({
    slug: r.slug,
    lastTestedAt: r.lastTestedAt ? new Date(r.lastTestedAt) : null,
    scheduleTier: r.scheduleTier ?? "B",
  }));
}

// ─── Delay helper ───────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Auxiliary tasks ────────────────────────────────────────────────────────

async function runAuxiliaryTasks(): Promise<void> {
  // Chromium health probe (30min)
  if (shouldRun("chromium-probe", CHROMIUM_PROBE_INTERVAL_MS)) {
    try {
      await probeChromiumHealth();
    } catch (err) {
      console.error("[test-scheduler] Chromium probe error:", err instanceof Error ? err.message : err);
    }
  }

  // Dependency health checks (6h)
  if (shouldRun("health-check", HEALTH_CHECK_INTERVAL_MS)) {
    try {
      const { runDependencyHealthChecks } = await import("../lib/dependency-health.js");
      const results = await runDependencyHealthChecks();
      const unhealthy = Object.entries(results).filter(([, r]) => !(r as any).healthy);
      if (unhealthy.length > 0) {
        console.warn(
          `[test-scheduler] Unhealthy dependencies: ${unhealthy.map(([name, r]) => `${name} (${(r as any).error ?? "down"})`).join(", ")}`,
        );
      } else {
        console.log(
          `[test-scheduler] All dependencies healthy: ${Object.entries(results).map(([name, r]) => `${name}=${(r as any).latency_ms}ms`).join(", ")}`,
        );
      }
    } catch (err) {
      console.error("[test-scheduler] Health check failed:", err);
    }
  }

  // Staleness refresh (2h)
  if (shouldRun("stale-refresh", STALE_REFRESH_INTERVAL_MS)) {
    try {
      const { refreshStaleScores } = await import("./refresh-stale-scores.js");
      await refreshStaleScores();
    } catch (err) {
      console.error("[test-scheduler] Stale refresh failed:", err instanceof Error ? err.message : err);
    }
  }

  // Daily diagnostics (24h)
  if (shouldRun("diagnostics", DIAGNOSTIC_INTERVAL_MS)) {
    try {
      const { runDiagnostic } = await import("../diagnostics/self-heal-check.js");
      const report = await runDiagnostic();
      if (report.failed > 0) {
        console.error(`[test-scheduler] Diagnostic: ${report.passed}/${report.checksRun} passed — ${report.criticalFindings.length} critical`);
      } else {
        console.log(`[test-scheduler] Diagnostic: ${report.passed}/${report.checksRun} checks passed`);
      }
    } catch (err) {
      console.error("[test-scheduler] Diagnostic failed:", err instanceof Error ? err.message : err);
    }
  }

  // Daily SQS snapshot (24h)
  if (shouldRun("sqs-snapshot", SNAPSHOT_INTERVAL_MS)) {
    try {
      const { captureDailySnapshots } = await import("../lib/sqs-snapshots.js");
      await captureDailySnapshots();
    } catch (err) {
      console.error("[test-scheduler] SQS snapshot failed:", err instanceof Error ? err.message : err);
    }
  }

  // Weekly health sweep (7d)
  if (shouldRun("weekly-sweep", WEEKLY_SWEEP_INTERVAL_MS)) {
    try {
      const { runWeeklyHealthSweep } = await import("../lib/health-sweep.js");
      await runWeeklyHealthSweep();
    } catch (err) {
      console.error("[test-scheduler] Weekly sweep failed:", err);
    }
  }

  // Weekly data retention cleanup (7d)
  if (shouldRun("retention", RETENTION_INTERVAL_MS)) {
    try {
      const { cleanupOldTestData } = await import("../lib/data-retention.js");
      await cleanupOldTestData();
    } catch (err) {
      console.error("[test-scheduler] Retention cleanup failed:", err instanceof Error ? err.message : err);
    }
  }
}

// ─── Poll cycle ─────────────────────────────────────────────────────────────

async function pollCycle(): Promise<void> {
  if (_isRunning) {
    console.log("[test-scheduler] Previous cycle still running, skipping");
    return;
  }

  _isRunning = true;
  let lockAcquired = false;

  try {
    // Advisory lock — prevents duplicate runs if Railway scales to 2 instances
    lockAcquired = await tryAcquireLock();
    if (!lockAcquired) {
      console.log("[test-scheduler] Another instance holds the lock, skipping");
      return;
    }

    // Refresh upstream health mapping if stale
    if (isCacheExpired()) {
      await refreshUpstreamMapping().catch(() => {});
    }

    // Run auxiliary tasks (health checks, probes, etc.)
    await runAuxiliaryTasks();

    // Find overdue capabilities
    const overdue = await findOverdueCapabilities();

    if (overdue.length === 0) {
      console.log("[test-scheduler] Poll: all capabilities fresh, nothing to test");
      return;
    }

    // Check provider health — skip capabilities whose provider is unhealthy
    // to prevent SQS score pollution during outages
    let runnableCaps = overdue;
    try {
      const { runDependencyHealthChecks } = await import("../lib/dependency-health.js");
      const { getActiveProviders } = await import("../lib/dependency-manifest.js");
      const providerHealth = await runDependencyHealthChecks();
      const unhealthySlugs = new Set<string>();
      for (const provider of getActiveProviders()) {
        const health = providerHealth[provider.name];
        if (health && !health.healthy) {
          for (const cap of provider.capabilities) {
            unhealthySlugs.add(cap);
          }
        }
      }
      if (unhealthySlugs.size > 0) {
        const before = runnableCaps.length;
        runnableCaps = overdue.filter((cap) => !unhealthySlugs.has(cap.slug));
        const skipped = before - runnableCaps.length;
        if (skipped > 0) {
          console.log(
            `[test-scheduler] Skipping ${skipped} capabilities with unhealthy providers`,
          );
        }
      }
    } catch {
      // If health check fails, run all tests (graceful degradation)
    }

    if (runnableCaps.length === 0) {
      console.log("[test-scheduler] Poll: all overdue capabilities have unhealthy providers, skipping");
      return;
    }

    // Summarize by tier
    const tierCounts: Record<string, number> = {};
    for (const cap of runnableCaps) {
      tierCounts[cap.scheduleTier] = (tierCounts[cap.scheduleTier] ?? 0) + 1;
    }
    const tierSummary = Object.entries(tierCounts)
      .map(([tier, count]) => `${count} tier-${tier}`)
      .join(", ");
    console.log(`[test-scheduler] Poll: ${runnableCaps.length} overdue capabilities (${tierSummary})`);

    let totalPassed = 0;
    let totalFailed = 0;

    for (const cap of runnableCaps) {
      const agoMs = cap.lastTestedAt ? Date.now() - cap.lastTestedAt.getTime() : null;
      const agoLabel = agoMs != null ? `${Math.round(agoMs / 3600_000)}h ago` : "never tested";

      try {
        console.log(`[test-scheduler] Testing ${cap.slug} (tier ${cap.scheduleTier}, last tested ${agoLabel})...`);

        const summary = await runTests({ capabilitySlug: cap.slug });
        totalPassed += summary.passed;
        totalFailed += summary.failed;

        // runTests() already calls persistDualProfileScores() internally (line 294),
        // so DB columns are updated immediately after each capability's tests.

        console.log(
          `[test-scheduler] ${cap.slug}: ${summary.passed}/${summary.total} passed`,
        );

        // Log individual failures for Railway log monitoring
        for (const r of summary.results) {
          if (!r.passed) {
            const tag = r.remediation
              ? `[${r.remediation.outcome}]`
              : "[escalate]";
            console.warn(
              `[test-scheduler] FAIL ${tag} [${r.capabilitySlug}] ${r.testName} — ${r.failureReason}`,
            );
          }
        }
      } catch (err) {
        console.error(`[test-scheduler] ${cap.slug} threw:`, err instanceof Error ? err.message : err);
      }

      await delay(DELAY_BETWEEN_CAPABILITIES_MS);
    }

    console.log(
      `[test-scheduler] Poll complete: ${runnableCaps.length} capabilities tested, ${totalPassed} passed, ${totalFailed} failed`,
    );

    // Write scheduler heartbeat for watchdog monitoring
    logHealthEvent({
      eventType: "scheduler_heartbeat",
      tier: 1,
      actionTaken: `DB-driven poll: ${runnableCaps.length} capabilities tested`,
      details: {
        tested: runnableCaps.length,
        passed: totalPassed,
        failed: totalFailed,
        tierCounts,
      },
    }).catch(() => {});
  } catch (err) {
    console.error("[test-scheduler] Poll cycle error:", err);
  } finally {
    if (lockAcquired) {
      await releaseLock();
    }
    _isRunning = false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startTestScheduler(): void {
  if (_started) return;
  _started = true;

  console.log(
    `[test-scheduler] DB-driven scheduler started (${STARTUP_DELAY_MS / 1000}s startup delay, ${POLL_INTERVAL_MS / 60_000}min poll interval, batch size ${BATCH_SIZE})`,
  );

  // Stale score repair 15s after startup (carried over from old scheduler)
  setTimeout(async () => {
    try {
      const { repairStaleScores } = await import("../lib/test-runner.js");
      await repairStaleScores();
    } catch (err) {
      console.error("[test-scheduler] Stale score repair failed:", err);
    }
  }, 15_000);

  // Weekly digest scheduling (independent timer — needs Monday 08:00 CET alignment)
  setTimeout(async () => {
    try {
      const { scheduleWeeklyDigest } = await import("../lib/test-runner.js");
      scheduleWeeklyDigest();
    } catch (err) {
      console.error("[test-scheduler] Weekly digest scheduling failed:", err);
    }
  }, 5_000);

  // First poll after startup delay
  setTimeout(() => {
    pollCycle().catch((err) =>
      console.error("[test-scheduler] Initial poll failed:", err),
    );

    // Recurring poll
    _pollTimer = setInterval(() => {
      pollCycle().catch((err) =>
        console.error("[test-scheduler] Poll failed:", err),
      );
    }, POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
