/**
 * Intelligent Alerting — assessed, contextualized notifications.
 *
 * Replaces the old pattern of "probe failed → send email" with
 * "probe failed → assess situation → maybe send email."
 *
 * Key features:
 * - Pending alert buffer: first probe failure is buffered, not alerted
 * - Confirmation required: alert only after 2nd consecutive failure
 * - Exception: immediate alert if customer traffic is failing
 * - Recovery notifications: sent when a confirmed outage resolves
 * - Rich email format with root cause, impact, and action guidance
 * - External (third-party) dependencies are not emailed per event: their
 *   outages go to the daily summary in external-outage-digest.ts, unless one
 *   is failing paying customers' calls (see handleExternalProbeResult)
 */

import { sql } from "drizzle-orm";
import type { SituationAssessment, DependencyMeta } from "./situation-assessment.js";
import { DEPENDENCY_CONTEXT } from "./situation-assessment.js";
import { logHealthEvent } from "./health-monitor.js";
import { getProvider } from "./dependency-manifest.js";
import { isExternalDependency, dependencyDisplayName, formatDuration } from "./external-outage-digest.js";
import { internalAccountEmailExclusionSql } from "./internal-accounts.js";
import { log, logError, logWarn } from "./log.js";

// ─── Pending alert buffer ───────────────────────────────────────────────────

interface PendingAlert {
  assessment: SituationAssessment;
  firstSeenAt: Date;
  probeCount: number;
  alerted: boolean; // True once an alert email has been sent
  /** External only: the "reported in the daily summary" event was logged. */
  digestLogged?: boolean;
  /** External only: when paid-call failures were last counted. */
  lastEscalationCheckAt?: number;
}

const pendingAlerts = new Map<string, PendingAlert>();

// ─── Flap dampening: per-provider cooldown ───────────────────────────────────
// After sending an alert (outage or recovery), suppress further alerts for this
// provider for COOLDOWN_MS. Prevents Resend quota burn on flapping providers.
const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes
const alertCooldowns = new Map<string, { sentAt: number; lastState: "healthy" | "unhealthy" }>();

function isInCooldown(key: string, newState: "healthy" | "unhealthy"): boolean {
  const cooldown = alertCooldowns.get(key);
  if (!cooldown) return false;
  const elapsed = Date.now() - cooldown.sentAt;
  if (elapsed >= COOLDOWN_MS) return false; // Cooldown expired
  if (cooldown.lastState === newState) return true; // Same state, suppress
  // Different state but within cooldown — still suppress
  const minutesAgo = Math.round(elapsed / 60_000);
  log.info(
    {
      label: "situation-alert-suppressed",
      alert_key: key,
      minutes_ago: minutesAgo,
      prev_state: cooldown.lastState,
      new_state: newState,
    },
    "situation-alert-suppressed",
  );
  return true;
}

function recordCooldown(key: string, state: "healthy" | "unhealthy"): void {
  alertCooldowns.set(key, { sentAt: Date.now(), lastState: state });
}

/** Get pending alert for a key (for testing/debugging). */
export function getPendingAlert(key: string): PendingAlert | undefined {
  return pendingAlerts.get(key);
}

/** Get all pending alerts (for situations endpoint). */
export function getAllPendingAlerts(): Record<string, { firstSeenAt: string; probeCount: number; alerted: boolean }> {
  const result: Record<string, { firstSeenAt: string; probeCount: number; alerted: boolean }> = {};
  for (const [key, pending] of pendingAlerts) {
    result[key] = {
      firstSeenAt: pending.firstSeenAt.toISOString(),
      probeCount: pending.probeCount,
      alerted: pending.alerted,
    };
  }
  return result;
}

