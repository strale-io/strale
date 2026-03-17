/**
 * Interrupt Email Sender — HM-3
 *
 * Sends time-sensitive interrupt emails for events that can't wait for the
 * weekly digest. Expected frequency: 0-2 per week in normal operation.
 *
 * All interrupts are:
 * 1. Deduplicated via health_monitor_events (one per slug+type per 24h)
 * 2. Logged as 'interrupt_sent' events after sending
 * 3. Silently skipped if email is not configured
 */

import { and, gte, eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "./health-monitor.js";
import { sendDigestEmail, isEmailConfigured } from "./digest-sender.js";

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

  const { subject, html } = buildInterruptEmail(payload);

  try {
    await sendDigestEmail(html, subject);
    console.log(`[interrupt] Sent: ${subject}`);
  } catch (err) {
    console.error(`[interrupt] Send failed for ${payload.type}:`, err instanceof Error ? err.message : err);
    return; // Don't log the event if send failed
  }

  // Log to health_monitor_events for dedup + audit trail
  await logHealthEvent({
    eventType: "interrupt_sent",
    capabilitySlug: payload.capabilitySlug,
    tier: 2,
    actionTaken: `Interrupt email sent: ${payload.type}`,
    details: {
      interrupt_type: payload.type,
      subject,
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

function buildInterruptEmail(payload: InterruptPayload): { subject: string; html: string } {
  switch (payload.type) {
    case "suspension_warning":   return buildSuspensionWarning(payload);
    case "mass_failure":         return buildMassFailure(payload);
    case "validation_failure":   return buildValidationFailure(payload);
    case "billing_alert":        return buildBillingAlert(payload);
    case "infrastructure_down":  return buildInfrastructureDown(payload);
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

function buildSuspensionWarning(payload: InterruptPayload): { subject: string; html: string } {
  const slug = payload.capabilitySlug ?? "unknown";
  const d = payload.details;
  const subject = `⚠️ ${slug} will be suspended in 24h`;

  const sqs = d.sqs_score != null ? String(d.sqs_score) : "—";
  const reason = String(d.reason ?? "Degraded SQS below platform floor");
  const degradedDays = d.degraded_days != null ? `${Math.floor(Number(d.degraded_days))} days` : "unknown";
  const autoSuspendAt = d.auto_suspend_at
    ? new Date(String(d.auto_suspend_at)).toLocaleString("en-GB", {
        timeZone: "Europe/Stockholm", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
      }) + " CET"
    : "within 24h";

  const baseUrl = process.env.API_BASE_URL ?? "https://strale-production.up.railway.app";

  const html = interruptLayout(subject, `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 16px;">
        ${infoRow("Capability", slug)}
        ${infoRow("Current state", `degraded (day ${degradedDays})`)}
        ${infoRow("Reason", reason)}
        ${infoRow("SQS", `${sqs} (Poor)`)}
        ${infoRow("Auto-suspend at", autoSuspendAt)}
      </td></tr>

      <tr><td style="background:#fffbeb;border-radius:6px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">What suspended means:</p>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#374151;">
          <li>Removed from search, MCP, and catalog</li>
          <li>Not callable via /v1/do (returns 503)</li>
          <li>SQS frozen at current value</li>
          <li>Auto-recovery check runs weekly during health sweep</li>
        </ul>
      </td></tr>

      <tr><td style="padding:16px 0 0;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151;">To prevent suspension:</p>
        <p style="margin:0 0 8px;font-size:13px;color:#374151;">
          Reply <code style="background:#dcfce7;padding:2px 6px;border-radius:3px;color:#166534;font-weight:700;">KEEP</code>
          — capability stays degraded with warning label.
        </p>
        <p style="margin:0 0 16px;font-size:12px;color:#6b7280;font-family:monospace;">
          # Or via API:<br>
          curl -X POST ${baseUrl}/v1/internal/capabilities/${slug}/restore \\<br>
          &nbsp;&nbsp;-H "Authorization: Bearer $ADMIN_SECRET"
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280;font-style:italic;">
          To let it proceed: no action needed.
        </p>
      </td></tr>
    </table>
  `);

  return { subject, html };
}

function buildMassFailure(payload: InterruptPayload): { subject: string; html: string } {
  const d = payload.details;
  const failedCount = Number(d.failed_count ?? 0);
  const totalCount = Number(d.total_count ?? 0);
  const failedSlugs = Array.isArray(d.failed_slugs) ? d.failed_slugs as string[] : [];
  const classification = String(d.common_classification ?? "unknown");
  const subject = `🔴 Mass failure detected — ${failedCount} capabilities affected`;

  const slugList = failedSlugs.slice(0, 15).map((s) =>
    `<li style="font-size:12px;font-family:monospace;color:#374151;">${esc(s)}</li>`
  ).join("") + (failedSlugs.length > 15 ? `<li style="font-size:12px;color:#6b7280;">…and ${failedSlugs.length - 15} more</li>` : "");

  const html = interruptLayout(subject, `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:#fef2f2;border-radius:6px;padding:16px;margin-bottom:16px;">
        <p style="margin:0;font-size:24px;font-weight:700;color:#dc2626;">${failedCount} / ${totalCount}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">capabilities failed in this test batch</p>
      </td></tr>

      <tr><td style="padding:16px 0;">
        ${infoRow("Failure rate", `${totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : 0}%`)}
        ${infoRow("Common classification", classification)}
        ${infoRow("Likely cause", classification.includes("upstream") ? "External service outage or rate limiting" : "Possible infrastructure or deployment issue")}
      </td></tr>

      ${failedSlugs.length > 0 ? `<tr><td style="padding:0 0 16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#374151;">Affected capabilities:</p>
        <ul style="margin:0;padding-left:20px;">${slugList}</ul>
      </td></tr>` : ""}

      <tr><td style="padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#374151;">
          Check Railway logs and dependency health. Run the health sweep when resolved:
        </p>
        <p style="margin:8px 0 0;font-size:12px;font-family:monospace;color:#374151;">
          curl -X POST ${process.env.API_BASE_URL ?? "https://strale-production.up.railway.app"}/v1/internal/health-sweep \\<br>
          &nbsp;&nbsp;-H "Authorization: Bearer $ADMIN_SECRET"
        </p>
      </td></tr>
    </table>
  `);

  return { subject, html };
}

function buildValidationFailure(payload: InterruptPayload): { subject: string; html: string } {
  const slug = payload.capabilitySlug ?? "unknown";
  const d = payload.details;
  const subject = `⏸️ ${slug} failed validation — review needed`;

  const failingChecks = Array.isArray(d.failing_checks) ? d.failing_checks as string[] : [];
  const checkList = failingChecks.map((c) =>
    `<li style="font-size:13px;color:#374151;">${esc(c)}</li>`
  ).join("") || "<li style='font-size:13px;color:#6b7280;'>No details available</li>";

  const html = interruptLayout(subject, `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 16px;">
        ${infoRow("Capability", slug)}
        ${infoRow("State", "validating → draft (blocked)")}
        ${d.pass_count != null ? infoRow("Gate checks", `${d.pass_count}/${d.total_checks ?? "?"} passed`) : ""}
      </td></tr>

      <tr><td style="padding:0 0 16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#374151;">Failing checks:</p>
        <ul style="margin:0;padding-left:20px;">${checkList}</ul>
      </td></tr>

      <tr><td style="padding:8px 0 0;">
        <p style="margin:0 0 8px;font-size:13px;color:#374151;">
          Fix the capability and re-run validation:
        </p>
        <p style="margin:0;font-size:12px;font-family:monospace;color:#374151;">
          npx tsx scripts/validate-capability.ts --slug ${esc(slug)}
        </p>
      </td></tr>
    </table>
  `);

  return { subject, html };
}

function buildBillingAlert(payload: InterruptPayload): { subject: string; html: string } {
  const d = payload.details;
  const subject = "🔴 Billing alert — wallet operations failing";

  const html = interruptLayout(subject, `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:#fef2f2;border-radius:6px;padding:16px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#dc2626;">
          Wallet operations are failing. Revenue may be impacted.
        </p>
      </td></tr>

      <tr><td style="padding:16px 0;">
        ${d.error ? infoRow("Error", String(d.error)) : ""}
        ${d.operation ? infoRow("Operation", String(d.operation)) : ""}
        ${d.affected_users != null ? infoRow("Affected users", String(d.affected_users)) : ""}
      </td></tr>

      <tr><td style="padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#374151;">
          Check Railway logs, Stripe dashboard, and database connectivity.
        </p>
      </td></tr>
    </table>
  `);

  return { subject, html };
}

function buildInfrastructureDown(payload: InterruptPayload): { subject: string; html: string } {
  const d = payload.details;
  const subject = `🔴 ${String(d.service ?? "Infrastructure")} down`;

  const serviceResults = (d.services as Record<string, { healthy: boolean; error?: string }> | undefined) ?? {};
  const serviceRows = Object.entries(serviceResults).map(([name, r]) => {
    const status = r.healthy
      ? `<span style="color:#16a34a;">healthy</span>`
      : `<span style="color:#dc2626;">DOWN</span>${r.error ? ` — ${esc(r.error)}` : ""}`;
    return `<p style="margin:0 0 6px;font-size:13px;color:#374151;"><strong>${esc(name)}:</strong> ${status}</p>`;
  }).join("");

  const affectedCount = Number(d.affected_capabilities ?? 0);

  const html = interruptLayout(subject, `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:#fef2f2;border-radius:6px;padding:16px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#dc2626;">
          ${esc(String(d.service ?? "Infrastructure service"))} is unreachable.
          ${affectedCount > 0 ? `${affectedCount} capabilities may be affected.` : ""}
        </p>
      </td></tr>

      ${serviceRows ? `<tr><td style="padding:16px 0;">${serviceRows}</td></tr>` : ""}

      <tr><td style="padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#374151;">
          Check the service status page and Railway logs. The health sweep will
          automatically re-check and notify when resolved.
        </p>
      </td></tr>
    </table>
  `);

  return { subject, html };
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function interruptLayout(subject: string, body: string): string {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Stockholm",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " CET";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#7f1d1d;padding:20px 28px;">
    <p style="margin:0;color:#fca5a5;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">STRALE PLATFORM ALERT</p>
    <h1 style="margin:4px 0 0;color:#ffffff;font-size:18px;font-weight:700;line-height:1.3;">${esc(subject)}</h1>
    <p style="margin:6px 0 0;color:#fca5a5;font-size:12px;">${now}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:24px 28px;">
    ${body}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      Strale Platform Health Monitor — automatic alert
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function infoRow(label: string, value: string): string {
  return `<p style="margin:0 0 8px;font-size:13px;color:#374151;">
    <span style="color:#6b7280;display:inline-block;min-width:120px;">${esc(label)}:</span>
    <strong>${esc(value)}</strong>
  </p>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
