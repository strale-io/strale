/**
 * POST /v1/transactions/:id/dispute — GDPR Art. 22(3) dispute intake
 *
 * The cert-audit (2026-04-30) flagged that DEC-20260428-B requires a
 * dispute endpoint for compliance capabilities — customers must be able
 * to programmatically challenge a flagged result. Without this, Strale
 * supports the controller's Art. 22 "right to obtain human intervention"
 * obligation only out-of-band (email petter@strale.io), which an
 * auditor will ding.
 *
 * Storage only in v1: the endpoint records the dispute in
 * dispute_requests; an admin reviews disposition out-of-band. Future
 * v1.1 work adds an admin review surface, email notifications, and
 * dispute-state webhooks.
 *
 * Auth: same as /v1/transactions/:id — accepts an authenticated bearer
 * token (the API caller is usually the controller submitting on behalf
 * of the data subject) OR a signed audit token (?token=...) so an
 * anonymous data subject who received a shareable audit URL can also
 * dispute. The signed-token path requires a contact_email so we can
 * reach the data subject for follow-up.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities, disputeRequests } from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { apiError } from "../lib/errors.js";
import { verifyAuditToken } from "../lib/audit-token.js";
import { logWarn } from "../lib/log.js";
import { sendAlert } from "../lib/alerting.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import type { AppEnv } from "../types.js";

export const disputeRoute = new Hono<AppEnv>();

const MAX_REASON_LENGTH = 4000;

interface DisputeBody {
  reason?: unknown;
  affected_field?: unknown;
  contact_email?: unknown;
}

function validateEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return null;
  // Conservative shape check; the column has no MX gate. The dispute
  // workflow is admin-reviewed so a typo gets caught downstream rather
  // than failing here.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

disputeRoute.post("/:transactionId/dispute", async (c) => {
  const transactionId = c.req.param("transactionId");
  const token = c.req.query("token");
  const expiresAtRaw = c.req.query("expires_at");

  // Try authenticated path first; fall back to signed token.
  // We can't run authMiddleware as a route-level middleware because that
  // would 401 anonymous-but-token-bearing requests. Manually invoke.
  let userId: string | null = null;
  const authHeader = c.req.header("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    // Delegate to authMiddleware via a one-off invocation pattern.
    // If the bearer is malformed, fall through to token path; if it's
    // a valid API key, capture the user_id.
    let authOk = false;
    await authMiddleware(c, async () => {
      authOk = true;
    });
    if (authOk) {
      const user = c.get("user") as { id: string } | undefined;
      if (user) userId = user.id;
    }
  }

  // If no authenticated user, require a valid signed audit token.
  if (!userId) {
    if (!token) {
      return c.json(
        apiError(
          "unauthorized",
          "Either an Authorization: Bearer header (account holder) or a ?token=... signed audit token (anonymous data subject with a shareable URL) is required.",
        ),
        401,
      );
    }
    let expiresAt: number | null = null;
    if (expiresAtRaw != null) {
      const parsed = parseInt(expiresAtRaw, 10);
      if (!Number.isFinite(parsed) || String(parsed) !== expiresAtRaw) {
        return c.json(apiError("invalid_request", "expires_at must be an integer (unix seconds)."), 400);
      }
      expiresAt = parsed;
    }
    const verify = verifyAuditToken(transactionId, token, expiresAt);
    if (!verify.valid) {
      const reason = verify.reason;
      const code = reason === "expired" ? "token_expired" : reason === "legacy_token_sunset" ? "legacy_token_sunset" : "unauthorized";
      return c.json(apiError(code, `Audit token ${reason}.`), 401);
    }
  }

  // Parse + validate body.
  const body = (await c.req.json().catch(() => null)) as DisputeBody | null;
  if (!body || typeof body.reason !== "string") {
    return c.json(
      apiError("invalid_request", "JSON body required: { reason: string, affected_field?: string, contact_email?: string }"),
      400,
    );
  }
  const reason = body.reason.trim();
  if (reason.length === 0) {
    return c.json(apiError("invalid_request", "reason is required."), 400);
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return c.json(
      apiError("invalid_request", `reason exceeds ${MAX_REASON_LENGTH} chars (got ${reason.length}). Trim and retry.`),
      400,
    );
  }
  const affectedField = typeof body.affected_field === "string" && body.affected_field.trim().length > 0
    ? body.affected_field.trim().slice(0, 255)
    : null;
  const contactEmail = validateEmail(body.contact_email);

  // Anonymous (token-only) path requires contact_email — there's no other
  // way for the admin to follow up. Authenticated path can fall back to
  // the account holder's email.
  if (!userId && !contactEmail) {
    return c.json(
      apiError(
        "invalid_request",
        "contact_email is required when disputing via signed token (no account on file).",
      ),
      400,
    );
  }

  const db = getDb();

  // Verify the transaction exists + grab capability slug for alerting.
  // The capability slug isn't stored on dispute_requests (the
  // transaction reference is the link), but it's the most useful
  // human-readable identifier for the alert subject line.
  const [txn] = await db
    .select({
      id: transactions.id,
      capabilityId: transactions.capabilityId,
      capabilitySlug: capabilities.slug,
    })
    .from(transactions)
    .leftJoin(capabilities, eq(capabilities.id, transactions.capabilityId))
    .where(eq(transactions.id, transactionId))
    .limit(1);
  if (!txn) {
    return c.json(apiError("not_found", `No transaction ${transactionId}.`), 404);
  }

  // Insert.
  const [dispute] = await db
    .insert(disputeRequests)
    .values({
      transactionId,
      userId,
      reason,
      affectedField,
      contactEmail,
    })
    .returning({ id: disputeRequests.id, submittedAt: disputeRequests.submittedAt });

  logWarn(
    "dispute-received",
    `Dispute submitted for transaction ${transactionId}`,
    {
      dispute_id: dispute.id,
      transaction_id: transactionId,
      user_id: userId,
      affected_field: affectedField,
      anonymous: userId === null,
    },
  );

  // Email notification — fire-and-forget so a Resend outage doesn't
  // fail the dispute submission. The structured log line above is the
  // authoritative event trail; the email is operator convenience.
  // 30-day SLA (Art. 22(3)) starts now from the dispute's submitted_at;
  // the alert exists so an operator notices within hours, not the
  // 30-day deadline. Severity = warning (not critical) — disputes are
  // expected operational events, not incidents.
  fireAndForget(
    () => sendAlert({
      severity: "warning",
      subject: `Dispute received — ${txn.capabilitySlug ?? "unknown capability"} (txn ${transactionId.slice(0, 8)})`,
      body: [
        `A new dispute was submitted under GDPR Art. 22(3) (right to obtain human intervention).`,
        ``,
        `Dispute ID:       ${dispute.id}`,
        `Transaction ID:   ${transactionId}`,
        `Capability:       ${txn.capabilitySlug ?? "(unknown)"}`,
        `Submitted at:     ${dispute.submittedAt.toISOString()}`,
        `Submitter:        ${userId ? `account user ${userId}` : "anonymous (signed audit token)"}`,
        `Contact email:    ${contactEmail ?? "(account holder; lookup via user_id)"}`,
        `Affected field:   ${affectedField ?? "(none specified — full-record dispute)"}`,
        ``,
        `Reason given:`,
        reason,
        ``,
        `Review at:        ${process.env.ADMIN_DASHBOARD_URL ?? "https://strale.dev"}/admin/disputes/${dispute.id}`,
        `Or via DB:        SELECT * FROM dispute_requests WHERE id = '${dispute.id}';`,
        ``,
        `30-day SLA: respond by ${new Date(dispute.submittedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)} (Art. 22(3) statutory).`,
      ].join("\n"),
    }),
    { label: "dispute-alert-email", context: { dispute_id: dispute.id } },
  );

  return c.json(
    {
      dispute_id: dispute.id,
      transaction_id: transactionId,
      submitted_at: dispute.submittedAt.toISOString(),
      status: "received",
      next_steps:
        "A Strale operator reviews disputes within 30 days under GDPR Art. 22(3) (right to obtain human intervention). " +
        "We will contact you at the supplied email (or the account holder's email) with the disposition. " +
        "Acknowledge receipt by quoting the dispute_id; the audit chain row remains intact and visible at /audit/" + transactionId + ".",
      contact: "petter@strale.io",
    },
    202,
  );
});

// GET /v1/transactions/:id/dispute — list existing disputes for a
// transaction. Same auth shape as POST. Useful for a customer who
// already submitted a dispute and wants to check status.
disputeRoute.get("/:transactionId/dispute", async (c) => {
  const transactionId = c.req.param("transactionId");
  const token = c.req.query("token");
  const expiresAtRaw = c.req.query("expires_at");

  let authOk = false;
  const authHeader = c.req.header("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    await authMiddleware(c, async () => {
      authOk = true;
    });
  }

  if (!authOk) {
    if (!token) {
      return c.json(apiError("unauthorized", "Authorization or ?token=... required."), 401);
    }
    let expiresAt: number | null = null;
    if (expiresAtRaw != null) {
      const parsed = parseInt(expiresAtRaw, 10);
      if (!Number.isFinite(parsed) || String(parsed) !== expiresAtRaw) {
        return c.json(apiError("invalid_request", "expires_at must be an integer."), 400);
      }
      expiresAt = parsed;
    }
    const verify = verifyAuditToken(transactionId, token, expiresAt);
    if (!verify.valid) return c.json(apiError("unauthorized", `Audit token ${verify.reason}.`), 401);
  }

  const db = getDb();
  const rows = await db
    .select({
      id: disputeRequests.id,
      submittedAt: disputeRequests.submittedAt,
      affectedField: disputeRequests.affectedField,
      disposition: disputeRequests.disposition,
      dispositionAt: disputeRequests.dispositionAt,
      dispositionNotes: disputeRequests.dispositionNotes,
    })
    .from(disputeRequests)
    .where(eq(disputeRequests.transactionId, transactionId));

  return c.json({
    transaction_id: transactionId,
    disputes: rows.map((r) => ({
      dispute_id: r.id,
      submitted_at: r.submittedAt.toISOString(),
      affected_field: r.affectedField,
      disposition: r.disposition,
      disposition_at: r.dispositionAt ? r.dispositionAt.toISOString() : null,
      disposition_notes: r.dispositionNotes,
    })),
  });
});

// `capabilities` is now used by the leftJoin in the POST handler
// (capability slug for the alert subject); the previous void-suppress
// shim is no longer needed.
