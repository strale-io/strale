/**
 * DB-Driven Test Scheduler — hourly free-only (DEC-20260503-B).
 *
 * Replaces the old setInterval-based scheduler that counted time from process
 * start. That approach broke on every Railway deploy (timers reset, tests
 * never fire during active development).
 *
 * Per DEC-20260503-B (2026-05-04), the previous tiered cadence (A=6h /
 * B=24h / C=72h) is replaced by a single hourly schedule for free
 * capabilities only. Paid capabilities (test_suites.external_cost_cents > 0)
 * are removed from scheduled testing entirely; quality signals for them
 * come from production observability, piggyback test suites, and any
 * zero-cost auth-less probes the vendor permits. The schedule_tier column
 * stays on test_suites for backwards compatibility but is no longer read
 * by the scheduler.
 *
 * Cadence: the scheduler ticks every minute. Each minute M (0–59) it
 * picks free capabilities whose `abs(hashtext(slug)) % 60 = M` and whose
 * last_tested_at is older than 1 hour. This stagger spreads the per-hour
 * test load across the hour to avoid spiky pressure on shared upstream
 * sources (Companies House, GLEIF, VIES, etc.).
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
import { isShuttingDown } from "../lib/shutdown.js";

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
    // Per DEC-20260503-B: a solution auto-activates when every step capability
    // has at least one passing test_result in the last 30 days. The previous
    // gate keyed on matrixSqs > 0 — replaced with a substrate-only signal.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const passingRows = await db.execute(sql`
      SELECT DISTINCT capability_slug
      FROM test_results
      WHERE capability_slug IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)})
        AND passed = true
        AND executed_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
    `);
    const passingSet = new Set(
      ((Array.isArray(passingRows) ? passingRows : (passingRows as any)?.rows ?? []) as { capability_slug: string }[])
        .map((r) => r.capability_slug),
    );
    const allQualified = slugs.every((s) => passingSet.has(s));
    if (allQualified && slugs.length > 0) {
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

const POLL_INTERVAL_MS = 60 * 1000;                 // 1 minute (per-minute slug-hash stagger)
const BATCH_SIZE = 20;                              // safety cap; expected ~5/min with hash spread
const DELAY_BETWEEN_CAPABILITIES_MS = 2_000;        // 2s between capabilities
const STARTUP_DELAY_MS = 90_000;                    // 90 seconds after startup
const FREE_TEST_INTERVAL_HOURS = 1;                 // DEC-20260503-B: hourly free-only

// schedule_tier (A/B/C) is no longer read by the scheduler. The column
// remains on test_suites for backwards compatibility and downstream
// consumers (refresh-stale-scores.ts uses it for freshness-decay tier
// hours). Per DEC-20260503-B, the scheduler dispatches strictly on
// external_cost_cents = 0 + slug-hash stagger.

// Auxiliary task intervals (in ms)
const HEALTH_CHECK_INTERVAL_MS      = 6 * 60 * 60 * 1000;   // 6h
const CHROMIUM_PROBE_INTERVAL_MS    = 30 * 60 * 1000;        // 30min
const META_HOURLY_INTERVAL_MS       = 60 * 60 * 1000;        // 1h — scheduler heartbeat + capability staleness watchdogs
const META_DAILY_INTERVAL_MS        = 24 * 60 * 60 * 1000;   // 24h — pipeline + free-tier checks
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
}

/**
 * Slug-hash modulo 60 — deterministic minute-of-hour offset for a slug.
 * Used by both the SQL query (Postgres `hashtext` keeps the agreement) and
 * the unit tests (TypeScript implementation must produce the same output).
 *
 * `hashtext` is Postgres's built-in lookup hash for character data —
 * stable across versions for ASCII inputs and well-spread for slug-shaped
 * strings. Wrapping in `abs()` ensures non-negative modulo.
 */
export function slugStaggerMinute(slug: string): number {
  // Mirrors `abs(hashtext($slug)) % 60` — used only in unit tests + as a
  // documentation aid. The authoritative computation lives in SQL so the
  // scheduler doesn't have to ship every active slug to the app layer.
  // We use the FNV-1a 32-bit hash here because it's deterministic and
  // well-distributed for slug strings; Postgres's `hashtext` is also
  // well-distributed but uses a different algorithm — the stagger only
  // needs to be deterministic per-slug, not cross-language identical.
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 60;
}

