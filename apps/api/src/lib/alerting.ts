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

/**
 * Returns true only when Resend accepted the email. Resend reports most
 * failures IN-BAND as `{ error }` on a resolved promise (invalid key,
 * quota exhausted, unverified sender domain) rather than by throwing —
 * ignoring that field logs "alerting-sent" for emails that never left.
 * Callers that page on this (fatal startup) rely on the distinction.
 */
export async function sendAlert(opts: {
  subject: string;
  body: string;
  severity: "info" | "warning" | "critical";
}): Promise<boolean> {
  const { subject, body, severity } = opts;

  // Alert fatigue (incident 2026-08-14): a CRITICAL "x402 settlement volume
  // dropped" page — a full revenue stoppage — arrived in an inbox interleaved
  // with routine INFO notices like "greek-company-data reached 30% of daily
  // test budget", and was missed for hours. Informational alerts are not
  // things to act on at 2am; they belong in the daily digest, which already
  // reports budget consumption. INFO is therefore logged, not emailed.
  // Set ALERT_INFO_EMAIL=true to restore the old behaviour.
  if (severity === "info" && process.env.ALERT_INFO_EMAIL !== "true") {
    log.info(
      { label: "alerting-info-suppressed", severity, subject },
      "alerting-info-suppressed (logged, not emailed — see daily digest)",
    );
    return false;
  }

  const resend = getResend();
  if (!resend) {
    logWarn("alerting-no-api-key", "RESEND_API_KEY missing; would have sent alert", { severity, subject });
    return false;
  }

  const recipients = getRecipients();

  try {
    const { error } = await resend.emails.send({
      from: "Strale Alerts <noreply@strale.io>",
      to: recipients,
      subject: `[Strale ${severity.toUpperCase()}] ${subject}`,
      text: body,
    });
    if (error) {
      logError(
        "alerting-send-failed",
        new Error(`Resend rejected the email: ${error.message ?? JSON.stringify(error)}`),
        { severity, subject, recipients_count: recipients.length, resend_error_name: error.name },
      );
      return false;
    }
    log.info(
      { label: "alerting-sent", severity, subject, recipients_count: recipients.length },
      "alerting-sent",
    );
    return true;
  } catch (err) {
    logError("alerting-send-failed", err, { severity, subject, recipients_count: recipients.length });
    return false;
  }
}
