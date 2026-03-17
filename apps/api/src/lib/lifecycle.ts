/**
 * Lifecycle state machine for capabilities.
 *
 * States: draft → validating → probation → active ⇄ degraded → suspended
 *
 * Auto-evaluated transitions:
 *   probation → active:    SQS ≥ 50 AND qualified (≥5 runs, all 5 factors have data)
 *   active → degraded:     SQS < 25 OR circuit breaker active
 *   degraded → active:     SQS ≥ 50 AND circuit breaker not active
 *   degraded → suspended:  7 consecutive days in degraded state (regardless of SQS)
 *
 * Manual-only transitions (via lifecycle-transition.ts --to):
 *   any → suspended, suspended → draft
 *
 * Transitions driven by validate-capability.ts:
 *   validating → probation: all 15 checks pass
 *   validating → draft:     any check fails
 */

import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { computeDualProfileSQS } from "./sqs.js";
import { logHealthEvent } from "./health-monitor.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LifecycleState =
  | "draft"
  | "validating"
  | "probation"
  | "active"
  | "degraded"
  | "suspended";

export type TransitionTrigger = "auto" | "admin" | "validation";

export interface TransitionResult {
  slug: string;
  from: LifecycleState;
  to: LifecycleState;
  reason: string;
}

// ─── Thresholds ──────────────────────────────────────────────────────────────

const ACTIVE_SQS_MIN = 50;           // SQS required to promote probation → active OR recover degraded → active
const DEGRADE_SQS_THRESHOLD = 25;    // SQS below which active → degraded (platform floor per SQS Constitution)
const DEGRADED_SUSPEND_DAYS = 7;     // consecutive days in degraded → suspended (regardless of SQS)

// Tier for health monitor events per transition
function transitionTier(to: LifecycleState): 1 | 2 | 3 {
  if (to === "degraded" || to === "suspended") return 2;
  return 1;
}

// ─── Core: write a transition ─────────────────────────────────────────────────

/**
 * Apply a lifecycle state transition: update the capability row and log an event.
 * Does NOT validate whether the transition is allowed — callers are responsible.
 */
export async function transitionCapability(
  slug: string,
  toState: LifecycleState,
  reason: string,
  triggeredBy: TransitionTrigger = "auto",
  sqsScore?: number,
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

  await db
    .update(capabilities)
    .set({ lifecycleState: toState, updatedAt: new Date() })
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
      ...(sqsScore !== undefined ? { sqs_score: sqsScore } : {}),
    },
  });

  console.log(`[lifecycle] ${slug}: ${fromState} → ${toState} (${triggeredBy}: ${reason})`);
}

// ─── Evaluate auto-transitions for a single capability ──────────────────────

/**
 * Check whether a capability's current state should auto-transition.
 * Returns the transition result if one was applied, or null if no change.
 */
