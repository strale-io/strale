/**
 * WP10 (CR-08) — the onboarding retry sweeper.
 *
 * `capability-persistence.ts` has, since the DEC-20260421-B correction, moved
 * `onCapabilityCreated` outside the write transaction and marked the row
 * `lifecycle_state = 'hook_failed'` when the hook throws. Three separate
 * comments in that file promise the follow-up:
 *
 *     "Phase 6 retry scheduler will surface and re-run."
 *     "The Phase 6 retry scheduler sweeps hook_failed + any row whose
 *      post-commit state looks incomplete."
 *
 * It was never built. A grep for `hook_failed` across `src/` returns the
 * writer and its own test file and nothing else — no reader anywhere. The
 * marker was write-only for the life of the feature.
 *
 * ## Why it matters
 *
 * The hook is what generates a capability's test suites. A capability whose
 * hook failed therefore has **no test suites at all**, so the scheduler never
 * selects it and no quality signal is ever produced for it. It is not merely
 * flagged — it is invisible to the entire testing substrate, permanently, with
 * nothing in the system trying to fix that.
 *
 * ## Current production state
 *
 * Zero rows are in `hook_failed` as of 2026-08-23 (304 active, 20 deactivated,
 * 8 degraded, 7 validating, 1 probation). This sweeper therefore closes a
 * latent gap rather than draining a backlog — stated plainly because
 * DEC-20260504-B requires the accumulated-workload question to be answered
 * before a bulk operation ships, and here the answer is "none". The per-tick
 * cap below is nonetheless real, so a future backlog drains gradually rather
 * than in one burst.
 *
 * ## Bounded retry, counted somewhere that survives
 *
 * `capabilities.onboarding_hook_failures` holds the attempt count. After
 * MAX_ATTEMPTS the sweeper emits one escalation event and the candidate query
 * excludes the row from then on, so a capability whose hook fails
 * deterministically (a bad manifest, say) does not retry forever — it becomes
 * a human decision, which is the honest outcome for a failure the platform
 * cannot fix by repeating it.
 *
 * The counter deliberately does NOT live in `health_monitor_events`. The first
 * version of this file counted attempts by querying that table, which
 * jobs/db-retention.ts prunes at 30 days: the budget would have silently reset
 * every month, and the escalation marker would have aged out with it, so an
 * already-escalated capability would rejoin the retry set forever in 30-day
 * cycles and re-escalate each time. A pruned telemetry table is not state.
 * The column mirrors `test_suites.fixture_recapture_failures`, which exists
 * for exactly this reason.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { healthMonitorEvents } from "../db/schema.js";
import { onCapabilityCreated } from "../lib/capability-onboarding.js";
import { registerJobSync } from "../lib/job-coordinator.js";
import { withDeadline } from "../lib/with-deadline.js";
import { log, logError, logWarn } from "../lib/log.js";

const INTERVAL_MS = 60 * 60 * 1000; // hourly
const STARTUP_DELAY_MS = 8 * 60 * 1000;

/** Self-throttle per DEC-20260504-B: a backlog drains over ticks, not at once. */
const MAX_PER_TICK = 10;

/** Attempts before the slug becomes a human decision. */
export const MAX_ATTEMPTS = 5;

/**
 * Ceiling on one slug's hook re-run.
 *
 * `onCapabilityCreated` executes the capability live and can fire paid upstream
 * APIs, and it carries no timeout of its own. Ten slugs behind one unbounded
 * call is the shape that would push this job past the coordinator's 15-minute
 * handler ceiling — at which point the cycle abandons a HEALTHY run and its
 * lease strands until expiry. Bounding each slug keeps the whole tick under ten
 * minutes in the worst case, and a hook that hangs is what it looks like: a
 * failed attempt, charged to that slug's budget, not a stalled job.
 */
const PER_SLUG_TIMEOUT_MS = 60_000;

export const RETRY_EVENT = "onboarding_retry";
export const ESCALATION_ACTION = "retries_exhausted";

export interface SweepOutcome {
  examined: number;
  recovered: string[];
  stillFailing: string[];
  escalated: string[];
}

/**
 * One sweep. Exported for tests and for a manual operator invocation.
 */
