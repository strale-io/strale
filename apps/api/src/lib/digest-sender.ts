/**
 * Digest Email Sender — HM-2
 *
 * Sends the compiled HTML digest via Resend.
 * Requires: RESEND_API_KEY and HEALTH_DIGEST_EMAIL env vars.
 */

import { Resend } from "resend";
import { log } from "./log.js";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

/**
 * Send the weekly digest (or any platform health email) via Resend.
 * Throws if RESEND_API_KEY is not configured or the send fails.
 *
 * @param html     - HTML email body
 * @param subject  - Email subject
 * @param toOverride - Optional recipient override (defaults to HEALTH_DIGEST_EMAIL)
 */
export async function sendDigestEmail(html: string, subject: string, toOverride?: string): Promise<void> {
  const resend = getResend();

  const to = toOverride ?? process.env.HEALTH_DIGEST_EMAIL ?? "admin@strale.io";
  const from = process.env.HEALTH_DIGEST_FROM ?? "Strale Health Monitor <noreply@strale.io>";

  // Reply-To: the inbound address so email replies hit the webhook
  const replyTo = process.env.HEALTH_MONITOR_INBOUND;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  log.info({ label: "digest-sender-sent", subject, to }, "digest-sender-sent");
}

/**
 * Check whether the email sender is configured (non-throwing).
 * Used by the endpoint to give a helpful error message.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}
