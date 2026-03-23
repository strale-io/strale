/**
 * Interrupt Email Sender — HM-3 (v2: design-system templates)
 *
 * Sends time-sensitive interrupt emails for events that can't wait for the
 * weekly digest. Expected frequency: 0-2 per week in normal operation.
 *
 * All interrupts are:
 * 1. Deduplicated via health_monitor_events (one per slug+type per 24h)
 * 2. Logged as 'interrupt_sent' events after sending
 * 3. Silently skipped if email is not configured
 *
 * Trust-safe rules:
 * - Every claim must be backed by data the system has at send time
 * - Never fabricate numbers, timelines, or root cause analysis
 * - If the system doesn't know something, say so explicitly or omit it
 */

import { and, gte, eq, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "./health-monitor.js";
import { sendDigestEmail, isEmailConfigured } from "./digest-sender.js";
import {
  emailWrapper,
  COLORS,
  metricGrid,
  sectionHeader,
  sourceAttribution,
  statusBadge,
  checkItem,
  timelineItem,
  numberedStep,
  codeBlock,
  probeDataTable,
  capabilityTable,
  eventLogTable,
  infrastructureTable,
} from "./email-templates.js";
import {
  getAffectedCapabilityDetails,
  getDependencyOutageHistory,
  getCircuitBreakerState,
  checkEnvVarExists,
} from "./digest-compiler.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type InterruptType =
  | "suspension_warning"
  | "mass_failure"
  | "validation_failure"
  | "billing_alert"
  | "infrastructure_down";

export interface InterruptPayload {
  type: InterruptType;
  capabilitySlug?: string;
  /** Dependency name for infrastructure_down (e.g. "browserless", "anthropic") */
  dependency?: string;
  /** Affected capability slugs (for mass_failure and infrastructure_down) */
  affectedSlugs?: string[];
  /** Raw probe error string */
  probeError?: string;
  /** Probe latency in ms (for recovery emails) */
  probeLatencyMs?: number;
  /** Failure count and total for mass_failure */
  failureCount?: number;
  totalInBatch?: number;
  details: Record<string, unknown>;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Send an interrupt email if not already sent for this slug+type in the last 24h.
 * Silently no-ops if email is not configured.
 */
export async function sendInterruptEmail(payload: InterruptPayload): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn(`[interrupt] RESEND_API_KEY not set — skipping interrupt: ${payload.type}`);
    return;
  }

  const alreadySent = await checkAlreadySent(payload.type, payload.capabilitySlug);
  if (alreadySent) {
    console.log(`[interrupt] Dedup: ${payload.type}${payload.capabilitySlug ? ` (${payload.capabilitySlug})` : ""} already sent in last 24h`);
    return;
  }

  let result: { subject: string; html: string };
  try {
    result = await buildInterruptEmail(payload);
  } catch (err) {
    console.error(`[interrupt] Template build failed for ${payload.type}:`, err instanceof Error ? err.message : err);
    return;
  }

  try {
    await sendDigestEmail(result.html, result.subject);
    console.log(`[interrupt] Sent: ${result.subject}`);
  } catch (err) {
    console.error(`[interrupt] Send failed for ${payload.type}:`, err instanceof Error ? err.message : err);
    return;
  }

  await logHealthEvent({
    eventType: "interrupt_sent",
    capabilitySlug: payload.capabilitySlug,
    tier: 2,
    actionTaken: `Interrupt email sent: ${payload.type}`,
    details: {
      interrupt_type: payload.type,
      subject: result.subject,
      ...payload.details,
    },
  });
}

// ─── Deduplication ───────────────────────────────────────────────────────────

async function checkAlreadySent(
  type: InterruptType,
  capabilitySlug?: string,
): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 24 * 3600_000);

  const conditions = [
    eq(healthMonitorEvents.eventType, "interrupt_sent"),
    gte(healthMonitorEvents.createdAt, cutoff),
    sql`${healthMonitorEvents.details}->>'interrupt_type' = ${type}`,
  ];

  if (capabilitySlug) {
    conditions.push(eq(healthMonitorEvents.capabilitySlug, capabilitySlug));
  }

  const rows = await db
    .select({ id: healthMonitorEvents.id })
    .from(healthMonitorEvents)
    .where(and(...(conditions as [any, ...any[]])))
    .limit(1);

  return rows.length > 0;
}

