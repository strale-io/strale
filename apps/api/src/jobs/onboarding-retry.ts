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
 * ## Bounded retry without a schema change
 *
 * Attempts are counted from `health_monitor_events` rather than a new column.
 * After MAX_ATTEMPTS the sweeper emits one escalation event and thereafter
 * skips the slug, so a capability whose hook fails deterministically (a bad
 * manifest, say) does not retry forever — it becomes a human decision, which
 * is the honest outcome for a failure the platform cannot fix by repeating it.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { healthMonitorEvents } from "../db/schema.js";
import { onCapabilityCreated } from "../lib/capability-onboarding.js";
import { registerJobSync } from "../lib/job-coordinator.js";
import { log, logError, logWarn } from "../lib/log.js";

const INTERVAL_MS = 60 * 60 * 1000; // hourly
const STARTUP_DELAY_MS = 8 * 60 * 1000;

/** Self-throttle per DEC-20260504-B: a backlog drains over ticks, not at once. */
const MAX_PER_TICK = 10;

/** Attempts before the slug becomes a human decision. */
export const MAX_ATTEMPTS = 5;

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

  // Candidates: hook_failed, and not already escalated. The NOT EXISTS is what
  // stops a deterministically-broken capability from being retried forever.
  const rows = await db.execute(sql`
    SELECT c.slug
      FROM capabilities c
     WHERE c.lifecycle_state = 'hook_failed'
       AND NOT EXISTS (
         SELECT 1 FROM health_monitor_events e
          WHERE e.event_type = ${RETRY_EVENT}
            AND e.capability_slug = c.slug
            AND e.action_taken = ${ESCALATION_ACTION}
       )
     ORDER BY c.updated_at ASC
     LIMIT ${MAX_PER_TICK}
  `);

  const slugs = (rows as unknown as Array<{ slug: string }>).map((r) => r.slug);
  outcome.examined = slugs.length;
  if (slugs.length === 0) return outcome;

  for (const slug of slugs) {
    try {
      await onCapabilityCreated(slug);

      // The hook is idempotent and generates the missing test suites. On
      // success the row returns to 'draft' — the schema default, and the
      // correct conservative destination: a capability that just completed
      // onboarding has not earned a place on the served catalog, and
      // promotion is capability-promotion's decision, not this sweeper's.
      await db.execute(sql`
        UPDATE capabilities
           SET lifecycle_state = 'draft', updated_at = now()
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

      const attemptRows = await db.execute(sql`
        SELECT count(*)::int AS n
          FROM health_monitor_events
         WHERE event_type = ${RETRY_EVENT}
           AND capability_slug = ${slug}
           AND action_taken = 'retry_failed'
      `);
      const priorAttempts = Number(
        (attemptRows as unknown as Array<{ n: number }>)[0]?.n ?? 0,
      );
      const attempts = priorAttempts + 1;

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