// ─── Alert evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate whether to alert based on a situation assessment.
 * Implements the confirmation pattern:
 * - First failure → buffer (don't alert)
 * - Second failure → alert (confirmed)
 * - Customer impact → alert immediately
 */
export async function evaluateAndAlert(assessment: SituationAssessment): Promise<{
  alertSent: boolean;
  alertSuppressed: boolean;
  suppressionReason: string | null;
}> {
  // Always log the assessment
  await logSituationAssessment(assessment, false, false, null);

  // Severity-based routing
  if (assessment.impact.severity === "info" && assessment.action.selfResolving) {
    return { alertSent: false, alertSuppressed: true, suppressionReason: "Info severity, self-resolving" };
  }

  // Customer traffic failing → immediate alert (skip buffer)
  if (assessment.impact.customersAffected) {
    await sendAssessmentEmail(assessment);
    await logSituationAssessment(assessment, true, false, null);
    return { alertSent: true, alertSuppressed: false, suppressionReason: null };
  }

  // Scheduler stale is always critical — skip buffer
  if (assessment.trigger === "scheduler_stale") {
    await sendAssessmentEmail(assessment);
    await logSituationAssessment(assessment, true, false, null);
    return { alertSent: true, alertSuppressed: false, suppressionReason: null };
  }

  // Mass test failure — alert if severity >= warning
  if (assessment.trigger === "mass_test_failure" && assessment.impact.severity !== "info") {
    await sendAssessmentEmail(assessment);
    await logSituationAssessment(assessment, true, false, null);
    return { alertSent: true, alertSuppressed: false, suppressionReason: null };
  }

  // For probe failures — suppress on first occurrence
  if (assessment.action.type === "none_needed") {
    return { alertSent: false, alertSuppressed: true, suppressionReason: "Action type: none_needed (transient blip)" };
  }

  // Probe with severity >= warning and confirmed (failCount >= 2 from assessment)
  if (assessment.impact.severity === "warning" || assessment.impact.severity === "critical") {
    await sendAssessmentEmail(assessment);
    await logSituationAssessment(assessment, true, false, null);
    return { alertSent: true, alertSuppressed: false, suppressionReason: null };
  }

  // Default: suppress, log
  const reason = "Below alert threshold (first occurrence, no customer impact)";
  await logSituationAssessment(assessment, false, true, reason);
  return { alertSent: false, alertSuppressed: true, suppressionReason: reason };
}

// ─── Dependency probe handler (with pending buffer) ────────────────────────

/**
 * Handle a dependency probe result. Implements the pending buffer pattern.
 * Called by dependency-health.ts after each probe.
 */
export async function handleDependencyProbeResult(
  dependency: string,
  healthy: boolean,
  assessment: SituationAssessment,
): Promise<void> {
  if (isExternalDependency(dependency)) {
    await handleExternalProbeResult(dependency, healthy, assessment);
    return;
  }

  const key = `dep:${dependency}`;

  if (!healthy) {
    const pending = pendingAlerts.get(key);
    if (!pending) {
      // First failure — buffer, don't alert
      pendingAlerts.set(key, {
        assessment,
        firstSeenAt: new Date(),
        probeCount: 1,
        alerted: false,
      });
      log.info({ label: "situation-probe-buffering", dependency }, "situation-probe-buffering");
      await logSituationAssessment(assessment, false, true, "First probe failure — buffering for confirmation");
    } else {
      // Second+ failure — confirmed
      pending.probeCount++;
      pending.assessment = assessment; // Update with latest assessment

      if (!pending.alerted) {
        // Confirmed: customer impact check is already in the assessment
        if (isInCooldown(key, "unhealthy")) {
          // Cooldown active — skip alert but still mark as confirmed
          pending.alerted = false;
        } else {
          const result = await evaluateAndAlert(assessment);
          if (result.alertSent) {
            pending.alerted = true;
            recordCooldown(key, "unhealthy");
          }
        }
      }
    }
  } else {
    // Probe succeeded
    const pending = pendingAlerts.get(key);
    if (pending) {
      if (pending.alerted || pending.probeCount >= 2) {
        // Was a confirmed outage — send recovery notification (with cooldown)
        if (!isInCooldown(key, "healthy")) {
          await sendRecoveryEmail(dependency, pending);
          recordCooldown(key, "healthy");
        } else {
          log.info({ label: "situation-recovery-suppressed", dependency }, "situation-recovery-suppressed");
        }
      } else {
        // Was a single blip — silently clear
        log.info(
          { label: "situation-transient-recovery", dependency },
          "situation-transient-recovery",
        );
        await logSituationAssessment(
          { ...pending.assessment, trigger: `${dependency}_recovered` },
          false, true, "Recovered after single probe failure — transient blip",
        );
      }
      pendingAlerts.delete(key);
    }
  }
}

// ─── External dependencies: daily summary, immediate only when customers hurt ─
//
// A third-party source going down is not something the founder can fix, and
// Strale already skips the affected tests and retries — yet each confirmed
// outage and recovery used to be its own email (577 in two months). Those
// outages now reach him once a day via external-outage-digest.ts, which reads
// the persisted probe rows; nothing here needs to remember them.
//
// The exception is an outage that is hurting paying customers: down for at
// least EXTERNAL_ESCALATE_AFTER_MS AND at least one paid, non-internal call to
// a capability behind it has failed since it went down. Duration alone is not
// enough — OpenAlex alone had eight outages over six hours in the week before
// this change, with nobody calling it. One email per outage; the recovery of
// an escalated outage is emailed so the first email gets its close.

/** An external outage must last this long before it can email at all. */
export const EXTERNAL_ESCALATE_AFTER_MS = 60 * 60 * 1000;
/** How often a still-down external dependency recounts failed paid calls. */
const EXTERNAL_ESCALATION_RECHECK_MS = 15 * 60 * 1000;

async function handleExternalProbeResult(
  dependency: string,
  healthy: boolean,
  assessment: SituationAssessment,
): Promise<void> {
  const key = `dep:${dependency}`;
  const pending = pendingAlerts.get(key);

  if (healthy) {
    if (!pending) return;
    pendingAlerts.delete(key);
    if (pending.alerted) {
      if (!isInCooldown(key, "healthy")) {
        await sendRecoveryEmail(dependency, pending);
        recordCooldown(key, "healthy");
      } else {
        log.info({ label: "situation-recovery-suppressed", dependency }, "situation-recovery-suppressed");
      }
      return;
    }
    await logSituationAssessment(
      { ...pending.assessment, trigger: `${dependency}_recovered` },
      false, true,
      pending.probeCount >= 2
        ? "External dependency recovered — reported in the daily outage summary"
        : "Recovered after single probe failure — transient blip",
    );
    return;
  }

  if (!pending) {
    pendingAlerts.set(key, { assessment, firstSeenAt: new Date(), probeCount: 1, alerted: false });
    log.info({ label: "situation-probe-buffering", dependency }, "situation-probe-buffering");
    await logSituationAssessment(assessment, false, true, "First probe failure — buffering for confirmation");
    return;
  }

  pending.probeCount++;
  pending.assessment = assessment;
  if (pending.alerted) return;

  if (!pending.digestLogged) {
    pending.digestLogged = true;
    await logSituationAssessment(
      assessment, false, true,
      "External dependency — reported in the daily outage summary, not emailed",
    );
  }

  const now = Date.now();
  const downMs = now - pending.firstSeenAt.getTime();
  if (downMs < EXTERNAL_ESCALATE_AFTER_MS) return;
  if (pending.lastEscalationCheckAt && now - pending.lastEscalationCheckAt < EXTERNAL_ESCALATION_RECHECK_MS) return;
  pending.lastEscalationCheckAt = now;

  const paidFailures = await countPaidCustomerFailures(dependency, pending.firstSeenAt);
  if (paidFailures === 0 && !assessment.impact.customersAffected) return;
  if (isInCooldown(key, "unhealthy")) return;
  if (await alreadyEscalatedThisOutage(dependency)) {
    pending.alerted = true;
    return;
  }

  const escalated = escalateAssessment(dependency, assessment, pending.firstSeenAt, downMs, paidFailures);
  await sendAssessmentEmail(escalated);
  await logSituationAssessment(escalated, true, false, null);
  pending.alerted = true;
  recordCooldown(key, "unhealthy");
}

function escalateAssessment(
  dependency: string,
  assessment: SituationAssessment,
  since: Date,
  downMs: number,
  paidFailures: number,
): SituationAssessment {
  const name = dependencyDisplayName(dependency);
  const evidence = [...assessment.rootCause.evidence];
  if (paidFailures > 0) {
    evidence.unshift(
      `${paidFailures} paid customer call${paidFailures === 1 ? "" : "s"} to tools that use ${name} failed since it went down (${formatSwedishTime(since)} Swedish time)`,
    );
  }
  return {
    ...assessment,
    rootCause: {
      ...assessment.rootCause,
      explanation: `${name} down ${formatDuration(Math.round(downMs / 60_000))} and failing paying customers' calls`,
      evidence,
    },
    impact: { ...assessment.impact, severity: "critical", customersAffected: true },
    action: {
      ...assessment.action,
      type: "immediate_action",
      selfResolving: false,
      operatorSteps: assessment.action.operatorSteps.length > 0
        ? assessment.action.operatorSteps
        : [
            `Check whether ${name} reports an incident on its own website or status page`,
            "Decide whether to pause the affected tools or tell the affected customers",
          ],
    },
  };
}

function formatSwedishTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
  }).format(d);
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[];
}

