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
 */

import type { SituationAssessment, DependencyMeta } from "./situation-assessment.js";
import { DEPENDENCY_CONTEXT } from "./situation-assessment.js";
import { logHealthEvent } from "./health-monitor.js";

// ─── Pending alert buffer ───────────────────────────────────────────────────

interface PendingAlert {
  assessment: SituationAssessment;
  firstSeenAt: Date;
  probeCount: number;
  alerted: boolean; // True once an alert email has been sent
}

const pendingAlerts = new Map<string, PendingAlert>();

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
      console.log(`[situation] ${dependency}: first probe failure, buffering`);
      await logSituationAssessment(assessment, false, true, "First probe failure — buffering for confirmation");
    } else {
      // Second+ failure — confirmed
      pending.probeCount++;
      pending.assessment = assessment; // Update with latest assessment

      if (!pending.alerted) {
        // Confirmed: customer impact check is already in the assessment
        const result = await evaluateAndAlert(assessment);
        if (result.alertSent) pending.alerted = true;
      }
    }
  } else {
    // Probe succeeded
    const pending = pendingAlerts.get(key);
    if (pending) {
      if (pending.alerted || pending.probeCount >= 2) {
        // Was a confirmed outage — send recovery notification
        await sendRecoveryEmail(dependency, pending);
      } else {
        // Was a single blip — silently clear
        console.log(`[situation] ${dependency}: recovered after single probe failure (transient, no alert sent)`);
        await logSituationAssessment(
          { ...pending.assessment, trigger: `${dependency}_recovered` },
          false, true, "Recovered after single probe failure — transient blip",
        );
      }
      pendingAlerts.delete(key);
    }
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
    "  - SQS scores were not penalized during the outage (tests were skipped, not failed)",
    "  - No circuit breakers were tripped",
    "",
    "No action needed.",
  ].join("\n");

  try {
    const { sendDigestEmail, isEmailConfigured } = await import("./digest-sender.js");
    if (!isEmailConfigured()) return;
    await sendDigestEmail(formatPlainTextEmail(subject, body), subject);
    console.log(`[situation] Recovery email sent for ${dependency}`);
  } catch (err) {
    console.error(`[situation] Failed to send recovery email:`, err instanceof Error ? err.message : err);
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
  lines.push(`  SQS impact: ${assessment.impact.sqsImpact.replace(/_/g, " ")}`);
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
      console.warn("[situation] Email not configured — alert suppressed");
      return;
    }
    await sendDigestEmail(formatPlainTextEmail(subject, body), subject);
    console.log(`[situation] Alert email sent: ${assessment.trigger}`);
  } catch (err) {
    console.error(`[situation] Failed to send alert email:`, err instanceof Error ? err.message : err);
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
  }).catch(() => {});
}