export async function evaluateLifecycle(
  slug: string,
): Promise<TransitionResult | null> {
  const db = getDb();

  const [cap] = await db
    .select({ lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) return null;

  const state = cap.lifecycleState as LifecycleState;

  // Only auto-evaluate states with auto-transitions
  if (!["probation", "active", "degraded"].includes(state)) return null;

  const dual = await computeDualProfileSQS(slug);
  const now = Date.now();

  // ── probation → active ────────────────────────────────────────────────────
  // Requires: SQS ≥ 50 AND qualified (not pending = has ≥5 runs + all factors)
  if (state === "probation") {
    if (!dual.matrix.pending && dual.score >= ACTIVE_SQS_MIN) {
      const reason = `SQS ${dual.score.toFixed(1)} ≥ ${ACTIVE_SQS_MIN}, ${dual.qp.runs_analyzed} runs, all factors qualified`;
      await transitionCapability(slug, "active", reason, "auto", dual.score);
      return { slug, from: "probation", to: "active", reason };
    }
    return null;
  }

  // ── active → degraded ─────────────────────────────────────────────────────
  if (state === "active") {
    if (dual.score < DEGRADE_SQS_THRESHOLD || dual.rp.circuit_breaker) {
      const reason = dual.rp.circuit_breaker
        ? `Circuit breaker active (SQS ${dual.score.toFixed(1)})`
        : `SQS ${dual.score.toFixed(1)} < ${DEGRADE_SQS_THRESHOLD}`;
      await transitionCapability(slug, "degraded", reason, "auto", dual.score);
      return { slug, from: "active", to: "degraded", reason };
    }
    return null;
  }

  // ── degraded → active | suspended ─────────────────────────────────────────
  if (state === "degraded") {
    const degradedSince = await getStateEnteredAt(slug, "degraded");
    const degradedMs = degradedSince !== null ? now - degradedSince : 0;
    const degradedDays = degradedMs / (1000 * 60 * 60 * 24);

    // Recovery path: SQS ≥ 50 and circuit breaker not active
    if (dual.score >= ACTIVE_SQS_MIN && !dual.rp.circuit_breaker) {
      const reason = `SQS recovered to ${dual.score.toFixed(1)}, circuit breaker clear`;
      await transitionCapability(slug, "active", reason, "auto", dual.score);
      return { slug, from: "degraded", to: "active", reason };
    }

    // 24h suspension warning at day 6 (one day before auto-suspend)
    if (degradedDays >= DEGRADED_SUSPEND_DAYS - 1 && degradedDays < DEGRADED_SUSPEND_DAYS) {
      const autoSuspendAt = new Date(
        (degradedSince ?? now) + DEGRADED_SUSPEND_DAYS * 24 * 3600_000,
      );
      import("./interrupt-sender.js").then(({ sendInterruptEmail }) =>
        sendInterruptEmail({
          type: "suspension_warning",
          capabilitySlug: slug,
          details: {
            sqs_score: dual.score.toFixed(1),
            degraded_days: degradedDays.toFixed(1),
            reason: dual.rp.circuit_breaker
              ? `Circuit breaker active (SQS ${dual.score.toFixed(1)})`
              : `SQS ${dual.score.toFixed(1)} below platform floor`,
            auto_suspend_at: autoSuspendAt.toISOString(),
          },
        })
      ).catch((err) => {
        console.error(`[interrupt] Suspension warning failed for ${slug}:`, err instanceof Error ? err.message : err);
      });
    }

    // Suspend path: 7 consecutive days in degraded (regardless of SQS)
    if (degradedDays >= DEGRADED_SUSPEND_DAYS) {
      const reason = `${Math.floor(degradedDays)}d in degraded state — auto-suspended`;
      await transitionCapability(slug, "suspended", reason, "auto", dual.score);
      return { slug, from: "degraded", to: "suspended", reason };
    }

    return null;
  }

  return null;
}

// ─── Bulk lifecycle sweep ────────────────────────────────────────────────────

/**
 * Evaluate auto-transitions for all probation/active/degraded capabilities.
 * Called from the weekly health sweep.
 */
export async function runLifecycleSweep(): Promise<TransitionResult[]> {
  const db = getDb();

  const caps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        inArray(capabilities.lifecycleState, ["probation", "active", "degraded"]),
      ),
    );

  const transitions: TransitionResult[] = [];

  for (const cap of caps) {
    try {
      const result = await evaluateLifecycle(cap.slug);
      if (result) {
        transitions.push(result);
      }
    } catch (err) {
      console.warn(`[lifecycle] Sweep failed for ${cap.slug}:`, err);
    }
  }

  if (transitions.length > 0) {
    console.log(`[lifecycle] Sweep complete: ${transitions.length} transition(s)`);
  }

  return transitions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find the timestamp when a capability last entered the given state,
 * by looking for the most recent lifecycle_transition event with that target state.
 * Returns null if no such event exists (capability was seeded in that state).
 */
async function getStateEnteredAt(
  slug: string,
  state: LifecycleState,
): Promise<number | null> {
  const db = getDb();

  // Drizzle doesn't support JSON field filtering cleanly; fetch recent events
  // and filter in-memory (max 20, very fast).
  const events = await db
    .select({ createdAt: healthMonitorEvents.createdAt, details: healthMonitorEvents.details })
    .from(healthMonitorEvents)
    .where(
      and(
        eq(healthMonitorEvents.capabilitySlug, slug),
        eq(healthMonitorEvents.eventType, "lifecycle_transition"),
      ),
    )
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(20);

  for (const ev of events) {
    const d = ev.details as { to?: string } | null;
    if (d?.to === state) {
      return new Date(ev.createdAt).getTime();
    }
  }

  return null;
}