/**
 * Find free capabilities due for testing this minute.
 *
 * Per DEC-20260503-B:
 *   - external_cost_cents = 0  (free; paid caps skipped entirely)
 *   - last_tested_at older than 1h  (or never tested)
 *   - abs(hashtext(slug)) % 60 = current minute  (slug-hash stagger)
 *
 * The status floor (upstream_broken, infra_limited, quarantined) still
 * applies — known-broken suites back off to daily/weekly even on the new
 * hourly cadence. The "no status creates a black hole" invariant from the
 * old tiered query is preserved by the ELSE branch.
 */
async function findOverdueCapabilities(): Promise<OverdueCapability[]> {
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      c.slug,
      c.last_tested_at AS "lastTestedAt"
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.external_cost_cents = 0
      AND (abs(hashtext(c.slug)) % 60) = EXTRACT(MINUTE FROM NOW())::int
      AND (
        c.last_tested_at IS NULL
        OR c.last_tested_at < NOW() - GREATEST(
          INTERVAL '1 hour',
          CASE ts.test_status
            WHEN 'upstream_broken' THEN INTERVAL '24 hours'
            WHEN 'infra_limited'   THEN INTERVAL '24 hours'
            WHEN 'quarantined'     THEN INTERVAL '168 hours'
            ELSE INTERVAL '0 hours'
          END
        )
      )
    GROUP BY c.slug, c.last_tested_at
    ORDER BY c.last_tested_at ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows.map((r: any) => ({
    slug: r.slug,
    lastTestedAt: r.lastTestedAt ? new Date(r.lastTestedAt) : null,
  }));
}

/**
 * Total count of free capabilities currently overdue (across the whole
 * hour, ignoring the per-minute stagger). Used for queue-depth
 * observability — if this number creeps up, hourly testing is falling
 * behind.
 */
async function countOverdueCapabilities(): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(DISTINCT c.slug)::int AS count
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.external_cost_cents = 0
      AND (
        c.last_tested_at IS NULL
        OR c.last_tested_at < NOW() - GREATEST(
          INTERVAL '1 hour',
          CASE ts.test_status
            WHEN 'upstream_broken' THEN INTERVAL '24 hours'
            WHEN 'infra_limited'   THEN INTERVAL '24 hours'
            WHEN 'quarantined'     THEN INTERVAL '168 hours'
            ELSE INTERVAL '0 hours'
          END
        )
      )
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows[0]?.count ?? 0;
}

/**
 * Total count of paid capabilities skipped by the scheduler. Used for
 * end-of-cycle observability so operators can see how many paid caps the
 * scheduler is consciously NOT testing per DEC-20260503-B.
 */