// ─── Email builder ────────────────────────────────────────────────────────────

async function buildInterruptEmail(
  payload: InterruptPayload,
): Promise<{ subject: string; html: string }> {
  switch (payload.type) {
    case "suspension_warning":
      return buildSuspensionWarning(payload);
    case "mass_failure":
      return buildMassFailure(payload);
    case "validation_failure":
      return buildValidationFailure(payload);
    case "billing_alert":
      return buildBillingAlert(payload);
    case "infrastructure_down":
      return buildInfrastructureDown(payload);
  }
}

// ─── Alert Severity Classification ───────────────────────────────────────────

/** Dependencies we control (can restart, check logs for) → CRITICAL */
const INTERNAL_DEPENDENCIES = new Set(["browserless", "anthropic"]);

/** Dependencies that are third-party (we can only wait) → WARNING/MONITORING */
function getAlertSeverity(dependency: string): "critical" | "warning" {
  return INTERNAL_DEPENDENCIES.has(dependency) ? "critical" : "warning";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCET(d: Date | string): string {
  return new Date(d).toLocaleString("en-GB", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) + " CET";
}

const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";

/** Blue-bordered info box for automated response summaries. */
function automatedResponseBox(bodyHtml: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;border-left:3px solid ${COLORS.digest};border-radius:0 6px 6px 0;background:${COLORS.bgInfo};">
<tr><td style="padding:16px 18px;">
  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:${COLORS.textInfo};text-transform:uppercase;letter-spacing:1px;">Automated Response — Active</p>
  ${bodyHtml}
</td></tr>
</table>`;
}

/** Get the affected slugs for a dependency from the upstream mapping. */
async function getAffectedSlugsForDependency(dependency: string): Promise<string[]> {
  const db = getDb();

  // Import inline to avoid circular dependency
  const { capabilities } = await import("../db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  // Browserless → scraping capabilities, anthropic → ai_assisted
  const typeMap: Record<string, string> = {
    browserless: "scraping",
    anthropic: "ai_assisted",
  };

  const capType = typeMap[dependency];
  if (capType) {
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(and(eq(capabilities.capabilityType, capType), eq(capabilities.isActive, true)));
    return rows.map((r) => r.slug);
  }

  // Fixed upstream mappings
  const FIXED: Record<string, string[]> = {
    vies: ["vat-validate", "eori-validate", "vat-format-validate"],
    opensanctions: ["sanctions-check", "pep-check", "adverse-media-check", "aml-risk-score"],
    gleif: ["lei-lookup"],
    brreg: ["norwegian-company-data"],
  };

  return FIXED[dependency] ?? [];
}

// ─── 1. Infrastructure Down (Critical) ──────────────────────────────────────

async function buildInfrastructureDown(
  payload: InterruptPayload,
): Promise<{ subject: string; html: string }> {
  const dep = payload.dependency ?? String(payload.details.service ?? "Infrastructure");
  const severity = getAlertSeverity(dep);

  // Gather data at send time
  const affectedSlugs = payload.affectedSlugs ?? await getAffectedSlugsForDependency(dep);
  const affectedCount = affectedSlugs.length;

  const subjectPrefix = severity === "critical" ? "[ACTION REQUIRED]" : "[MONITORING]";
  const subject = `${subjectPrefix} ${dep} down — ${affectedCount} capability${affectedCount === 1 ? "" : "ies"} affected`;

  const capDetails = affectedSlugs.length > 0
    ? await getAffectedCapabilityDetails(affectedSlugs.slice(0, 10))
    : [];

  // Get circuit breaker state for first affected capability (representative)
  const cbState = affectedSlugs.length > 0
    ? await getCircuitBreakerState(affectedSlugs[0])
    : null;

  // Get outage history
  const outageHistory = await getDependencyOutageHistory(dep, 7);

  // Detected-at from payload or now
  const detectedAt = payload.details.detected_at
    ? formatCET(String(payload.details.detected_at))
    : formatCET(new Date());

  // Check if this might be a missing API key rather than service down
  const envVarMap: Record<string, string> = {
    browserless: "BROWSERLESS_API_KEY",
    opensanctions: "OPENSANCTIONS_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    companies_house: "COMPANIES_HOUSE_API_KEY",
    serper: "SERPER_API_KEY",
  };
  const envVar = envVarMap[dep];
  const envVarConfigured = envVar ? checkEnvVarExists(envVar) : true;

  // Dependency description
  const depDescriptions: Record<string, string> = {
    browserless: "Browserless provides headless browser rendering for capabilities that scrape web pages (company registries, compliance databases, web intelligence).",
    anthropic: "Anthropic's Claude API powers AI-assisted capabilities including data extraction, text analysis, and risk narrative generation.",
    vies: "VIES (VAT Information Exchange System) is the EU Commission's service for validating VAT numbers across member states.",
    opensanctions: "OpenSanctions provides sanctions list matching for PEP checks, adverse media screening, and AML risk scoring.",
    gleif: "GLEIF provides the Global LEI Index for Legal Entity Identifier lookups.",
  };

  // Next retry time from circuit breaker
  const nextRetry = cbState?.nextRetryAt ? formatCET(cbState.nextRetryAt) : null;
  const cbFailures = cbState?.consecutiveFailures ?? 0;

  const body =
    // 1. Plain-English explanation
    `<p style="margin:0 0 16px;font-size:14px;color:${COLORS.textPrimary};line-height:1.6;">
      ${depDescriptions[dep] ?? `${esc(dep)} is a dependency used by Strale capabilities.`}
      ${affectedCount > 0 ? `<strong>${affectedCount} capabilities</strong> depend on this service.` : ""}
      Testing for affected capabilities has been paused to prevent score pollution.
    </p>` +

    // 2. Metrics
    metricGrid([
      { label: "Affected", value: String(affectedCount), subtitle: "capabilities" },
      { label: "Consecutive failures", value: String(cbFailures) },
      { label: "Detected", value: detectedAt.replace(" CET", ""), subtitle: "CET" },
    ]) +

    // 3. Automated response
    automatedResponseBox(
      `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:${COLORS.textPrimary};">Already done:</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 12px;">
      ${checkItem("Tests paused for affected capabilities (not failed — scores protected)")}
      ${checkItem("Failures classified as upstream_transient")}
      ${checkItem("Event logged to health_monitor_events")}
      </table>
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:${COLORS.textPrimary};">What happens next:</p>
      <table cellpadding="0" cellspacing="0" role="presentation">
      ${timelineItem({ time: "Now", text: "Circuit breaker tripped — tests skipped", isActive: true })}
      ${nextRetry ? timelineItem({ time: nextRetry, text: `Automatic retry (backoff: ${cbState?.backoffMinutes ?? "?"}min)` }) : ""}
      ${timelineItem({ time: "Next 6h cycle", text: "Health sweep re-probes dependency" })}
      ${timelineItem({ time: "On recovery", text: "Testing resumes. Freshness tags update based on test tier schedule (A=6h, B=24h, C=72h).", isLast: true })}
      </table>
      <p style="margin:8px 0 0;font-size:11px;color:${COLORS.textSecondary};">
        Freshness decay progresses through 5 levels (fresh → aging → stale → expired → unverified). Rate varies per capability and test tier.
      </p>`,
    ) +

    // 4. Suggested investigation
    sectionHeader("SUGGESTED INVESTIGATION") +
    `<p style="margin:0 0 12px;font-size:12px;color:${COLORS.textSecondary};font-style:italic;">
      The system cannot access Railway logs or container metrics. These are common troubleshooting steps for this dependency type.
    </p>` +
    `<table cellpadding="0" cellspacing="0" role="presentation">` +
    (!envVarConfigured && envVar
      ? numberedStep(1, `Check ${envVar}`, `Environment variable ${envVar} is not configured. This may be the cause — verify the variable is set in Railway.`)
      : numberedStep(1, "Check service status", `Visit the ${esc(dep)} status page or dashboard for any reported outages.`)) +
    numberedStep(2, "Check Railway logs", `Look for connection errors or timeout patterns in the last 30 minutes.`) +
    numberedStep(3, "Manual health probe", "Run the command below to trigger a health sweep:") +
    `</table>` +
    codeBlock(`curl -X POST ${BASE_URL}/v1/internal/health-sweep \\\n  -H "Authorization: Bearer $ADMIN_SECRET"`) +

    // 5. Probe data table
    sectionHeader("PROBE DATA") +
    probeDataTable([
      { label: "Dependency", value: dep },
      ...(payload.probeError ? [{ label: "Error", value: payload.probeError }] : []),
      { label: "Classification", value: { badge: statusBadge("upstream", "Upstream failure") } },
      { label: "Circuit breaker", value: cbState ? `${cbState.state} (${cbFailures} consecutive failures)` : "Unknown" },
      ...(nextRetry ? [{ label: "Next retry", value: nextRetry }] : []),
      ...(envVar ? [{ label: envVar, value: { badge: envVarConfigured ? statusBadge("healthy", "Configured") : statusBadge("warning", "Not set") } }] : []),
    ]) +
    sourceAttribution("Source: dependency health probe, capability_health table") +

    // 6. Affected capabilities table (top 10)
    (capDetails.length > 0
      ? sectionHeader("AFFECTED CAPABILITIES" + (affectedCount > 10 ? ` (showing 10 of ${affectedCount})` : "")) +
        capabilityTable(capDetails) +
        sourceAttribution("Source: capabilities table, test_results")
      : "") +

    // 7. Recent outage history
    (outageHistory.length > 0
      ? sectionHeader("OUTAGE HISTORY (7 DAYS)") +
        eventLogTable(outageHistory.map((e) => ({
          ...e,
          badge: e.badge ? statusBadge("recovered") : undefined,
        }))) +
        sourceAttribution("Source: health_monitor_events table")
      : "");

  const headerColor = severity === "critical" ? COLORS.critical : COLORS.warning;
  const headerLabel = severity === "critical" ? "ACTION REQUIRED" : "MONITORING — SYSTEM HANDLING";
  const html = emailWrapper(headerColor, "&#9888;", headerLabel, subject, body);
  return { subject, html };
}

// ─── 2. Mass Failure (Critical) ─────────────────────────────────────────────

async function buildMassFailure(
  payload: InterruptPayload,
): Promise<{ subject: string; html: string }> {
  const d = payload.details;
  const failedCount = payload.failureCount ?? Number(d.failed_count ?? 0);
  const totalCount = payload.totalInBatch ?? Number(d.total_count ?? 0);
  const failedSlugs = payload.affectedSlugs ?? (Array.isArray(d.failed_slugs) ? d.failed_slugs as string[] : []);
  const classification = String(d.common_classification ?? "unknown");
  const failRate = totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : "0";

  const subject = `[ACTION REQUIRED] Mass failure — ${failedCount}/${totalCount} capabilities failed`;

  // Enrich with current SQS data
  const capDetails = failedSlugs.length > 0
    ? await getAffectedCapabilityDetails(failedSlugs.slice(0, 15))
    : [];

  // Group failure reasons if available
  const classificationCounts = d.classification_counts as Record<string, number> | undefined;

  const body =
    `<p style="margin:0 0 16px;font-size:14px;color:${COLORS.textPrimary};line-height:1.6;">
      <strong>${failedCount} of ${totalCount}</strong> capabilities failed in this test batch.
      This exceeds the alert threshold (>10% failure rate with >5 failures).
      ${classification !== "unknown" ? `The most common failure classification is <strong>${esc(classification)}</strong>.` : ""}
    </p>` +

    metricGrid([
      { label: "Failed", value: String(failedCount), subtitle: `of ${totalCount} tested` },
      { label: "Failure rate", value: `${failRate}%` },
      { label: "Classification", value: classification },
    ]) +

    // Failure breakdown by classification (if available)
    (classificationCounts && Object.keys(classificationCounts).length > 0
      ? sectionHeader("FAILURE BREAKDOWN") +
        probeDataTable(
          Object.entries(classificationCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([cls, count]) => ({
              label: cls,
              value: { badge: `${statusBadge(cls.startsWith("upstream") ? "upstream" : cls === "capability_bug" ? "internal" : "warning", String(count))}` },
            })),
        ) +
        sourceAttribution("Source: failure_classifier verdicts from this test batch")
      : "") +

    // Automated response
    automatedResponseBox(
      `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:${COLORS.textPrimary};">The system is doing:</p>
      <table cellpadding="0" cellspacing="0" role="presentation">
      ${checkItem("Failures classified and logged per capability")}
      ${checkItem("Circuit breaker evaluating affected capabilities")}
      ${checkItem("SQS scores updated based on test results (no exclusion — these count)")}
      </table>
      <p style="margin:8px 0 0;font-size:11px;color:${COLORS.textSecondary};">
        Unlike upstream failures (which are excluded from scoring), mass failures ARE reflected in SQS scores. This is by design — the score must reflect what users experience.
      </p>`,
    ) +

    sectionHeader("SUGGESTED INVESTIGATION") +
    `<p style="margin:0 0 12px;font-size:12px;color:${COLORS.textSecondary};font-style:italic;">
      The system cannot determine the root cause. A mass failure may be caused by a deployment issue, a shared dependency outage, a database problem, or multiple unrelated failures.
    </p>` +
    `<table cellpadding="0" cellspacing="0" role="presentation">` +
    numberedStep(1, "Check recent deployments", "Review the latest git pushes and Railway deployment logs for breaking changes.") +
    numberedStep(2, "Check dependency health", "Run a manual health sweep to probe all external dependencies.") +
    numberedStep(3, "Review failure patterns", "Check if failures cluster around a specific dependency, category, or test type.") +
    `</table>` +
    codeBlock(`curl -X POST ${BASE_URL}/v1/internal/health-sweep \\\n  -H "Authorization: Bearer $ADMIN_SECRET"`) +

    // Affected capability table
    (capDetails.length > 0
      ? sectionHeader("AFFECTED CAPABILITIES" + (failedSlugs.length > 15 ? ` (showing 15 of ${failedSlugs.length})` : "")) +
        capabilityTable(capDetails) +
        sourceAttribution("Source: capabilities table, test_results")
      : "");

  const html = emailWrapper(COLORS.critical, "&#9888;", "MASS FAILURE DETECTED", subject, body);
  return { subject, html };
}

// ─── 3. Suspension Warning ──────────────────────────────────────────────────

async function buildSuspensionWarning(
  payload: InterruptPayload,
): Promise<{ subject: string; html: string }> {
  const slug = payload.capabilitySlug ?? "unknown";
  const d = payload.details;
  const sqs = d.sqs_score != null ? String(d.sqs_score) : "—";
  const reason = String(d.reason ?? "Degraded SQS below platform floor");
  const degradedDays = d.degraded_days != null ? `${Math.floor(Number(d.degraded_days))}` : "?";
  const autoSuspendAt = d.auto_suspend_at
    ? formatCET(String(d.auto_suspend_at))
    : "within 24h";

  const subject = `[WARNING] ${slug} approaching suspension — action needed within 24h`;

  const capDetails = await getAffectedCapabilityDetails([slug]);
  const cbState = await getCircuitBreakerState(slug);

  const body =
    `<p style="margin:0 0 16px;font-size:14px;color:${COLORS.textPrimary};line-height:1.6;">
      <strong>${esc(slug)}</strong> has been in degraded state for ${esc(degradedDays)} days.
      Unless action is taken, it will be automatically suspended at ${esc(autoSuspendAt)}.
    </p>` +

    metricGrid([
      { label: "SQS Score", value: sqs, subtitle: "below platform floor" },
      { label: "Days degraded", value: degradedDays },
      { label: "Auto-suspend", value: autoSuspendAt.replace(" CET", ""), subtitle: "CET" },
    ]) +

    probeDataTable([
      { label: "Capability", value: slug },
      { label: "State", value: { badge: statusBadge("warning", "Degraded") } },
      { label: "Reason", value: reason },
      ...(cbState ? [{ label: "Circuit breaker", value: `${cbState.state} (${cbState.consecutiveFailures} failures)` }] : []),
    ]) +
    sourceAttribution("Source: capabilities table, capability_health") +

    sectionHeader("WHAT SUSPENDED MEANS") +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${COLORS.bgWarning};border-radius:6px;margin-bottom:16px;">
    <tr><td style="padding:14px 16px;">
      <p style="margin:0;font-size:13px;color:${COLORS.textWarning};line-height:1.6;">
        &bull; Removed from search, MCP, and the capability catalog<br>
        &bull; Returns 503 for API calls via /v1/do<br>
        &bull; SQS frozen at current value<br>
        &bull; Auto-recovery check runs weekly during health sweep
      </p>
    </td></tr>
    </table>` +

    sectionHeader("TO PREVENT SUSPENSION") +
    `<p style="margin:0 0 8px;font-size:13px;color:${COLORS.textPrimary};">
      Reply <span style="background:${COLORS.bgSuccess};padding:2px 8px;border-radius:3px;color:${COLORS.textSuccess};font-weight:700;">KEEP</span>
      to this email — the capability stays degraded with a warning label.
    </p>` +
    `<p style="margin:0 0 8px;font-size:13px;color:${COLORS.textSecondary};">Or via API:</p>` +
    codeBlock(`curl -X POST ${BASE_URL}/v1/internal/capabilities/${slug}/restore \\\n  -H "Authorization: Bearer $ADMIN_SECRET"`) +
    `<p style="margin:0;font-size:12px;color:${COLORS.textTertiary};font-style:italic;">
      To let suspension proceed: no action needed.
    </p>` +

    (capDetails.length > 0
      ? sectionHeader("CURRENT STATE") +
        capabilityTable(capDetails) +
        sourceAttribution("Source: capabilities table, test_results")
      : "");

  const html = emailWrapper(COLORS.warning, "&#9888;", "SUSPENSION WARNING", subject, body);
  return { subject, html };
}

// ─── 4. Validation Failure ──────────────────────────────────────────────────

async function buildValidationFailure(
  payload: InterruptPayload,
): Promise<{ subject: string; html: string }> {
  const slug = payload.capabilitySlug ?? "unknown";
  const d = payload.details;
  const subject = `[WARNING] ${slug} failed validation — review needed`;

  const failingChecks = Array.isArray(d.failing_checks) ? d.failing_checks as string[] : [];
  const passCount = d.pass_count != null ? Number(d.pass_count) : null;
  const totalChecks = d.total_checks != null ? Number(d.total_checks) : null;

  const body =
    `<p style="margin:0 0 16px;font-size:14px;color:${COLORS.textPrimary};line-height:1.6;">
      <strong>${esc(slug)}</strong> failed one or more validation gate checks
      and has been moved from <strong>validating</strong> back to <strong>draft</strong>.
      ${passCount != null && totalChecks != null ? `${passCount} of ${totalChecks} checks passed.` : ""}
    </p>` +

    (passCount != null && totalChecks != null
      ? metricGrid([
          { label: "Passed", value: String(passCount), subtitle: `of ${totalChecks} checks` },
          { label: "Failed", value: String(totalChecks - passCount) },
          { label: "State", value: "draft" },
        ])
      : "") +

    (failingChecks.length > 0
      ? sectionHeader("FAILING CHECKS") +
        probeDataTable(
          failingChecks.map((c, i) => ({
            label: `Check ${i + 1}`,
            value: c,
          })),
        )
      : "") +

    sectionHeader("TO FIX") +
    `<table cellpadding="0" cellspacing="0" role="presentation">` +
    numberedStep(1, "Fix the capability code", "Address each failing check listed above.") +
    numberedStep(2, "Re-run validation", "Use the command below:") +
    `</table>` +
    codeBlock(`npx tsx scripts/validate-capability.ts --slug ${slug}`);

  const html = emailWrapper(COLORS.warning, "&#9744;", "VALIDATION FAILED", subject, body);
  return { subject, html };
}

// ─── 5. Billing Alert ───────────────────────────────────────────────────────

async function buildBillingAlert(
  payload: InterruptPayload,
): Promise<{ subject: string; html: string }> {
  const d = payload.details;
  const subject = "[ACTION REQUIRED] Wallet operations failing — revenue may be impacted";

  const body =
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${COLORS.bgDanger};border-radius:6px;margin-bottom:16px;">
    <tr><td style="padding:14px 16px;">
      <p style="margin:0;font-size:13px;font-weight:600;color:${COLORS.textDanger};">
        Wallet operations are failing. Paid capability executions may be affected.
      </p>
    </td></tr>
    </table>` +

    probeDataTable([
      ...(d.error ? [{ label: "Error", value: String(d.error) }] : []),
      ...(d.operation ? [{ label: "Operation", value: String(d.operation) }] : []),
      ...(d.affected_users != null ? [{ label: "Affected users", value: String(d.affected_users) }] : []),
    ]) +

    sectionHeader("SUGGESTED INVESTIGATION") +
    `<table cellpadding="0" cellspacing="0" role="presentation">` +
    numberedStep(1, "Check Railway logs", "Look for database connection errors or wallet-related exceptions.") +
    numberedStep(2, "Check Stripe dashboard", "Verify webhook delivery and recent charge status.") +
    numberedStep(3, "Check database connectivity", "Verify the DATABASE_URL connection is healthy.") +
    `</table>`;

  const html = emailWrapper(COLORS.critical, "&#9888;", "BILLING ALERT", subject, body);
  return { subject, html };
}