/**
 * Failed paid calls by real customers to capabilities behind `dependency`
 * since `since`. Paid = not free tier; real = x402 (no user) or a user outside
 * the internal-account rule, which also excludes the test harness's account.
 */
export async function countPaidCustomerFailures(dependency: string, since: Date): Promise<number> {
  const slugs = getProvider(dependency)?.capabilities ?? [];
  if (slugs.length === 0) return 0;
  try {
    const { getDb } = await import("../db/index.js");
    const result = await getDb().execute(sql`
      SELECT COUNT(*)::integer AS cnt
      FROM transactions t
      JOIN capabilities c ON c.id = t.capability_id
      WHERE t.status = 'failed'
        AND t.created_at >= ${since.toISOString()}::timestamptz
        AND COALESCE(t.is_free_tier, false) = false
        AND (t.user_id IS NULL OR t.user_id NOT IN (
          SELECT id FROM users WHERE ${internalAccountEmailExclusionSql()}
        ))
        AND c.slug IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)})
    `);
    return Number(rowsOf(result)[0]?.cnt ?? 0);
  } catch (err) {
    logError("external-escalation-count-failed", err, { dependency });
    return 0;
  }
}

/**
 * Whether this outage was already emailed — survives a restart, which empties
 * pendingAlerts mid-outage. An escalation counts if it was sent after the
 * dependency's last healthy probe (bounded to 48h so the scan stays small).
 * On a query error, answers false: a duplicate email beats a missed one.
 */