async function countPaidSkipped(): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(DISTINCT c.slug)::int AS count
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.external_cost_cents > 0
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows[0]?.count ?? 0;
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

  // Hourly meta-monitoring (scheduler heartbeat + capability staleness).
  // These watch the scheduler itself; if it stops or starts dropping caps,
  // the heartbeat won't fire here either, so the scripts/meta-monitoring-run.ts
  // CLI invocation remains a backstop for the truly-stopped case.
  if (shouldRun("meta-hourly", META_HOURLY_INTERVAL_MS)) {
    try {
      const { runHourlyChecks } = await import("../lib/meta-monitoring.js");
      await runHourlyChecks();
    } catch (err) {
      logError("test-scheduler-meta-hourly-failed", err);
    }
  }

  // Daily meta-monitoring (pipeline + free-tier checks).
  if (shouldRun("meta-daily", META_DAILY_INTERVAL_MS)) {
    try {
      const { runDailyChecks } = await import("../lib/meta-monitoring.js");
      await runDailyChecks();
    } catch (err) {
      logError("test-scheduler-meta-daily-failed", err);
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

      // Find this minute's free capabilities + total queue depth (caps
      // overdue across the whole hour) + paid-skipped count. Paid skipped
      // is logged once per tick for visibility into the DEC-20260503-B
      // policy: the scheduler is consciously NOT testing those.
      const [overdue, queueDepth, paidSkipped] = await Promise.all([
        findOverdueCapabilities(),
        countOverdueCapabilities().catch(() => -1),
        countPaidSkipped().catch(() => -1),
      ]);

      if (overdue.length === 0) {
        jobLog.info(
          {
            label: "test-scheduler-poll-no-stagger-match",
            queue_depth: queueDepth,
            paid_skipped: paidSkipped,
            current_minute: new Date().getMinutes(),
          },
          "no free capabilities match this minute's stagger; nothing to test",
        );
        return;
      }

      // Check provider health — skip capabilities whose provider is unhealthy
      // to prevent SQS score pollution during outages
      let runnableCaps = overdue;
      let skippedSlugs: string[] = [];
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
          skippedSlugs = overdue
            .filter((cap) => unhealthySlugs.has(cap.slug))
            .map((cap) => cap.slug);
          runnableCaps = overdue.filter((cap) => !unhealthySlugs.has(cap.slug));
          if (skippedSlugs.length > 0) {
            jobLog.info(
              { label: "test-scheduler-skip-unhealthy", skipped_count: skippedSlugs.length },
              "test-scheduler-skip-unhealthy",
            );
          }
        }
      } catch {
        // If health check fails, run all tests (graceful degradation)
      }
      const skippedUnhealthy = skippedSlugs.length;

      // Skip-marker: bump last_tested_at + freshness_level on caps we skipped
      // due to unhealthy provider, so they don't permanently occupy the queue
      // head and starve the rest of the catalog. Without this, every probe
      // cycle returns the SAME 20 oldest caps (all unhealthy), filters them
      // all out, and exits — caps further down the queue never get a turn.
      //
      // We DO NOT touch matrix_sqs / qp_score / rp_score — those reflect the
      // last real test result and stay accurate. We DO set freshness_level to
      // 'unverified' because freshness-decay treats that as "score forced to
      // 0" — honest reflection that we couldn't verify this cap right now.
      // When the provider recovers, the next real test will reset
      // freshness_level via persistDualProfileScores.
      //
      // No fake test_results rows are inserted; this is purely a queue-
      // ordering hint that respects the Scoring Integrity Protocol.
      if (skippedSlugs.length > 0) {
        try {
          // Use drizzle's typed UPDATE + inArray — the previous raw-SQL
          // form `WHERE slug = ANY(${skippedSlugs})` interpolated the JS
          // array as a tuple `($1,$2,$3)` (row constructor) which Postgres
          // rejects with "op ANY/ALL (array) requires array on right side".
          // Production logs from 2026-04-30 onward show this firing every
          // 5 min while the scheduler ticked at 5-min cadence; PR #46
          // moved that to 1-min cadence which would have amplified the
          // failure rate 5×. Bug pre-existed PR #46 — fixing here.
          await getDb()
            .update(capabilities)
            .set({
              lastTestedAt: new Date(),
              freshnessLevel: "unverified",
            })
            .where(inArray(capabilities.slug, skippedSlugs));
          jobLog.info(
            { label: "test-scheduler-skip-bumped", count: skippedSlugs.length },
            "test-scheduler-skip-bumped",
          );
        } catch (err) {
          // Non-fatal — scheduler continues with runnableCaps. Worst case is
          // we replay the same blocked queue head next tick.
          logError("test-scheduler-skip-bump-failed", err, { count: skippedSlugs.length });
        }
      }

      if (runnableCaps.length === 0) {
        jobLog.info({ label: "test-scheduler-poll-all-unhealthy" }, "all overdue capabilities have unhealthy providers, skipping");
        return;
      }

      jobLog.info(
        {
          label: "test-scheduler-poll-start",
          runnable: runnableCaps.length,
          queue_depth: queueDepth,
          paid_skipped: paidSkipped,
          skipped_unhealthy: skippedUnhealthy,
          current_minute: new Date().getMinutes(),
        },
        "test-scheduler-poll-start",
      );

      let totalPassed = 0;
      let totalFailed = 0;

      for (const cap of runnableCaps) {
        const agoMs = cap.lastTestedAt ? Date.now() - cap.lastTestedAt.getTime() : null;
        const agoLabel = agoMs != null ? `${Math.round(agoMs / 3600_000)}h ago` : "never tested";

        try {
          jobLog.info(
            { label: "test-scheduler-testing", capability_slug: cap.slug, last_tested: agoLabel },
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
          skipped_unhealthy: skippedUnhealthy,
          paid_skipped: paidSkipped,
          queue_depth: queueDepth,
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
              skipped_unhealthy: skippedUnhealthy,
              paid_skipped: paidSkipped,
              queue_depth: queueDepth,
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
    if (isShuttingDown()) return;
    pollCycle().catch((err) => logError("test-scheduler-initial-poll-failed", err));

    // Recurring poll
    _pollTimer = setInterval(() => {
      if (isShuttingDown()) return;
      pollCycle().catch((err) => logError("test-scheduler-poll-failed", err));
    }, POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
