/**
 * Shared email alerting via Resend.
 * Graceful degradation: logs to console if RESEND_API_KEY is not set.
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    _resend = new Resend(key);
  }
  return _resend;
}

export async function sendAlert(opts: {
  subject: string;
  body: string;
  severity: "info" | "warning" | "critical";
}): Promise<void> {
  const { subject, body, severity } = opts;

  const resend = getResend();
  if (!resend) {
    console.warn(`[alerting] No RESEND_API_KEY — would have sent ${severity}: ${subject}`);
    return;
  }

  try {
    await resend.emails.send({
      from: "Strale Alerts <noreply@strale.io>",
      to: "petter@strale.io",
      subject: `[Strale ${severity.toUpperCase()}] ${subject}`,
      text: body,
    });
    console.log(`[alerting] Sent ${severity} alert: ${subject}`);
  } catch (err) {
    console.error(`[alerting] Failed to send alert: ${err instanceof Error ? err.message : err}`);
  }
}
