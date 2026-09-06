/**
 * DB-driven test scheduler — risk-tiered and quota-aware.
 *
 * Replaces the old setInterval-based scheduler that counted time from process
 * start. That approach broke on every Railway deploy (timers reset, tests
 * never fire during active development).
 *
 * Paid capabilities remain excluded from scheduled testing. Zero-cost fixture
 * and free-unlimited suites retain the established hourly cadence. Finite-cost
 * live/canary suites run at their declared risk cadence (A=6h, B=24h, C=72h),
 * with conservative daily/72h quota floors. Per-window budget counters are
 * checked here and atomically enforced again at the dispatcher.
 *
 * Cadence: the scheduler ticks every minute. Each minute M (0–59) it
 * picks eligible suites whose stable hash maps to M and whose most recent
 * result is older than the applicable cadence. The stagger spreads due work
 * across each hour to avoid spiky pressure on shared upstream sources.
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
import { runTests } from "../lib/test-runner.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { isCacheExpired, refreshUpstreamMapping } from "../lib/upstream-health-gate.js";
import { probeChromiumHealth } from "../lib/chromium-health.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import { randomUUID } from "node:crypto";
import { log, logError, logWarn } from "../lib/log.js";
import { isShuttingDown } from "../lib/shutdown.js";
import { consumeDueSlot } from "../lib/job-coordinator.js";

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
// schedule_tier governs finite-cost live/canary work: A=6h, B=24h, C=72h.
// Fixture and genuinely free-unlimited suites stay hourly so cost protection
// does not silently reduce their regression signal. Finite account allowances
// get an additional 24h/72h floor.

// Auxiliary task intervals (in ms)
const HEALTH_CHECK_INTERVAL_MS      = 6 * 60 * 60 * 1000;   // 6h
const CHROMIUM_PROBE_INTERVAL_MS    = 30 * 60 * 1000;        // 30min
const META_HOURLY_INTERVAL_MS       = 60 * 60 * 1000;        // 1h — scheduler heartbeat + capability staleness watchdogs
const META_DAILY_INTERVAL_MS        = 24 * 60 * 60 * 1000;   // 24h — pipeline + free-tier checks
const WEEKLY_SWEEP_INTERVAL_MS      = 7 * 24 * 60 * 60 * 1000;
const DIAGNOSTIC_INTERVAL_MS        = 24 * 60 * 60 * 1000;   // 24h
const SNAPSHOT_INTERVAL_MS          = 24 * 60 * 60 * 1000;   // 24h
// 24h, not 7d. The content redaction this gates is capped at
// BATCH_SIZE * MAX_BATCHES_PER_RUN = 50,000 rows per run (data-retention.ts).
// At weekly cadence that is 50,000/week of capacity against ~60,000/week of
// rows crossing the 90-day line — a standing deficit of ~10,000/week that
// compounds, because nothing ever catches up. Measured in production
// 2026-09-06: 87,300 eligible rows, oldest 103 days against a stated 90-day
// window, and the 2026-08-30 run hit the 50,000 cap exactly.
//
// Per-tick work is unchanged: still 1,000-row batches 100ms apart, still
// capped at 50,000 per run. Only the frequency moves, which is
// DEC-20260504-B's self-throttling option rather than a pre-drain — the
// backlog clears over about three runs and then sits six-fold ahead of
// inflow. `retention-cleanup-backlog` (data-retention.ts) is what says so
// if that ever stops being true.
const RETENTION_INTERVAL_MS         = 24 * 60 * 60 * 1000;
const STALE_REFRESH_INTERVAL_MS     = 2 * 60 * 60 * 1000;    // 2h

// ─── State ──────────────────────────────────────────────────────────────────

let _isRunning = false;
let _started = false;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * WP10 (CR-08): auxiliary-task cadence is durable.
 *
 * This used to be `const _lastRun: Record<string, number> = {}` with the
 * comment "in-memory — reset on deploy is fine". It was not fine. Two of the
 * tasks below are declared WEEKLY, and `weekly-sweep` probes external URLs and
 * applies auto-remediation to test suites. Because the map reset on every
 * process start, and the median production process lifetime over the 17.6 days
 * to 2026-08-23 was about an hour, the weekly sweep ran **141 times in that
 * window — 56x its declared cadence.**
 *
 * The semantics are otherwise unchanged: the slot is consumed BEFORE the task
 * body runs (exactly as the old map was written before the body), and every
 * caller is already inside the scheduler's advisory lock.
 */
