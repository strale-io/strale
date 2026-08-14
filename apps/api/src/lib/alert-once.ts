/**
 * Deduplicated alerting with a cooldown that survives process restarts.
 *
 * Incident 2026-08-14: the x402 settlement tripwire fired five identical
 * CRITICAL emails in ninety minutes. Its cooldown was a module-level
 * `lastAlertAt` timestamp, and every Railway redeploy reset it — so during a
 * deploy-heavy morning the cooldown was effectively absent. Repeated
 * identical pages are worse than none: they train the reader to filter the
 * alert that matters.
 *
 * The cooldown therefore lives in the database, keyed by an alert identity
 * string. `health_monitor_events` is reused as the ledger (capability_slug is
 * nullable for platform-level events) so every page is also an audit record
 * of when the platform noticed something.
 *
 * The DB check is best-effort: if it fails, the alert is still sent. A
 * duplicate page is a smaller failure than a silent one.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { sendAlert } from "./alerting.js";
import { log, logError } from "./log.js";

const EVENT_TYPE = "alert_sent";

/** Has this alert key been sent inside the cooldown window? */
async function recentlyAlerted(key: string, cooldownMs: number): Promise<boolean> {
  try {
    const seconds = Math.max(1, Math.round(cooldownMs / 1000));
    const rows = await getDb().execute(sql`
      SELECT 1
        FROM health_monitor_events
       WHERE event_type = ${EVENT_TYPE}
         AND details->>'alert_key' = ${key}
         AND created_at > now() - make_interval(secs => ${seconds})
       LIMIT 1
    `);
    return (rows as unknown as unknown[]).length > 0;
  } catch (err) {
    // Fail open — see the module note.
    logError("alert-once-cooldown-check-failed", err, { alert_key: key });
    return false;
  }
}

async function recordAlert(key: string, subject: string, severity: string): Promise<void> {
  try {
    await getDb().execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details)
      VALUES (
        ${EVENT_TYPE},
        NULL,
        0,
        ${`alert sent: ${subject}`.slice(0, 500)},
        ${JSON.stringify({ alert_key: key, severity, subject })}::jsonb
      )
    `);
  } catch (err) {
    logError("alert-once-record-failed", err, { alert_key: key });
  }
}

/**
 * Send an alert at most once per cooldown window, across restarts and replicas.
 *
 * @param key - stable identity for this alert condition (not the message text,
 *   which usually carries changing numbers). Same key = same condition.
 * @returns true if an alert was sent, false if suppressed or send failed.
 */
export async function alertOnce(
  key: string,
  cooldownMs: number,
  opts: { subject: string; body: string; severity: "info" | "warning" | "critical" },
): Promise<boolean> {
  if (await recentlyAlerted(key, cooldownMs)) {
    log.info(
      { label: "alert-suppressed-cooldown", alert_key: key, severity: opts.severity },
      "alert-suppressed-cooldown",
    );
    return false;
  }

  const sent = await sendAlert(opts);
  // Record on attempt, not only on success: a Resend outage would otherwise
  // let every subsequent tick retry the send and re-page once it recovers.
  await recordAlert(key, opts.subject, opts.severity);
  return sent;
}
