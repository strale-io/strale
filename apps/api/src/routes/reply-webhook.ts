/**
 * Reply Webhook — HM-4
 *
 * POST /v1/internal/health-monitor/reply
 *
 * Receives inbound emails forwarded from the health-monitor@strale.io address
 * (via Cloudflare Email Workers, SendGrid Inbound Parse, or another forwarder),
 * parses the reply keyword, and executes the corresponding action.
 *
 * Supported keywords:
 *   APPROVE-N    → approve Tier 3 proposal #N
 *   REJECT-N     → reject Tier 3 proposal #N
 *   ACKNOWLEDGE-N → acknowledge finding #N (add to backlog, no action)
 *   KEEP         → override a suspension warning (capability stays degraded)
 *   RESTORE slug → restore capability to validating state
 *
 * Security:
 *   - Sender must match HEALTH_DIGEST_EMAIL (configurable via env)
 *   - Optional X-Webhook-Secret header for added protection
 *   - Rate limited: max 10 actions per hour
 *   - All actions logged to health_monitor_events with human_override=true
 *
 * Payload (JSON):
 *   { from: string, subject: string, text: string, html?: string }
 *
 * This format is compatible with:
 *   - Cloudflare Email Workers (extract with postal-mime or manual parsing)
 *   - SendGrid Inbound Parse (maps directly to their fields)
 *   - Any custom email forwarder
 *
 * Env vars:
 *   HEALTH_DIGEST_EMAIL      — authorized sender (e.g. petter@strale.io)
 *   HEALTH_MONITOR_INBOUND   — inbound address for Reply-To (e.g. health-monitor@strale.io)
 *   REPLY_WEBHOOK_SECRET     — optional shared secret for X-Webhook-Secret header
 */

import { Hono } from "hono";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, healthMonitorEvents } from "../db/schema.js";
import { logHealthEvent } from "../lib/health-monitor.js";
import { parseReplyAction } from "../lib/reply-parser.js";
import { sendDigestEmail, isEmailConfigured } from "../lib/digest-sender.js";
import { logError } from "../lib/log.js";
import type { AppEnv } from "../types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const RATE_LIMIT_PER_HOUR = 10;

// ─── Route ────────────────────────────────────────────────────────────────────

export const replyWebhookRoute = new Hono<AppEnv>();

