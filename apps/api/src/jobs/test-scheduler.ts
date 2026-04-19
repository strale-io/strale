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
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps, testSuites, testResults } from "../db/schema.js";
import { runTests, persistDualProfileScores } from "../lib/test-runner.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { isCacheExpired, refreshUpstreamMapping } from "../lib/upstream-health-gate.js";
import { probeChromiumHealth } from "../lib/chromium-health.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import { randomUUID } from "node:crypto";
import { log, logError, logWarn } from "../lib/log.js";

// ─── Solution quality gate (auto-activate when all steps are scored) ────────

async function checkSolutionGates(capabilitySlug: string): Promise<void> {
  const db = getDb();

  // Find inactive solutions that include this capability as a step
  const affectedSteps = await db
    .select({ solutionId: solutionSteps.solutionId })
    .from(solutionSteps)
    .where(eq(solutionSteps.capabilitySlug, capabilitySlug));

  const solutionIds = [...new Set(affectedSteps.map((s) => s.solutionId))];
  if (solutionIds.length === 0) return;

  for (const solId of solutionIds) {
    const [sol] = await db.select({ slug: solutions.slug, isActive: solutions.isActive })
      .from(solutions).where(eq(solutions.id, solId)).limit(1);
    if (!sol || sol.isActive) continue; // Already active

    // Check all steps
    const steps = await db.select({ capabilitySlug: solutionSteps.capabilitySlug })
      .from(solutionSteps).where(eq(solutionSteps.solutionId, solId));

    const slugs = steps.map((s) => s.capabilitySlug);
    const caps = await db.select({ slug: capabilities.slug, matrixSqs: capabilities.matrixSqs })
      .from(capabilities).where(inArray(capabilities.slug, slugs));

    const allQualified = caps.every((c) => c.matrixSqs && parseFloat(String(c.matrixSqs)) > 0);
    if (allQualified && caps.length === slugs.length) {
      await db.update(solutions)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(solutions.id, solId));
      log.info(
        { label: "solution-gate-auto-activated", solution_slug: sol.slug },
        "solution-gate-auto-activated",
      );
    }
  }
}

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

// ─── Advisory lock helper ───────────────────────────────────────────────────
//
// Why a dedicated connection instead of the sibling jobs' xact-scoped pattern:
// a poll cycle iterates up to BATCH_SIZE (20) capabilities with ~2s delay
// between each and each capability makes live HTTP calls (Browserless, paid
// APIs, registries) — a single cycle runs 5–10 minutes. Wrapping the whole
// thing in `db.transaction(async (tx) => {...})` would (a) hold one pooled
// connection for the entire cycle, starving the live API, and (b) rollback
// every test_result write on any single failure, poisoning the SQS window.
//
// Instead we carve out a single dedicated `postgres` client (max: 1) whose
// sole job is to hold the session-scoped lock. All test work runs through
// the regular pool and commits independently. The lock lives on a connection
// we own — `pg_advisory_unlock` is guaranteed to hit the same session, so
// the pool-reuse bug that bit the Phase C deploy (session-scoped lock on a
// shared pool connection) cannot happen here.

const LOCK_ID = 314159; // arbitrary unique lock ID for test scheduler