async function alreadyEscalatedThisOutage(dependency: string): Promise<boolean> {
  try {
    const { getDb } = await import("../db/index.js");
    const result = await getDb().execute(sql`
      SELECT 1
      FROM health_monitor_events e
      WHERE e.event_type = 'situation_assessment'
        AND e.details->>'trigger' = ${`${dependency}_probe_failed`}
        AND e.details->>'alert_sent' = 'true'
        AND e.created_at >= now() - interval '48 hours'
        AND e.created_at > COALESCE((
          SELECT max(p.created_at)
          FROM health_monitor_events p
          WHERE p.event_type = 'dependency_probe'
            AND p.details->>'dependency' = ${dependency}
            AND p.details->>'healthy' = 'true'
            AND p.created_at >= now() - interval '48 hours'
        ), '-infinity'::timestamptz)
      LIMIT 1
    `);
    return rowsOf(result).length > 0;
  } catch (err) {
    logError("external-escalation-dedupe-failed", err, { dependency });
    return false;
  }
}

// ─── Recovery notification ──────────────────────────────────────────────────

async function sendRecoveryEmail(dependency: string, pending: PendingAlert): Promise<void> {
  const meta = DEPENDENCY_CONTEXT[dependency];
  const downtimeMs = Date.now() - pending.firstSeenAt.getTime();
  const downtimeMinutes = Math.round(downtimeMs / 60_000);
  const capCount = pending.assessment.impact.capabilitiesAffected;

  const subject = `Strale — ${meta?.displayName ?? dependency} recovered`;
  const body = [
    `${meta?.displayName ?? dependency} is healthy again as of ${new Date().toISOString()}.`,
    `Downtime duration: ~${downtimeMinutes} minutes (${pending.probeCount} failed probes).`,
    "",
    "Recovery actions taken automatically:",
    `  - ${capCount} ${dependency}-dependent capabilities have resumed normal testing`,
    "  - Tests were skipped (not failed) during the outage, so test history is clean",
    "  - No circuit breakers were tripped",
    "",
    "No action needed.",
  ].join("\n");

  try {
    const { sendDigestEmail, isEmailConfigured } = await import("./digest-sender.js");
    if (!isEmailConfigured()) return;
    await sendDigestEmail(formatPlainTextEmail(subject, body), subject);
    log.info({ label: "situation-recovery-email-sent", dependency }, "situation-recovery-email-sent");
  } catch (err) {
    logError("situation-recovery-email-failed", err, { dependency });
  }

  await logHealthEvent({
    eventType: "situation_assessment",
    tier: 1,
    actionTaken: `${dependency} recovered after ${downtimeMinutes}min outage`,
    details: {
      type: "recovery",
      dependency,
      downtime_minutes: downtimeMinutes,
      probe_count: pending.probeCount,
    },
  });
}

// ─── Rich email formatting ──────────────────────────────────────────────────

function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "warning": return "🟡";
    default: return "ℹ️";
  }
}

function actionIcon(type: string): string {
  switch (type) {
    case "none_needed": return "✅ NO ACTION NEEDED";
    case "monitor": return "⏳ MONITOR";
    case "investigate": return "🔧 INVESTIGATE";
    case "immediate_action": return "🔴 IMMEDIATE ACTION";
    default: return type;
  }
}