replyWebhookRoute.post("/health-monitor/reply", async (c) => {
  // ── Optional webhook secret ───────────────────────────────────────────────
  const webhookSecret = process.env.REPLY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const provided = c.req.header("X-Webhook-Secret");
    if (provided !== webhookSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { from?: string; subject?: string; text?: string; html?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const from: string = (body.from ?? "").toLowerCase().trim();
  const subject: string = body.subject ?? "";
  const text: string = body.text ?? "";

  if (!from) {
    return c.json({ error: "Missing 'from' field" }, 400);
  }

  // ── Sender verification (security-critical) ───────────────────────────────
  const authorizedSender = (process.env.HEALTH_DIGEST_EMAIL ?? "admin@strale.io").toLowerCase().trim();
  if (from !== authorizedSender) {
    c.get("log").warn(
      { label: "reply-webhook-unauthorized", from },
      "reply-webhook-unauthorized",
    );
    // Return 200 to prevent email service retries — we just silently reject
    return c.json({ received: true, processed: false, reason: "sender not authorized" });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const db = getDb();
  const oneHourAgo = new Date(Date.now() - 3600_000);
  const recentActions = await db
    .select({ id: healthMonitorEvents.id })
    .from(healthMonitorEvents)
    .where(
      and(
        eq(healthMonitorEvents.eventType, "reply_action"),
        gte(healthMonitorEvents.createdAt, oneHourAgo),
      ),
    )
    .limit(RATE_LIMIT_PER_HOUR + 1);

  if (recentActions.length >= RATE_LIMIT_PER_HOUR) {
    c.get("log").warn({ label: "reply-webhook-rate-limited" }, "reply-webhook-rate-limited");
    await sendConfirmation(
      "⚠️ Rate limit exceeded",
      `More than ${RATE_LIMIT_PER_HOUR} reply actions were received in the last hour. This one was ignored. Wait 1 hour and try again.`,
    );
    return c.json({ received: true, processed: false, reason: "rate_limited" });
  }

  // ── Parse action ──────────────────────────────────────────────────────────
  const parsed = parseReplyAction(text);

  c.get("log").info(
    { label: "reply-webhook-received", from, action: parsed.action, identifier: parsed.identifier, slug: parsed.slug },
    "reply-webhook-received",
  );

  // Log the raw reply for audit / debugging
  await logHealthEvent({
    eventType: "reply_action",
    tier: 2,
    actionTaken: `Reply received: action=${parsed.action}${parsed.identifier ? `(${parsed.identifier})` : ""}${parsed.slug ? ` slug=${parsed.slug}` : ""}`,
    details: {
      from,
      subject,
      action: parsed.action,
      identifier: parsed.identifier,
      slug: parsed.slug,
      cleaned_text: parsed.cleanedText,
    },
    humanOverride: true,
  });

  // ── Execute action ────────────────────────────────────────────────────────
  switch (parsed.action) {
    case "approve":
      await handleApprove(parsed.identifier!, subject);
      break;
    case "reject":
      await handleReject(parsed.identifier!, subject);
      break;
    case "acknowledge":
      await handleAcknowledge(parsed.identifier!, subject);
      break;
    case "keep":
      await handleKeep(subject);
      break;
    case "restore":
      await handleRestore(parsed.slug!, subject);
      break;
    case "unknown":
      await sendConfirmation(
        "❓ Unrecognized command",
        `I couldn't parse your reply. Valid commands:\n\n` +
        `  APPROVE-N — approve Tier 3 proposal #N\n` +
        `  REJECT-N  — reject Tier 3 proposal #N\n` +
        `  ACKNOWLEDGE-N — acknowledge finding #N\n` +
        `  KEEP — override suspension warning\n` +
        `  RESTORE [slug] — restore capability to validating\n\n` +
        `Your message (cleaned):\n${parsed.cleanedText || "(empty)"}`,
      );
      break;
  }

  return c.json({ received: true, processed: true, action: parsed.action });
});

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleApprove(n: number, _subject: string): Promise<void> {
  const proposal = await getNthPendingProposal(n);

  if (!proposal) {
    await sendConfirmation(
      `❌ APPROVE-${n} failed`,
      `Proposal #${n} not found. There may be fewer than ${n} pending proposals, or all have already been resolved.\n\nCheck the next digest for the current list.`,
    );
    return;
  }

  // Mark as approved
  await logHealthEvent({
    eventType: "proposal_approved",
    capabilitySlug: proposal.capabilitySlug ?? undefined,
    tier: 3,
    actionTaken: `Approved proposal #${n}: ${proposal.actionTaken}`,
    details: {
      proposal_id: proposal.id,
      proposal_number: n,
      proposal_description: proposal.actionTaken,
      triggered_by: "email_reply",
    },
    humanOverride: true,
  });

  // Try to execute the proposed action if it has a known action_type
  const details = (proposal.details as Record<string, unknown>) ?? {};
  const actionType = details.action_type as string | undefined;
  let executionNote = "Approval logged. Manual execution may be required.";

  if (actionType === "remove_field_assertion" && details.test_suite_id && details.field) {
    executionNote = await executeRemoveFieldAssertion(
      String(details.test_suite_id),
      String(details.field),
      proposal.capabilitySlug ?? "unknown",
    );
  }

  await sendConfirmation(
    `✅ Approved: proposal #${n}`,
    `Proposal #${n} approved.\n\nDescription: ${proposal.actionTaken}\n\n${executionNote}`,
  );
}

async function handleReject(n: number, _subject: string): Promise<void> {
  const proposal = await getNthPendingProposal(n);

  if (!proposal) {
    await sendConfirmation(
      `❌ REJECT-${n} failed`,
      `Proposal #${n} not found. There may be fewer than ${n} pending proposals, or all have already been resolved.`,
    );
    return;
  }

  await logHealthEvent({
    eventType: "proposal_rejected",
    capabilitySlug: proposal.capabilitySlug ?? undefined,
    tier: 3,
    actionTaken: `Rejected proposal #${n}: ${proposal.actionTaken}`,
    details: {
      proposal_id: proposal.id,
      proposal_number: n,
      proposal_description: proposal.actionTaken,
      triggered_by: "email_reply",
    },
    humanOverride: true,
  });

  await sendConfirmation(
    `❌ Rejected: proposal #${n}`,
    `Proposal #${n} rejected.\n\nDescription: ${proposal.actionTaken}\n\nThis proposal is archived and will not be re-proposed.`,
  );
}

async function handleAcknowledge(n: number, _subject: string): Promise<void> {
  const proposal = await getNthPendingProposal(n);

  if (!proposal) {
    await sendConfirmation(
      `❌ ACKNOWLEDGE-${n} failed`,
      `Proposal #${n} not found. There may be fewer than ${n} pending proposals.`,
    );
    return;
  }

  await logHealthEvent({
    eventType: "proposal_acknowledged",
    capabilitySlug: proposal.capabilitySlug ?? undefined,
    tier: 3,
    actionTaken: `Acknowledged finding #${n}: ${proposal.actionTaken}`,
    details: {
      proposal_id: proposal.id,
      proposal_number: n,
      proposal_description: proposal.actionTaken,
      triggered_by: "email_reply",
    },
    humanOverride: true,
  });

  await sendConfirmation(
    `📋 Acknowledged: finding #${n}`,
    `Finding #${n} acknowledged and added to backlog.\n\nDescription: ${proposal.actionTaken}\n\nNo action taken. This finding will appear in the next digest as "acknowledged, pending resolution".`,
  );
}

async function handleKeep(subject: string): Promise<void> {
  // Try to identify capability from the email subject
  const slug = extractSlugFromSuspensionSubject(subject) ?? await getMostRecentSuspensionWarningSlug();

  if (!slug) {
    await sendConfirmation(
      "⚠️ KEEP: capability not identified",
      `I couldn't identify which capability to keep.\n\nTo keep a specific capability, reply with:\n  RESTORE [slug]\n\nOr check the suspension warning email for the capability slug.`,
    );
    return;
  }

  // Verify the capability exists and is degraded
  const db = getDb();
  const [cap] = await db
    .select({ slug: capabilities.slug, lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap || cap.lifecycleState !== "degraded") {
    const state = cap ? `lifecycle_state='${cap.lifecycleState}'` : "not found";
    await sendConfirmation(
      `⚠️ KEEP: ${slug} not in degraded state`,
      `Could not apply KEEP to '${slug}': ${state}.\n\nKEEP only applies to capabilities in 'degraded' state that are about to be suspended.`,
    );
    return;
  }

  // Log a suspension override. The lifecycle manager checks for this event
  // within the last 24h before applying auto-suspension.
  await logHealthEvent({
    eventType: "suspension_override",
    capabilitySlug: slug,
    tier: 2,
    actionTaken: `Suspension overridden by founder — capability '${slug}' stays in degraded state`,
    details: {
      override_type: "keep",
      override_expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      triggered_by: "email_reply",
    },
    humanOverride: true,
  });

  await sendConfirmation(
    `🛡️ Kept: ${slug}`,
    `'${slug}' will remain in degraded state. Auto-suspension timer reset for 24 hours.\n\nNext steps:\n- Investigate why SQS is below 25\n- Fix the underlying issue and use RESTORE ${slug} when ready\n- If you want to suspend it manually: RESTORE will put it in validating, or use the admin API`,
  );
}

async function handleRestore(slug: string, _subject: string): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select({ slug: capabilities.slug, lifecycleState: capabilities.lifecycleState, isActive: capabilities.isActive })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    await sendConfirmation(
      `❌ RESTORE failed: ${slug}`,
      `Capability '${slug}' not found. Check the slug and try again.\n\nTo list all capabilities, run:\n  curl /v1/capabilities | jq '[.[].slug]'`,
    );
    return;
  }

  if (!cap.isActive) {
    await sendConfirmation(
      `❌ RESTORE failed: ${slug}`,
      `Capability '${slug}' is deactivated (isActive=false). Cannot restore an inactive capability.`,
    );
    return;
  }

  const fromState = cap.lifecycleState;

  await db
    .update(capabilities)
    .set({ lifecycleState: "validating", visible: false, updatedAt: new Date() })
    .where(eq(capabilities.slug, slug));

  await logHealthEvent({
    eventType: "lifecycle_transition",
    capabilitySlug: slug,
    tier: 2,
    actionTaken: `${fromState} → validating: restored via email reply`,
    details: {
      from: fromState,
      to: "validating",
      reason: "restored by founder via email reply",
      triggered_by: "email_reply",
    },
    humanOverride: true,
  });

  await sendConfirmation(
    `🔄 Restoring: ${slug}`,
    `'${slug}' has re-entered the validation pipeline.\n\nPrevious state: ${fromState}\nNew state: validating (hidden from catalog)\n\nQualification timeline:\n- At Tier A (6h cadence): ~30 hours to qualify\n- At Tier B (24h cadence): ~5 days to qualify\n\nYou'll see progress in the next weekly digest.`,
  );
}

// ─── Proposal lookup ──────────────────────────────────────────────────────────

type ProposalRow = typeof healthMonitorEvents.$inferSelect;

async function getNthPendingProposal(n: number): Promise<ProposalRow | null> {
  const db = getDb();

  const allProposals = await db
    .select()
    .from(healthMonitorEvents)
    .where(eq(healthMonitorEvents.eventType, "proposal_created"))
    .orderBy(healthMonitorEvents.createdAt);

  if (allProposals.length === 0) return null;

  const proposalIds = allProposals.map((p) => p.id);

  // Find already-resolved proposals
  const resolved = await db.execute(sql`
    SELECT details->>'proposal_id' AS proposal_id
    FROM health_monitor_events
    WHERE event_type IN ('proposal_approved', 'proposal_rejected')
      AND details->>'proposal_id' = ANY(${proposalIds})
  `);
  const resolvedRows = (Array.isArray(resolved) ? resolved : (resolved as any)?.rows ?? []) as any[];
  const resolvedIds = new Set(resolvedRows.map((r: any) => r.proposal_id));

  const pending = allProposals.filter((p) => !resolvedIds.has(p.id));
  return pending[n - 1] ?? null; // n is 1-based
}

// ─── Subject / slug helpers ───────────────────────────────────────────────────

/**
 * Extract capability slug from a suspension warning subject line.
 * Input:  "Re: ⚠️ norwegian-company-data will be suspended in 24h"
 * Output: "norwegian-company-data"
 */
function extractSlugFromSuspensionSubject(subject: string): string | null {
  // Match: word(s) before "will be suspended"
  const m = subject.match(/(\S+)\s+will be suspended/i);
  if (!m) return null;
  // Strip emoji characters from the start
  const slug = m[1].replace(/[^\w-]/g, "");
  return slug.length > 0 ? slug.toLowerCase() : null;
}

/**
 * Fall back to the most recent suspension_warning interrupt event (within 48h).
 */
async function getMostRecentSuspensionWarningSlug(): Promise<string | null> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 48 * 3600_000);

  const rows = await db
    .select({ capabilitySlug: healthMonitorEvents.capabilitySlug })
    .from(healthMonitorEvents)
    .where(
      and(
        eq(healthMonitorEvents.eventType, "interrupt_sent"),
        gte(healthMonitorEvents.createdAt, cutoff),
        sql`${healthMonitorEvents.details}->>'interrupt_type' = 'suspension_warning'`,
      ),
    )
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(1);

  return rows[0]?.capabilitySlug ?? null;
}