export async function runOnboardingRetryOnce(): Promise<SweepOutcome> {
  const db = getDb();
  const outcome: SweepOutcome = {
    examined: 0,
    recovered: [],
    stillFailing: [],
    escalated: [],
  };

  // Candidates: hook_failed, with budget left. The budget predicate is what
  // stops a deterministically-broken capability being retried forever, and it
  // reads a column rather than an event so it cannot be undone by retention.
  const rows = await db.execute(sql`
    SELECT c.slug
      FROM capabilities c
     WHERE c.lifecycle_state = 'hook_failed'
       AND c.onboarding_hook_failures < ${MAX_ATTEMPTS}
     ORDER BY c.updated_at ASC
     LIMIT ${MAX_PER_TICK}
  `);

  const slugs = (rows as unknown as Array<{ slug: string }>).map((r) => r.slug);
  outcome.examined = slugs.length;
  if (slugs.length === 0) return outcome;

  for (const slug of slugs) {
    try {
      await withDeadline(
        `onboarding hook for "${slug}"`,
        PER_SLUG_TIMEOUT_MS,
        Promise.resolve(onCapabilityCreated(slug)),
      );

      // The hook is idempotent and generates the missing test suites. On
      // success the row returns to 'draft' — the schema default, and the
      // correct conservative destination: a capability that just completed
      // onboarding has not earned a place on the served catalog, and
      // promotion is capability-promotion's decision, not this sweeper's.
      await db.execute(sql`
        UPDATE capabilities
           SET lifecycle_state = 'draft',
               onboarding_hook_failures = 0,
               updated_at = now()
         WHERE slug = ${slug} AND lifecycle_state = 'hook_failed'
      `);

      await db.insert(healthMonitorEvents).values({
        eventType: RETRY_EVENT,
        capabilitySlug: slug,
        tier: 2,
        actionTaken: "recovered",
        details: { restored_lifecycle_state: "draft" },
      });

      outcome.recovered.push(slug);
      logWarn("onboarding-retry-recovered", "hook re-ran successfully; capability left in draft", {
        slug,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Increment and read back in one statement, so two runners cannot both
      // read the same prior count and each conclude they were the fourth.
      // The lifecycle guard mirrors the success path: if the row left
      // 'hook_failed' between the SELECT and here — an operator fixing it by
      // hand, a concurrent onboarding — the attempt belongs to a state that no
      // longer exists and must not be charged against a now-healthy row.
      const attemptRows = await db.execute(sql`
        UPDATE capabilities
           SET onboarding_hook_failures = onboarding_hook_failures + 1,
               updated_at = now()
         WHERE slug = ${slug} AND lifecycle_state = 'hook_failed'
        RETURNING onboarding_hook_failures AS attempts
      `);
      const attempts = Number(
        (attemptRows as unknown as Array<{ attempts: number }>)[0]?.attempts ?? 1,
      );

      await db.insert(healthMonitorEvents).values({
        eventType: RETRY_EVENT,
        capabilitySlug: slug,
        tier: 2,
        actionTaken: "retry_failed",
        details: { attempt: attempts, error: message.slice(0, 500) },
      });

      if (attempts >= MAX_ATTEMPTS) {
        await db.insert(healthMonitorEvents).values({
          eventType: RETRY_EVENT,
          capabilitySlug: slug,
          tier: 1,
          actionTaken: ESCALATION_ACTION,
          details: {
            attempts,
            last_error: message.slice(0, 500),
            consequence:
              "capability has no generated test suites and will not be scheduled for testing",
          },
        });
        outcome.escalated.push(slug);
        logError(
          "onboarding-retry-exhausted",
          new Error(`onboarding hook failed ${attempts}x for ${slug}: ${message}`),
          { slug, attempts },
        );
      } else {
        outcome.stillFailing.push(slug);
        logWarn("onboarding-retry-failed", "hook still failing; will retry", {
          slug,
          attempt: attempts,
          error: message,
        });
      }
    }
  }

  log.info(
    {
      label: "onboarding-retry-tick",
      examined: outcome.examined,
      recovered: outcome.recovered.length,
      still_failing: outcome.stillFailing.length,
      escalated: outcome.escalated.length,
    },
    "onboarding-retry-tick",
  );

  return outcome;
}

export function startOnboardingRetry(): void {
  registerJobSync({
    name: "onboarding-retry",
    intervalMs: INTERVAL_MS,
    startupDelayMs: STARTUP_DELAY_MS,
    handler: runOnboardingRetryOnce,
  });
  log.info(
    {
      label: "onboarding-retry-scheduled",
      interval_ms: INTERVAL_MS,
      max_per_tick: MAX_PER_TICK,
      max_attempts: MAX_ATTEMPTS,
    },
    "onboarding-retry-scheduled",
  );
}
