/**
 * Lifecycle state machine for capabilities.
 *
 * States: draft → validating → probation → active → degraded → suspended → deactivated
 *
 * Per DEC-20260503-B (SQS deletion), automatic transitions are removed.
 * Lifecycle state now only changes via:
 *   - validate-capability.ts            (validating → probation, validating → draft)
 *   - admin scripts (lifecycle-transition.ts, batch-transition-to-probation.ts,
 *     fix-lifecycle-anomalies.ts) which call `transitionCapability` directly
 *   - the executor onboarding pipeline (draft → validating after suite seeding)
 *
 * No background sweep evaluates SQS thresholds. Capabilities sit in whatever
 * state they're put in until a human flips them.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites, healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "./health-monitor.js";
import { log } from "./log.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LifecycleState =
  | "draft"
  | "validating"
  | "probation"
  | "active"
  | "degraded"
  | "suspended"
  | "deactivated";

export type TransitionTrigger = "auto" | "admin" | "validation";

export interface TransitionResult {
  slug: string;
  from: LifecycleState;
  to: LifecycleState;
  reason: string;
}

// ─── State visibility map ─────────────────────────────────────────────────────

/**
 * Whether a capability in a given state is visible to external API consumers.
 * active/degraded → visible (degraded serves but is flagged for human review);
 * all other states → hidden (not discoverable via /v1/capabilities).
 */
const STATE_VISIBILITY: Record<LifecycleState, boolean> = {
  draft: false,
  validating: false,
  probation: false,
  active: true,
  degraded: true,
  suspended: false,
  deactivated: false,
};

// Tier for health monitor events per transition
function transitionTier(to: LifecycleState): 1 | 2 | 3 {
  if (to === "degraded" || to === "suspended") return 2;
  return 1;
}

// ─── Core: write a transition ─────────────────────────────────────────────────

/**
 * Apply a lifecycle state transition: update the capability row and log an event.
 * Does NOT validate whether the transition is allowed — callers are responsible.
 *
 * Note: `healthMonitorEvents` is intentionally referenced in the import block
 * so downstream `getStateEnteredAt`-style helpers can be re-introduced when a
 * source-health-aware lifecycle policy lands.
 */
export async function transitionCapability(
  slug: string,
  toState: LifecycleState,
  reason: string,
  triggeredBy: TransitionTrigger = "admin",
): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select({ lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) throw new Error(`Capability '${slug}' not found`);

  const fromState = cap.lifecycleState as LifecycleState;
  if (fromState === toState) return; // no-op

  // Probation guard: must have at least 1 active test suite to enter probation
  if (toState === "probation") {
    const [suiteCount] = await db
      .select({ count: testSuites.id })
      .from(testSuites)
      .where(and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)))
      .limit(1);
    if (!suiteCount) {
      throw new Error(`Cannot transition '${slug}' to probation: no active test suites. Run the onboarding pipeline first.`);
    }
  }

  await db
    .update(capabilities)
    .set({
      lifecycleState: toState,
      visible: STATE_VISIBILITY[toState],
      degradedRecoveryCount: 0, // reset on any transition
      updatedAt: new Date(),
    })
    .where(eq(capabilities.slug, slug));

  await logHealthEvent({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: transitionTier(toState),
    actionTaken: `${fromState} → ${toState}: ${reason}`,
    details: {
      from: fromState,
      to: toState,
      reason,
      triggered_by: triggeredBy,
    },
  });

  log.info(
    {
      label: "lifecycle-transition",
      capability_slug: slug,
      from_state: fromState,
      to_state: toState,
      triggered_by: triggeredBy,
      reason,
    },
    "lifecycle-transition",
  );
}

// `evaluateLifecycle` and `runLifecycleSweep` were removed with the SQS
// engine (DEC-20260503-B). All automatic transitions that keyed on SQS
// thresholds (probation→active, active→degraded, degraded→active,
// degraded→suspended, suspended→deactivated) are gone. Manual flips
// remain via `transitionCapability`. A future per-product routing engine
// may reintroduce automatic transitions keyed on `source_health.status`
// once that substrate exists.

// Suppress unused import warning — `healthMonitorEvents` is part of the
// schema surface this file touches; re-introducing automatic transitions
// will need it for the state-entry timestamp lookup.
void healthMonitorEvents;