function formatPlainTextEmail(subject: string, body: string): string {
  // Wrap in minimal HTML for email rendering
  return `<div style="font-family: monospace; white-space: pre-wrap; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a2e;">${escapeHtml(body)}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendAssessmentEmail(assessment: SituationAssessment): Promise<void> {
  const triggerDep = assessment.trigger.replace(/_probe_failed$/, "").replace(/_/g, " ");
  const meta = DEPENDENCY_CONTEXT[triggerDep.replace(/ /g, "_")] ?? DEPENDENCY_CONTEXT[assessment.trigger.split("_")[0]];

  const subject = `${severityEmoji(assessment.impact.severity)} Strale — ${assessment.rootCause.explanation.substring(0, 80)}`;

  const lines: string[] = [];
  lines.push("━".repeat(55));
  lines.push(assessment.trigger.toUpperCase().replace(/_/g, " "));
  lines.push("━".repeat(55));
  lines.push("");

  // What happened
  lines.push("What happened:");
  lines.push(`  ${assessment.rootCause.explanation}`);
  if (meta) {
    lines.push(`  ${meta.ownershipExplanation}`);
  }
  lines.push("");

  // Evidence
  if (assessment.rootCause.evidence.length > 0 || assessment.correlatedSignals.length > 0) {
    lines.push("Evidence:");
    for (const e of assessment.rootCause.evidence) {
      lines.push(`  • ${e}`);
    }
    for (const s of assessment.correlatedSignals) {
      const icon = s.relevance === "supporting" ? "⚠" : s.relevance === "contradicting" ? "✓" : "→";
      lines.push(`  ${icon} ${s.signal}`);
    }
    lines.push("");
  }

  // Impact
  lines.push("Impact:");
  lines.push(`  ${assessment.impact.capabilitiesAffected} capabilities affected`);
  lines.push(`  Customer traffic: ${assessment.impact.customersAffected ? "CONFIRMED FAILING" : "not directly affected"}`);
  lines.push("");

  // Action
  lines.push(`Do I need to act?`);
  lines.push(`  ${actionIcon(assessment.action.type)}`);
  if (assessment.action.selfResolving) {
    lines.push(`  Expected to self-resolve${assessment.action.estimatedRecoveryMinutes ? ` in ~${assessment.action.estimatedRecoveryMinutes} minutes` : ""}.`);
  }
  for (const step of assessment.action.operatorSteps) {
    lines.push(`  → ${step}`);
  }
  lines.push("");

  // Automatic actions
  if (assessment.action.automaticActions.length > 0) {
    lines.push("What's happening automatically:");
    for (const a of assessment.action.automaticActions) {
      lines.push(`  ✓ ${a}`);
    }
    lines.push("");
  }

  // Footer
  lines.push("━".repeat(55));
  lines.push("Strale Platform Health Monitor");
  lines.push(`Assessment confidence: ${assessment.rootCause.confidence.toUpperCase()}`);
  lines.push(`Time: ${assessment.timestamp}`);
  if (meta?.statusPageUrl) {
    lines.push(`Status page: ${meta.statusPageUrl}`);
  }

  const body = lines.join("\n");

  try {
    const { sendDigestEmail, isEmailConfigured } = await import("./digest-sender.js");
    if (!isEmailConfigured()) {
      logWarn("situation-email-not-configured", "email not configured; alert suppressed");
      return;
    }
    await sendDigestEmail(formatPlainTextEmail(subject, body), subject);
    log.info({ label: "situation-alert-email-sent", trigger: assessment.trigger }, "situation-alert-email-sent");
  } catch (err) {
    logError("situation-alert-email-failed", err, { trigger: assessment.trigger });
  }
}

// ─── Situation logging ──────────────────────────────────────────────────────

async function logSituationAssessment(
  assessment: SituationAssessment,
  alertSent: boolean,
  alertSuppressed: boolean,
  suppressionReason: string | null,
): Promise<void> {
  const severityToTier = (s: string): 1 | 2 | 3 =>
    s === "critical" ? 3 : s === "warning" ? 2 : 1;

  await logHealthEvent({
    eventType: "situation_assessment",
    tier: severityToTier(assessment.impact.severity),
    actionTaken: assessment.rootCause.explanation.substring(0, 250),
    details: {
      trigger: assessment.trigger,
      root_cause_category: assessment.rootCause.category,
      root_cause_confidence: assessment.rootCause.confidence,
      severity: assessment.impact.severity,
      capabilities_affected: assessment.impact.capabilitiesAffected,
      customers_affected: assessment.impact.customersAffected,
      action_type: assessment.action.type,
      self_resolving: assessment.action.selfResolving,
      alert_sent: alertSent,
      alert_suppressed: alertSuppressed,
      suppression_reason: suppressionReason,
      signals_count: assessment.correlatedSignals.length,
    },
  }).catch((err) =>
    logError("health-event-log-failed", err, { context: "situation_assessment" }),
  );
}