async function withAdvisoryLock<T>(
  id: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // No DB configured (local dev without env) — fall through without locking.
    return { acquired: true, value: await fn() };
  }

  const client = postgres(dbUrl, { max: 1 });
  try {
    let acquired = false;
    try {
      const rows = await client<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(${id}) AS acquired
      `;
      acquired = rows[0]?.acquired === true;
    } catch (err) {
      // If the lock query itself fails, log and proceed unlocked (single-
      // instance fallback). Better to run unlocked than to silently skip.
      logWarn("test-scheduler-lock-query-failed", "proceeding without lock", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { acquired: true, value: await fn() };
    }

    if (!acquired) {
      return { acquired: false };
    }

    try {
      return { acquired: true, value: await fn() };
    } finally {
      // Best-effort release on the same dedicated connection that took the
      // lock — pool reuse cannot steal this unlock. A failure here is
      // harmless (the session ends below and PG releases the lock
      // implicitly) but we log it so operators see if it ever happens.
      await client`SELECT pg_advisory_unlock(${id})`.catch((err) =>
        logError("test-scheduler-lock-release-failed", err, { lockId: id }),
      );
    }
  } finally {
    await client.end({ timeout: 5 }).catch((err) =>
      logError("test-scheduler-lock-client-end-failed", err, { lockId: id }),
    );
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
      logError("test-scheduler-chromium-probe-error", err);
    }
  }

  // Dependency health checks (6h)
  if (shouldRun("health-check", HEALTH_CHECK_INTERVAL_MS)) {
    try {
      const { runDependencyHealthChecks } = await import("../lib/dependency-health.js");
      const results = await runDependencyHealthChecks();
      const unhealthy = Object.entries(results).filter(([, r]) => !(r as any).healthy);
      if (unhealthy.length > 0) {
        logWarn("test-scheduler-unhealthy-deps", "some dependencies unhealthy", {
          unhealthy: unhealthy.map(([name, r]) => ({ name, error: (r as any).error ?? "down" })),
        });
      } else {
        log.info(
          {
            label: "test-scheduler-all-healthy",
            deps: Object.entries(results).map(([name, r]) => ({ name, latency_ms: (r as any).latency_ms })),
          },
          "test-scheduler-all-healthy",
        );
      }
    } catch (err) {
      logError("test-scheduler-health-check-failed", err);
    }
  }

  // Staleness refresh (2h)
  if (shouldRun("stale-refresh", STALE_REFRESH_INTERVAL_MS)) {
    try {
      const { refreshStaleScores } = await import("./refresh-stale-scores.js");
      await refreshStaleScores();
    } catch (err) {
      logError("test-scheduler-stale-refresh-failed", err);
    }
  }

  // Daily diagnostics (24h)
  if (shouldRun("diagnostics", DIAGNOSTIC_INTERVAL_MS)) {
    try {
      const { runDiagnostic } = await import("../diagnostics/self-heal-check.js");
      const report = await runDiagnostic();
      if (report.failed > 0) {
        logError(
          "test-scheduler-diagnostic-findings",
          new Error(`${report.failed} critical findings`),
          { passed: report.passed, checks_run: report.checksRun, critical_count: report.criticalFindings.length },
        );
      } else {
        log.info(
          { label: "test-scheduler-diagnostic-passed", passed: report.passed, checks_run: report.checksRun },
          "test-scheduler-diagnostic-passed",
        );
      }
    } catch (err) {
      logError("test-scheduler-diagnostic-failed", err);
    }
  }

  // Daily SQS snapshot (24h)
  if (shouldRun("sqs-snapshot", SNAPSHOT_INTERVAL_MS)) {
    try {
      const { captureDailySnapshots } = await import("../lib/sqs-snapshots.js");
      await captureDailySnapshots();
    } catch (err) {
      logError("test-scheduler-sqs-snapshot-failed", err);
    }
  }

  // Weekly health sweep (7d)
  if (shouldRun("weekly-sweep", WEEKLY_SWEEP_INTERVAL_MS)) {
    try {
      const { runWeeklyHealthSweep } = await import("../lib/health-sweep.js");
      await runWeeklyHealthSweep();
    } catch (err) {
      logError("test-scheduler-weekly-sweep-failed", err);
    }
  }

  // Weekly data retention cleanup (7d)
  if (shouldRun("retention", RETENTION_INTERVAL_MS)) {
    try {
      const { cleanupOldTestData } = await import("../lib/data-retention.js");
      await cleanupOldTestData();
    } catch (err) {
      logError("test-scheduler-retention-cleanup-failed", err);
    }
  }
}

// ─── Poll cycle ─────────────────────────────────────────────────────────────

async function pollCycle(): Promise<void> {
  if (_isRunning) {
    log.info({ label: "test-scheduler-cycle-overlap-skip" }, "previous cycle still running, skipping");
    return;
  }

  _isRunning = true;
  const runId = randomUUID();
  const jobLog = log.child({ job: "test-scheduler", job_run_id: runId });

  try {
    // Advisory lock on a dedicated connection. Prevents duplicate runs when
    // Railway scales to 2+ instances; the helper's own connection guarantees
    // the lock and the unlock hit the same session (no pool-reuse gap).
    const outcome = await withAdvisoryLock(LOCK_ID, async () => {
      // Refresh upstream health mapping if stale
      if (isCacheExpired()) {
        await refreshUpstreamMapping().catch((err) =>
          logError("upstream-mapping-refresh-failed", err, { job: "test-scheduler" }),
        );
      }

      // Run auxiliary tasks (health checks, probes, etc.)
      await runAuxiliaryTasks();

      // Find overdue capabilities
      const overdue = await findOverdueCapabilities();

      if (overdue.length === 0) {
        jobLog.info({ label: "test-scheduler-poll-all-fresh" }, "all capabilities fresh, nothing to test");
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
            jobLog.info(
              { label: "test-scheduler-skip-unhealthy", skipped_count: skipped },
              "test-scheduler-skip-unhealthy",
            );
          }
        }
      } catch {
        // If health check fails, run all tests (graceful degradation)
      }

      if (runnableCaps.length === 0) {
        jobLog.info({ label: "test-scheduler-poll-all-unhealthy" }, "all overdue capabilities have unhealthy providers, skipping");
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
      jobLog.info(
        { label: "test-scheduler-poll-start", runnable: runnableCaps.length, tier_counts: tierCounts },
        "test-scheduler-poll-start",
      );

      let totalPassed = 0;
      let totalFailed = 0;

      for (const cap of runnableCaps) {
        const agoMs = cap.lastTestedAt ? Date.now() - cap.lastTestedAt.getTime() : null;
        const agoLabel = agoMs != null ? `${Math.round(agoMs / 3600_000)}h ago` : "never tested";

        try {
          jobLog.info(
            { label: "test-scheduler-testing", capability_slug: cap.slug, tier: cap.scheduleTier, last_tested: agoLabel },
            "test-scheduler-testing",
          );

          const summary = await runTests({ capabilitySlug: cap.slug });
          totalPassed += summary.passed;
          totalFailed += summary.failed;

          // runTests() already calls persistDualProfileScores() internally (line 294),
          // so DB columns are updated immediately after each capability's tests.

          jobLog.info(
            { label: "test-scheduler-tested", capability_slug: cap.slug, passed: summary.passed, total: summary.total },
            "test-scheduler-tested",
          );

          // Auto-activate gated solutions when all steps become qualified
          try {
            await checkSolutionGates(cap.slug);
          } catch (gateErr) {
            // Non-critical — don't block the scheduler
          }

          // Log individual failures for Railway log monitoring
          for (const r of summary.results) {
            if (!r.passed) {
              const outcome = r.remediation?.outcome ?? "escalate";
              jobLog.warn(
                {
                  label: "test-scheduler-test-fail",
                  capability_slug: r.capabilitySlug,
                  test_name: r.testName,
                  remediation_outcome: outcome,
                  err: r.failureReason,
                },
                "test-scheduler-test-fail",
              );
            }
          }
        } catch (err) {
          jobLog.error(
            { label: "test-scheduler-cap-threw", capability_slug: cap.slug, err: err instanceof Error ? { message: err.message } : err },
            "test-scheduler-cap-threw",
          );
        }

        await delay(DELAY_BETWEEN_CAPABILITIES_MS);
      }

      jobLog.info(
        {
          label: "test-scheduler-poll-complete",
          tested: runnableCaps.length,
          passed: totalPassed,
          failed: totalFailed,
        },
        "test-scheduler-poll-complete",
      );

      // Write scheduler heartbeat for watchdog monitoring
      fireAndForget(
        () =>
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
          }),
        { label: "health-event-log", context: { event: "scheduler_heartbeat" } },
      );
    });

    if (!outcome.acquired) {
      logWarn("test-scheduler-lock-busy", "another holder; skipping tick", { job_run_id: runId });
    }
  } catch (err) {
    logError("test-scheduler-poll-cycle-error", err, { job_run_id: runId });
  } finally {
    _isRunning = false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startTestScheduler(): void {
  if (_started) return;
  _started = true;

  log.info(
    {
      label: "test-scheduler-started",
      startup_delay_s: STARTUP_DELAY_MS / 1000,
      poll_interval_min: POLL_INTERVAL_MS / 60_000,
      batch_size: BATCH_SIZE,
    },
    "test-scheduler-started",
  );

  // Stale score repair 15s after startup (carried over from old scheduler)
  setTimeout(async () => {
    try {
      const { repairStaleScores } = await import("../lib/test-runner.js");
      await repairStaleScores();
    } catch (err) {
      logError("test-scheduler-stale-repair-failed", err);
    }
  }, 15_000);

  // Weekly digest scheduling (independent timer — needs Monday 08:00 CET alignment)
  setTimeout(async () => {
    try {
      const { scheduleWeeklyDigest } = await import("../lib/test-runner.js");
      scheduleWeeklyDigest();
    } catch (err) {
      logError("test-scheduler-digest-schedule-failed", err);
    }
  }, 5_000);

  // First poll after startup delay
  setTimeout(() => {
    pollCycle().catch((err) => logError("test-scheduler-initial-poll-failed", err));

    // Recurring poll
    _pollTimer = setInterval(() => {
      pollCycle().catch((err) => logError("test-scheduler-poll-failed", err));
    }, POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
