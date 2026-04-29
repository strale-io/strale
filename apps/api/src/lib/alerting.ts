/**
 * Shared email alerting via Resend.
 *
 * Cert-audit C12: alerts fan out to a comma-separated list from
 * ALERT_RECIPIENTS so a downed inbox doesn't lose every page. Default
 * stays at petter@strale.io for parity with the prior single-inbox
 * behaviour. Production should set ALERT_RECIPIENTS to at least two
 * independent endpoints (e.g. primary email + secondary email +
 * dedicated PagerDuty / Better Stack incident webhook address).
 *
 * Cert-audit C11: a startup check (assertAlertingConfigured) lets
 * index.ts fail-loud when production lacks BETTER_STACK_SOURCE_TOKEN
 * AND the alerting backend, so we don't silently route critical pages
 * into stdout-only.
 */

import { Resend } from "resend";
import { log, logError, logWarn } from "./log.js";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    _resend = new Resend(key);
  }
  return _resend;
}

const DEFAULT_RECIPIENTS = ["petter@strale.io"];

function getRecipients(): string[] {
  const raw = process.env.ALERT_RECIPIENTS;
  if (!raw || !raw.trim()) return DEFAULT_RECIPIENTS;
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /@/.test(s));
  return parsed.length > 0 ? parsed : DEFAULT_RECIPIENTS;
}

/**
 * Cert-audit C11: production fail-loud when neither logging-sink nor
 * email-alerting is wired. Called from index.ts at boot. Doesn't throw —
 * just emits a CRITICAL-level log line that triggers human attention.
 */
export function assertAlertingConfigured(): void {
  const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  if (!isProd) return;
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasBetterStack = !!process.env.BETTER_STACK_SOURCE_TOKEN;
  if (!hasResend && !hasBetterStack) {
    log.error(
      {
        label: "alerting.unconfigured",
        severity: "critical",
        hint:
          "Production deploy has neither RESEND_API_KEY (email alerts) nor BETTER_STACK_SOURCE_TOKEN " +
          "(log shipping). Critical events will only land in stdout. Set both before relying on alerts.",
      },
      "alerting.unconfigured",
    );
  } else if (!hasResend) {
    logWarn("alerting.no-email-backend", "RESEND_API_KEY unset — email alerts disabled in production");
  } else if (!hasBetterStack) {
    logWarn("alerting.no-log-sink", "BETTER_STACK_SOURCE_TOKEN unset — log shipping disabled in production");
  }
}

export async function sendAlert(opts: {
  subject: string;
  body: string;
  severity: "info" | "warning" | "critical";
}): Promise<void> {
  const { subject, body, severity } = opts;

  const resend = getResend();
  if (!resend) {
    logWarn("alerting-no-api-key", "RESEND_API_KEY missing; would have sent alert", { severity, subject });
    return;
  }

  const recipients = getRecipients();

  try {
    await resend.emails.send({
      from: "Strale Alerts <noreply@strale.io>",
      to: recipients,
      subject: `[Strale ${severity.toUpperCase()}] ${subject}`,
      text: body,
    });
    log.info(
      { label: "alerting-sent", severity, subject, recipients_count: recipients.length },
      "alerting-sent",
    );
  } catch (err) {
    logError("alerting-send-failed", err, { severity, subject, recipients_count: recipients.length });
  }
}