// ─── Proposal action execution ────────────────────────────────────────────────

/**
 * Attempt to execute a "remove_field_assertion" proposal.
 * Returns a string describing what happened.
 */
async function executeRemoveFieldAssertion(
  testSuiteId: string,
  field: string,
  capabilitySlug: string,
): Promise<string> {
  try {
    const db = getDb();
    const { testSuites } = await import("../db/schema.js");

    const [suite] = await db
      .select()
      .from(testSuites)
      .where(eq(testSuites.id, testSuiteId))
      .limit(1);

    if (!suite) return `⚠️ Test suite ${testSuiteId} not found — manual fix needed.`;

    // Remove the field from validationRules
    const rules = (suite.validationRules as Record<string, unknown>) ?? {};
    const requiredFields = (rules.required_fields as string[] | undefined) ?? [];
    const updatedFields = requiredFields.filter((f) => f !== field);

    if (updatedFields.length === requiredFields.length) {
      return `Field '${field}' was not in required_fields — nothing changed.`;
    }

    await db
      .update(testSuites)
      .set({
        validationRules: { ...rules, required_fields: updatedFields },
        updatedAt: new Date(),
      })
      .where(eq(testSuites.id, testSuiteId));

    await logHealthEvent({
      eventType: "auto_fix",
      capabilitySlug,
      tier: 3,
      actionTaken: `Removed field '${field}' from test suite assertions (approved by founder)`,
      details: {
        test_suite_id: testSuiteId,
        field_removed: field,
        fields_remaining: updatedFields,
        triggered_by: "proposal_approved",
      },
      humanOverride: true,
    });

    return `✅ Executed: removed field '${field}' from test assertions. Coverage reduced from ${requiredFields.length} to ${updatedFields.length} fields.`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("reply-webhook-remove-field-failed", err);
    return `⚠️ Execution failed: ${msg}. Manual fix needed.`;
  }
}

// ─── Confirmation email ───────────────────────────────────────────────────────

async function sendConfirmation(subject: string, body: string): Promise<void> {
  if (!isEmailConfigured()) return;

  const to = process.env.HEALTH_DIGEST_EMAIL ?? "admin@strale.io";
  const timestamp = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Stockholm",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " CET";

  const escapedBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:20px 28px;">
    <p style="margin:0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">STRALE REPLY-TO-ACT</p>
    <h1 style="margin:4px 0 0;color:#ffffff;font-size:18px;font-weight:700;">${subject}</h1>
    <p style="margin:6px 0 0;color:#94a3b8;font-size:12px;">${timestamp}</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${escapedBody}</p>
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">Strale Platform Health Monitor — reply-to-act</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  try {
    await sendDigestEmail(html, subject, to);
  } catch (err) {
    logError("reply-webhook-confirmation-failed", err, { subject });
  }
}