async function shouldRun(taskName: string, intervalMs: number): Promise<boolean> {
  try {
    return await consumeDueSlot(taskName, intervalMs);
  } catch (err) {
    // A due-check that cannot reach the database must not silently cancel the
    // task forever; fall back to running it. Over-running is the failure mode
    // this whole change exists to reduce, but never-running is worse.
    logError("test-scheduler-due-check-failed", err, { task: taskName });
    return true;
  }
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

interface OverdueSuite {
  slug: string;
  testType: string;
  suiteId: string;
  lastRunAt: Date | null;
}

/**
 * Hash-stagger modulo 60 — deterministic minute-of-hour offset.
 *
 * Single-arg form: `slugStaggerMinute(slug)` — historical behavior, hashes the
 * slug only. Retained for callers that still pick capabilities (vs. suites).
 *
 * Two-arg form: `slugStaggerMinute(slug, testType)` — hashes `slug:testType`,
 * which is the per-suite stagger used by the scheduler post-DEC-20260513-D
 * (per-suite spread). Each of a capability's 5 active suites lands on a
 * different minute, preventing the simultaneous-burst pattern that
 * saturated Zenedge for `slovak-company-data` at the :41 tick.
 *
 * The authoritative computation lives in SQL (Postgres `hashtext`); this
 * TypeScript implementation uses FNV-1a 32-bit for tests + documentation.
 * Stagger only needs to be deterministic per (slug[, testType]), not
 * cross-language identical.
 */
export function slugStaggerMinute(slug: string, testType?: string): number {
  const key = testType ? `${slug}:${testType}` : slug;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 60;
}

/**
 * Minimum re-test interval, in hours, for a suite given its
 * (test_status, test_mode). Mirrors the `GREATEST(...)` interval expression
 * inside `findOverdueSuites()`'s and `countOverdueCapabilities()`'s SQL —
 * this TypeScript copy exists for unit tests and documentation only; the SQL
 * in this file is the authoritative computation actually enforced against
 * production (same convention as `slugStaggerMinute`, above).
 *
 * Cost-reduction pass (2026-08-18, `ops/cut-browserless-harness-burn`):
 * schema.ts's `test_mode` column comment has documented three values since
 * the column was added — `'live'` (real API), `'fixture'` (saved data),
 * `'canary'` (periodic live check at reduced frequency) — but only
 * `'fixture'` ever had a code path. `runSingleTest` in test-runner.ts
 * special-cases `testMode === 'fixture'`; every other value, including
 * `'canary'`, fell through to the same "real execution" branch as `'live'`.
 * The scheduler's cadence, in turn, only read `test_status`. Net effect: a
 * suite set to `test_mode = 'canary'` was dispatched hourly and executed for
 * real every time — indistinguishable from `'live'`. This closes that gap
 * by giving `'canary'` its own cadence floor, independent of (and combined
 * via `GREATEST` with) the existing status-based backoff, so a capability
 * can keep exactly one suite genuinely live at a deliberately low frequency
 * instead of converting it to a zero-signal fixture replay.
 */
export function minRetestIntervalHours(
  testStatus: string | null,
  testMode: string | null,
  scheduleTier: string | null = "B",
  costClass: string | null = "free_unlimited",
): number {
  const statusHours: Record<string, number> = {
    upstream_broken: 24,
    infra_limited: 24,
    quarantined: 168,
  };
  const modeHours: Record<string, number> = {
    canary: 24,
  };
  const tierHours: Record<string, number> = {
    A: 6,
    B: 24,
    C: 72,
  };
  const quotaHours: Record<string, number> = {
    free_quota: 24,
    paid_with_free_tier: 72,
  };
  const finiteLive = testMode !== "fixture"
    && (costClass === "free_quota" || costClass === "paid_with_free_tier");
  return Math.max(
    finiteLive ? (tierHours[scheduleTier ?? ""] ?? 24) : 1,
    statusHours[testStatus ?? ""] ?? 0,
    modeHours[testMode ?? ""] ?? 0,
    finiteLive ? (quotaHours[costClass ?? ""] ?? 0) : 0,
  );
}

/**
 * Find suites (capability × test_type pairs) due for testing this minute.
 *
 * Per DEC-20260503-B + DEC-20260513-D (per-suite spread):
 *   - scheduled_testing_eligible = TRUE  (free/eligible; paid caps skipped)
 *   - per-suite last-run older than its 6h/24h/72h risk tier
 *   - abs(hashtext(slug || ':' || test_type)) % 60 = current minute
 *
 * Per-suite stagger replaces the prior per-capability stagger. The earlier
 * shape fired all 5 of a capability's suites on the same minute, which
 * burst-saturated Zenedge-fronted upstreams (`slovak-company-data` /
 * `api.statistics.sk` at the :41 tick). Spreading by (slug, test_type)
 * keeps any single upstream's egress to ≤1 req/minute under steady state.
 *
 * Per-suite debounce derives from MAX(test_results.executed_at) per
 * test_suite_id rather than capabilities.last_tested_at — the latter
 * advances on any suite execution and would block sibling suites that
 * haven't actually run for an hour.
 *
 * The status floor (upstream_broken, infra_limited, quarantined) still
 * applies — known-broken suites back off to daily/weekly. The "no status creates a black hole" invariant from the
 * old tiered query is preserved by the ELSE branch. `test_mode = 'canary'`
 * adds an independent daily floor on top (see `minRetestIntervalHours`).
 *
 * Each returned row carries its own `suiteId` (ts.id), not just
 * (slug, testType). pollCycle() passes that id straight through to
 * `runTests({..., suiteId})`, which scopes execution to exactly that one
 * test_suites row. Before this, two suites sharing (slug, testType) — e.g.
 * danish-company-data's 4 duplicate known_answer suites — produced 4
 * identical (slug, testType) rows here, and each of the 4 loop iterations
 * in pollCycle() called runTests({capabilitySlug, testType}) *without* a
 * suite id, which reloaded and re-ran ALL 4 suites every time: a batch of
 * N due suites did N x N executions, not N. See TestRunOptions.suiteId's
 * doc comment in test-runner.ts for the full incident.
 */
async function findOverdueSuites(): Promise<OverdueSuite[]> {
  const db = getDb();

  // Phase A0b: exclude capabilities whose per-window test budget is
  // already at cap (defense-in-depth against the assertBudgetAvailable
  // per-call dispatcher check). free_unlimited caps are never
  // budget-tracked, so the OR short-circuits for them.
  const rows = await db.execute(sql`
    SELECT
      c.slug,
      ts.id::text AS "suiteId",
      ts.test_type AS "testType",
      (SELECT MAX(tr.executed_at) FROM test_results tr WHERE tr.test_suite_id = ts.id) AS "lastRunAt"
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.scheduled_testing_eligible = TRUE
      AND ts.test_type <> 'piggyback'
      AND (abs(hashtext(c.slug || ':' || ts.test_type)) % 60) = EXTRACT(MINUTE FROM NOW())::int
      AND (
        (SELECT MAX(tr.executed_at) FROM test_results tr WHERE tr.test_suite_id = ts.id) IS NULL
        OR (SELECT MAX(tr.executed_at) FROM test_results tr WHERE tr.test_suite_id = ts.id)
           < NOW() - GREATEST(
          CASE
            WHEN ts.test_mode <> 'fixture'
              AND c.cost_class IN ('free_quota', 'paid_with_free_tier')
            THEN CASE ts.schedule_tier
              WHEN 'A' THEN INTERVAL '6 hours'
              WHEN 'B' THEN INTERVAL '24 hours'
              WHEN 'C' THEN INTERVAL '72 hours'
              ELSE INTERVAL '24 hours'
            END
            ELSE INTERVAL '1 hour'
          END,
          CASE ts.test_status
            WHEN 'upstream_broken' THEN INTERVAL '24 hours'
            WHEN 'infra_limited'   THEN INTERVAL '24 hours'
            WHEN 'quarantined'     THEN INTERVAL '168 hours'
            ELSE INTERVAL '0 hours'
          END,
          CASE ts.test_mode
            WHEN 'canary' THEN INTERVAL '24 hours'
            ELSE INTERVAL '0 hours'
          END,
          CASE WHEN ts.test_mode <> 'fixture' THEN
            CASE c.cost_class
              WHEN 'free_quota' THEN INTERVAL '24 hours'
              WHEN 'paid_with_free_tier' THEN INTERVAL '72 hours'
              ELSE INTERVAL '0 hours'
            END
          ELSE INTERVAL '0 hours'
          END
        )
      )
      AND (
        c.cost_class = 'free_unlimited'
        OR c.cost_class IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM capability_budget_counters b
          WHERE b.capability_slug = c.slug
            AND b.window_kind = c.quota_window
            AND b.window_start = (
              CASE c.quota_window
                WHEN 'daily'   THEN date_trunc('day', NOW())
                WHEN 'monthly' THEN CASE
                  WHEN NOW() >= date_trunc('month', NOW())
                    + (COALESCE(c.quota_reset_dom, 1) - 1) * INTERVAL '1 day'
                  THEN date_trunc('month', NOW())
                    + (COALESCE(c.quota_reset_dom, 1) - 1) * INTERVAL '1 day'
                  ELSE date_trunc('month', NOW()) - INTERVAL '1 month'
                    + (COALESCE(c.quota_reset_dom, 1) - 1) * INTERVAL '1 day'
                END
                ELSE NULL
              END
            )
            AND b.test_count >= b.budget_cap
        )
      )
    ORDER BY "lastRunAt" ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows.map((r: any) => ({
    slug: r.slug,
    testType: r.testType,
    suiteId: r.suiteId,
    lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null,
  }));
}

/**
 * Total count of free capabilities currently overdue (across the whole
 * hour, ignoring the per-minute stagger). Used for queue-depth
 * observability — if this number creeps up, hourly testing is falling
 * behind.
 *
 * MEDIUM-3 (Codex review, 2026-08-18): this used to derive "overdue" from
 * `capabilities.last_tested_at`, a capability-wide timestamp that ANY of
 * the capability's suites bumps on execution — including its frequently-
 * dispatched fixture siblings, which (post this migration) still get
 * dispatched on the normal ~1h cadence even though they cost nothing to
 * run. A capability whose canary suite (the one on the 24h `minRetestIntervalHours`
 * floor) hadn't actually run in 20+ hours would still read as "recently
 * tested" here because a sibling fixture suite ran an hour ago — hiding a
 * genuinely stuck/overdue canary from the queue-depth metric that exists
 * specifically to catch that. The fix: derive per-suite age the identical
 * way `findOverdueSuites()` does — `MAX(test_results.executed_at)` scoped
 * to that one `test_suite_id`, never the capability-wide column — and count
 * a capability as overdue if ANY of its suites is, by that same per-suite
 * measure.
 */
async function countOverdueCapabilities(): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(DISTINCT c.slug)::int AS count
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.scheduled_testing_eligible = TRUE
      AND ts.test_type <> 'piggyback'
      AND (
        (SELECT MAX(tr.executed_at) FROM test_results tr WHERE tr.test_suite_id = ts.id) IS NULL
        OR (SELECT MAX(tr.executed_at) FROM test_results tr WHERE tr.test_suite_id = ts.id)
           < NOW() - GREATEST(
          CASE
            WHEN ts.test_mode <> 'fixture'
              AND c.cost_class IN ('free_quota', 'paid_with_free_tier')
            THEN CASE ts.schedule_tier
              WHEN 'A' THEN INTERVAL '6 hours'
              WHEN 'B' THEN INTERVAL '24 hours'
              WHEN 'C' THEN INTERVAL '72 hours'
              ELSE INTERVAL '24 hours'
            END
            ELSE INTERVAL '1 hour'
          END,
          CASE ts.test_status
            WHEN 'upstream_broken' THEN INTERVAL '24 hours'
            WHEN 'infra_limited'   THEN INTERVAL '24 hours'
            WHEN 'quarantined'     THEN INTERVAL '168 hours'
            ELSE INTERVAL '0 hours'
          END,
          CASE ts.test_mode
            WHEN 'canary' THEN INTERVAL '24 hours'
            ELSE INTERVAL '0 hours'
          END,
          CASE WHEN ts.test_mode <> 'fixture' THEN
            CASE c.cost_class
              WHEN 'free_quota' THEN INTERVAL '24 hours'
              WHEN 'paid_with_free_tier' THEN INTERVAL '72 hours'
              ELSE INTERVAL '0 hours'
            END
          ELSE INTERVAL '0 hours'
          END
        )
      )
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows[0]?.count ?? 0;
}

/**
 * Total count of ineligible capabilities skipped by the scheduler. Used
 * for end-of-cycle observability so operators can see how many caps the
 * scheduler is consciously NOT testing per DEC-20260503-B (paid vendors,
 * LLM caps, anything explicitly flagged scheduled_testing_eligible = FALSE).
 */
async function countPaidSkipped(): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(DISTINCT c.slug)::int AS count
    FROM capabilities c
    INNER JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.active = true
    WHERE c.is_active = true
      AND ts.scheduled_testing_eligible = FALSE
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return resultRows[0]?.count ?? 0;
}

// ─── Delay helper ───────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Mid-batch budget re-check (Phase-4 tail fix, 2026-08-17) ───────────────
//
// findOverdueSuites()'s budget exclusion above is a snapshot taken once at
// the START of a poll cycle. When several of a capability's suites collide
// on the same minute's stagger (confirmed live for danish-company-data: 4
// duplicate `known_answer` test suites all hash `slug + ':known_answer'` to
// the identical minute), the batch can contain more of that capability's
// suites than its remaining budget covers — the snapshot said "budget
// available", but the scheduler's sequential loop spends it as it goes. The
// first couple of suites in the batch succeed and exhaust the counter;
// every suite after that in the SAME batch used to run straight into
// `assertBudgetAvailable`'s `BudgetExhaustedError`, writing a failed
// `test_results` row (confirmed live: danish-company-data logged 15
// budget-exhaustion failures out of 17 attempts in 24h).
//
// Exported so the skip decision — including its fail-open behavior — is
// unit-testable without the DB/advisory-lock machinery the rest of this
// module needs (test-harness exemption, DEC-20260504-A).
export async function shouldSkipForBudget(slug: string): Promise<boolean> {
  try {
    const { isBudgetExhausted } = await import("../capabilities/guarded-executor.js");
    return await isBudgetExhausted(slug);
  } catch (err) {
    // A peek failure must never block real testing — fail open, same
    // posture as the health-check peek a few lines up in pollCycle().
    logError("test-scheduler-budget-peek-failed", err, { capability_slug: slug });
    return false;
  }
}

/**
 * The heartbeat's "suites tested" figure, derived from executed results
 * only. Deliberately NOT batch arithmetic (`runnableSuites.length -
 * outerSkips`): the runner can also skip suites internally via its own
 * per-suite budget re-check, which the scheduler cannot observe, so any
 * batch-based subtraction misreports in both directions (closing review
 * round, 2026-08-17: 4-duplicate-suite batch with budget 2 → old formula
 * said 1 tested; 2 results actually existed). Exported for the regression
 * test that pins this shape.
 */
export function suitesTestedFromResults(totalPassed: number, totalFailed: number): number {
  return totalPassed + totalFailed;
}

// ─── Auxiliary tasks ────────────────────────────────────────────────────────

async function runAuxiliaryTasks(): Promise<void> {
  // Chromium health probe (30min)
  if (await shouldRun("chromium-probe", CHROMIUM_PROBE_INTERVAL_MS)) {
    try {
      await probeChromiumHealth();
    } catch (err) {
      logError("test-scheduler-chromium-probe-error", err);
    }
  }

  // Dependency health checks (6h)
  if (await shouldRun("health-check", HEALTH_CHECK_INTERVAL_MS)) {
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
  if (await shouldRun("meta-hourly", META_HOURLY_INTERVAL_MS)) {
    try {
      const { runHourlyChecks } = await import("../lib/meta-monitoring.js");
      await runHourlyChecks();
    } catch (err) {
      logError("test-scheduler-meta-hourly-failed", err);
    }
  }

  // Daily meta-monitoring (pipeline + free-tier checks).
  if (await shouldRun("meta-daily", META_DAILY_INTERVAL_MS)) {
    try {
      const { runDailyChecks } = await import("../lib/meta-monitoring.js");
      await runDailyChecks();
    } catch (err) {
      logError("test-scheduler-meta-daily-failed", err);
    }
  }

  // Staleness refresh retired with the SQS engine (DEC-20260503-B).
  // refresh-stale-scores.ts re-decayed matrix_sqs and is no longer present.

  // Daily diagnostics (24h)
  if (await shouldRun("diagnostics", DIAGNOSTIC_INTERVAL_MS)) {
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

  // Daily SQS snapshot retired with the SQS engine (DEC-20260503-B).

  // Weekly health sweep (7d)
  if (await shouldRun("weekly-sweep", WEEKLY_SWEEP_INTERVAL_MS)) {
    try {
      const { runWeeklyHealthSweep } = await import("../lib/health-sweep.js");
      await runWeeklyHealthSweep();
    } catch (err) {
      logError("test-scheduler-weekly-sweep-failed", err);
    }
  }

  // Weekly data retention cleanup (7d)
  if (await shouldRun("retention", RETENTION_INTERVAL_MS)) {
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
        findOverdueSuites(),
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
          "no free suites match this minute's stagger; nothing to test",
        );
        return;
      }

      // Check provider health — skip suites whose capability provider is unhealthy
      let runnableSuites: OverdueSuite[] = overdue;
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
          // Dedupe slugs across suites — a capability with 5 suites would
          // otherwise appear 5 times in skippedSlugs.
          skippedSlugs = [
            ...new Set(
              overdue
                .filter((s: OverdueSuite) => unhealthySlugs.has(s.slug))
                .map((s: OverdueSuite) => s.slug),
            ),
          ];
          runnableSuites = overdue.filter((s: OverdueSuite) => !unhealthySlugs.has(s.slug));
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

      if (runnableSuites.length === 0) {
        jobLog.info({ label: "test-scheduler-poll-all-unhealthy" }, "all overdue suites have unhealthy providers, skipping");
        return;
      }

      jobLog.info(
        {
          label: "test-scheduler-poll-start",
          runnable: runnableSuites.length,
          queue_depth: queueDepth,
          paid_skipped: paidSkipped,
          skipped_unhealthy: skippedUnhealthy,
          current_minute: new Date().getMinutes(),
        },
        "test-scheduler-poll-start",
      );

      let totalPassed = 0;
      let totalFailed = 0;
      let skippedBudgetExhausted = 0;
      const slugsTested = new Set<string>();

      for (const suite of runnableSuites) {
        const agoMs = suite.lastRunAt ? Date.now() - suite.lastRunAt.getTime() : null;
        const agoLabel = agoMs != null ? `${Math.round(agoMs / 60_000)}m ago` : "never tested";

        // Re-check budget per suite, immediately before the call that would
        // otherwise run-to-fail and write a budget-exhaustion test_results
        // row. See shouldSkipForBudget's doc comment for why the once-per-
        // cycle SQL exclusion in findOverdueSuites() isn't sufficient on
        // its own. No DB write here — assertBudgetAvailable inside
        // runTests() remains the sole place that reserves a slot, so this
        // can never let a call through the real check would refuse; it
        // only ever turns a guaranteed failure into a skip.
        if (await shouldSkipForBudget(suite.slug)) {
          skippedBudgetExhausted++;
          jobLog.info(
            {
              label: "test-scheduler-skip-budget-exhausted",
              capability_slug: suite.slug,
              test_type: suite.testType,
            },
            "test-scheduler-skip-budget-exhausted",
          );
          await delay(DELAY_BETWEEN_CAPABILITIES_MS);
          continue;
        }

        try {
          jobLog.info(
            {
              label: "test-scheduler-testing",
              capability_slug: suite.slug,
              test_type: suite.testType,
              last_run: agoLabel,
            },
            "test-scheduler-testing",
          );

          // suiteId scopes this call to exactly the one overdue suite this
          // batch entry represents — see findOverdueSuites' doc comment and
          // TestRunOptions.suiteId in test-runner.ts. Without it, N
          // same-(slug,testType) suites due in the same batch produced N x N
          // executions (danish-company-data: 4 duplicates -> 16/batch).
          const summary = await runTests({
            capabilitySlug: suite.slug,
            testType: suite.testType,
            suiteId: suite.suiteId,
          });
          totalPassed += summary.passed;
          totalFailed += summary.failed;
          slugsTested.add(suite.slug);

          // runTests() already calls persistDualProfileScores() internally,
          // so DB columns are updated immediately after each suite execution.

          jobLog.info(
            {
              label: "test-scheduler-tested",
              capability_slug: suite.slug,
              test_type: suite.testType,
              passed: summary.passed,
              total: summary.total,
            },
            "test-scheduler-tested",
          );

          // Auto-activate gated solutions when all steps become qualified.
          // Per-suite scheduling means this fires more often than under the
          // old per-capability scheduling, but the check is idempotent and
          // the SELECT-only path is cheap.
          try {
            await checkSolutionGates(suite.slug);
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
            {
              label: "test-scheduler-cap-threw",
              capability_slug: suite.slug,
              test_type: suite.testType,
              err: err instanceof Error ? { message: err.message } : err,
            },
            "test-scheduler-cap-threw",
          );
        }

        await delay(DELAY_BETWEEN_CAPABILITIES_MS);
      }

      // Phase-4 tail fix (2026-08-17 review, LOW-8; corrected in the closing
      // review round): "suites tested" must be DERIVED FROM EXECUTED RESULTS,
      // never from batch arithmetic. runnableSuites counts scheduler batch
      // entries; skippedBudgetExhausted counts only the batches skipped at
      // THIS level — but runTests() can also skip suites internally (the
      // per-suite budget re-check), so `batch - outerSkips` over-counts in
      // one direction and under-counts in the other (Codex's trace: 4
      // duplicate suites, budget 2 → formula said 1 tested/3 skipped;
      // reality was 2 executed, 2 internally skipped). totalPassed +
      // totalFailed is the count of results that actually exist.
      const suitesActuallyTested = suitesTestedFromResults(totalPassed, totalFailed);

      jobLog.info(
        {
          label: "test-scheduler-poll-complete",
          suites_tested: suitesActuallyTested,
          capabilities_touched: slugsTested.size,
          passed: totalPassed,
          failed: totalFailed,
          skipped_unhealthy: skippedUnhealthy,
          skipped_budget_exhausted: skippedBudgetExhausted,
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
            actionTaken: `DB-driven poll: ${suitesActuallyTested} suites tested across ${slugsTested.size} capabilities` +
              (skippedBudgetExhausted > 0 ? ` (${skippedBudgetExhausted} skipped, budget exhausted)` : ""),
            details: {
              suites_tested: suitesActuallyTested,
              capabilities_touched: slugsTested.size,
              passed: totalPassed,
              failed: totalFailed,
              skipped_unhealthy: skippedUnhealthy,
              skipped_budget_exhausted: skippedBudgetExhausted,
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

  // Stale score repair retired with the SQS engine (DEC-20260503-B).

  // Weekly digest scheduling lived in the deleted block of test-runner.ts.
  // The digest itself still works via the daily-digest pipeline; this
  // explicit Monday-08:00 timer is gone until re-introduced.

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
