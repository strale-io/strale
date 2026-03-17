/**
 * Lifecycle state machine for capabilities.
 *
 * States: draft → validating → probation → active ⇄ degraded → suspended
 *
 * Auto-evaluated transitions:
 *   probation → active:    30+ days on probation AND SQS ≥ 60
 *   active → degraded:     SQS < 40 OR circuit breaker active
 *   degraded → active:     SQS ≥ 60 AND has been degraded ≥ 48h
 *   degraded → suspended:  SQS < 20 for 7+ days (still degraded after 7d with low score)
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
import { computeCapabilitySQS } from "./sqs.js";

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

const PROBATION_DAYS = 30;           // min days on probation before active
const ACTIVE_SQS_MIN = 60;           // SQS required to promote to active
const DEGRADE_SQS_THRESHOLD = 40;    // SQS below which active → degraded
const SUSPEND_SQS_THRESHOLD = 20;    // SQS below which degraded → suspended
const DEGRADED_RECOVERY_HOURS = 48;  // min hours degraded before active recovery
const DEGRADED_SUSPEND_DAYS = 7;     // days degraded with low SQS → suspended

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

  await db.insert(healthMonitorEvents).values({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: 1,
    actionTaken: `${fromState} → ${toState}: ${reason}`,
    details: {
      from: fromState,
      to: toState,
      reason,
      triggered_by: triggeredBy,
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

  const sqs = await computeCapabilitySQS(slug);
  const now = Date.now();

  // ── probation → active ────────────────────────────────────────────────────
  if (state === "probation") {
    if (sqs.score >= ACTIVE_SQS_MIN) {
      const probationSince = await getStateEnteredAt(slug, "probation");
      if (probationSince !== null) {
        const daysOnProbation = (now - probationSince) / (1000 * 60 * 60 * 24);
        if (daysOnProbation >= PROBATION_DAYS) {
          const reason = `${Math.floor(daysOnProbation)}d on probation, SQS ${sqs.score.toFixed(1)} ≥ ${ACTIVE_SQS_MIN}`;
          await transitionCapability(slug, "active", reason, "auto");
          return { slug, from: "probation", to: "active", reason };
        }
      }
    }
    return null;
  }

  // ── active → degraded ─────────────────────────────────────────────────────
  if (state === "active") {
    if (sqs.score < DEGRADE_SQS_THRESHOLD || sqs.circuit_breaker) {
      const reason = sqs.circuit_breaker
        ? `Circuit breaker active (SQS ${sqs.score.toFixed(1)})`
        : `SQS ${sqs.score.toFixed(1)} < ${DEGRADE_SQS_THRESHOLD}`;
      await transitionCapability(slug, "degraded", reason, "auto");
      return { slug, from: "active", to: "degraded", reason };
    }
    return null;
  }

  // ── degraded → active | suspended ─────────────────────────────────────────
  if (state === "degraded") {
    const degradedSince = await getStateEnteredAt(slug, "degraded");
    const degradedMs = degradedSince !== null ? now - degradedSince : 0;
    const degradedHours = degradedMs / (1000 * 60 * 60);
    const degradedDays = degradedMs / (1000 * 60 * 60 * 24);

    // Recovery path: SQS ≥ 60 AND has been degraded ≥ 48h
    if (sqs.score >= ACTIVE_SQS_MIN && degradedHours >= DEGRADED_RECOVERY_HOURS) {
      const reason = `SQS recovered to ${sqs.score.toFixed(1)} after ${Math.floor(degradedHours)}h degraded`;
      await transitionCapability(slug, "active", reason, "auto");
      return { slug, from: "degraded", to: "active", reason };
    }

    // Suspend path: SQS still below 20 after 7 days
    if (sqs.score < SUSPEND_SQS_THRESHOLD && degradedDays >= DEGRADED_SUSPEND_DAYS) {
      const reason = `SQS ${sqs.score.toFixed(1)} < ${SUSPEND_SQS_THRESHOLD} for ${Math.floor(degradedDays)}d`;
      await transitionCapability(slug, "suspended", reason, "auto");
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
