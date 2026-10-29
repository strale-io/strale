/**
 * Completion callbacks for async jobs (portfolio plan 2.11).
 *
 * A caller that passes `callback_url` to POST /v1/do on an async capability
 * gets one signed POST when the job reaches a terminal state, whether it
 * completed, failed, or was failed by the reservation reconciler after a
 * crash. The poll endpoint stays the source of truth: the callback carries no
 * output, only the job id, its status and where to read it, so a leaked or
 * mis-routed callback discloses nothing a stranger could use.
 *
 * Delivery properties:
 *  - Signed: `Strale-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>` over
 *    `<t>.<raw body>`, keyed by the caller's webhook secret
 *    (GET /v1/jobs/webhook-secret). `Strale-Event-Id` is the transaction id
 *    and is stable across retries, for deduplication.
 *  - Retried: a non-2xx answer, a timeout or a network error schedules the
 *    next attempt on RETRY_DELAYS_SECONDS.
 *  - Bounded: at most MAX_ATTEMPTS attempts, each with a DELIVERY_TIMEOUT_MS
 *    budget and no redirects followed; the URL is SSRF-validated when it is
 *    accepted and again on every attempt (safeFetch).
 *  - Exactly one sender per attempt: an attempt first claims the row with a
 *    conditional UPDATE that pushes next_attempt_at out by a lease, so the
 *    immediate attempt after completion and the worker tick cannot both send.
 */
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";

import { jobCallbacks } from "../../db/schema.js";
import { deriveSubkey } from "../audit-token.js";
import { safeFetch } from "../safe-fetch.js";
import { UrlValidationError, validateUrl } from "../url-validator.js";
import { logWarn } from "../log.js";

export const MAX_ATTEMPTS = 6;
/** Delay before attempt n+1, indexed by attempts already made (1-based). */
export const RETRY_DELAYS_SECONDS = [30, 120, 600, 3_600, 6 * 3_600] as const;
export const DELIVERY_TIMEOUT_MS = 10_000;
/** A claimed attempt's lease; longer than DELIVERY_TIMEOUT_MS. */
const CLAIM_LEASE_SECONDS = 60;
const MAX_URL_LENGTH = 2048;

// ─── Accepting a callback URL ───────────────────────────────────────────────

/** Returns an error message, or null when the URL is acceptable. */
export async function checkCallbackUrl(url: unknown): Promise<string | null> {
  if (typeof url !== "string" || url.length === 0) return "'callback_url' must be a non-empty string.";
  if (url.length > MAX_URL_LENGTH) return `'callback_url' must be at most ${MAX_URL_LENGTH} characters.`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "'callback_url' is not a valid URL.";
  }
  if (parsed.protocol !== "https:") return "'callback_url' must use https.";
  if (parsed.username || parsed.password) return "'callback_url' must not carry credentials.";
  try {
    await validateUrl(url);
  } catch (err) {
    if (err instanceof UrlValidationError) return `'callback_url' is not allowed: ${err.message}`;
    return "'callback_url' could not be validated.";
  }
  return null;
}

// ─── Signing ────────────────────────────────────────────────────────────────

let callbackKey: Buffer | null = null;

/** The caller's webhook signing secret. Derived, never stored. */
export function webhookSecretFor(userId: string): string {
  callbackKey ??= deriveSubkey("job-webhook/v1");
  return `whsec_${createHmac("sha256", callbackKey).update(userId).digest("hex")}`;
}

export function signCallback(secret: string, timestampSeconds: number, body: string): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

// ─── Enqueue ────────────────────────────────────────────────────────────────

/**
 * Record the callback in the job's setup transaction. It becomes deliverable
 * when the transaction row is terminal; no second write is needed then, which
 * is what makes the reconciler's crash-recovery path call back too.
 */
export async function enqueueCallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a db or a transaction
  tx: { insert: (...args: any[]) => any },
  row: { transactionId: string; userId: string; url: string },
): Promise<void> {
  await tx.insert(jobCallbacks).values({
    transactionId: row.transactionId,
    userId: row.userId,
    url: row.url,
    state: "pending",
    nextAttemptAt: new Date(0),
  });
}

// ─── Delivery ───────────────────────────────────────────────────────────────

type Exec = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

interface ClaimedCallback {
  transaction_id: string;
  user_id: string;
  url: string;
  attempts: number;
  status: string;
  completed_at: string | null;
  capability_slug: string | null;
}

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows?: T[] })?.rows ?? []) as T[];
}

/**
 * Claim up to `limit` due callbacks whose job is terminal. `transactionId`
 * narrows it to one (the immediate attempt after completion). Claiming
 * increments `attempts` and leases the row, so a crash mid-send still counts
 * against MAX_ATTEMPTS and the row comes back after the lease.
 */
export async function claimDueCallbacks(db: Exec, limit: number, transactionId?: string): Promise<ClaimedCallback[]> {
  const only = transactionId ? sql`AND c.transaction_id = ${transactionId}` : sql``;
  const result = await db.execute(sql`
    UPDATE job_callbacks AS jc
    SET attempts = jc.attempts + 1,
        next_attempt_at = now() + make_interval(secs => ${CLAIM_LEASE_SECONDS})
    FROM (
      SELECT c.transaction_id, t.status, t.completed_at, cap.slug
      FROM job_callbacks c
      JOIN transactions t ON t.id = c.transaction_id
      LEFT JOIN capabilities cap ON cap.id = t.capability_id
      WHERE c.state = 'pending'
        AND c.next_attempt_at <= now()
        AND t.status IN ('completed', 'failed')
        ${only}
      ORDER BY c.next_attempt_at
      LIMIT ${limit}
      FOR UPDATE OF c SKIP LOCKED
    ) AS due
    WHERE jc.transaction_id = due.transaction_id
    RETURNING jc.transaction_id, jc.user_id, jc.url, jc.attempts,
              due.status, due.completed_at, due.slug AS capability_slug
  `);
  return rowsOf<ClaimedCallback>(result);
}

export function callbackBody(row: ClaimedCallback): string {
  return JSON.stringify({
    event: row.status === "completed" ? "job.completed" : "job.failed",
    transaction_id: row.transaction_id,
    status: row.status,
    capability_slug: row.capability_slug,
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    poll_url: `/v1/transactions/${row.transaction_id}`,
  });
}

export type CallbackFetch = (url: string, init: RequestInit) => Promise<Response>;

const defaultFetch: CallbackFetch = (url, init) =>
  safeFetch(url, { ...init, maxRedirects: 0, returnOnRedirectCap: true, timeoutMs: DELIVERY_TIMEOUT_MS });

export interface DeliveryOutcome {
  transactionId: string;
  state: "delivered" | "pending" | "failed";
  statusCode: number | null;
}

/** Send one claimed callback and record the result. Never throws. */
export async function sendClaimed(
  db: Exec,
  row: ClaimedCallback,
  fetchImpl: CallbackFetch = defaultFetch,
  nowMs: number = Date.now(),
): Promise<DeliveryOutcome> {
  const body = callbackBody(row);
  const t = Math.floor(nowMs / 1000);
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetchImpl(row.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Strale-Webhooks/1",
        "Strale-Event-Id": row.transaction_id,
        "Strale-Signature": signCallback(webhookSecretFor(row.user_id), t, body),
      },
      body,
    });
    statusCode = res.status;
    await res.body?.cancel().catch(() => undefined);
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 300) : "delivery failed";
  }

  let state: DeliveryOutcome["state"];
  if (!error) {
    state = "delivered";
    await db.execute(sql`
      UPDATE job_callbacks
      SET state = 'delivered', delivered_at = now(), next_attempt_at = NULL,
          last_status_code = ${statusCode}, last_error = NULL
      WHERE transaction_id = ${row.transaction_id}
    `);
  } else if (row.attempts >= MAX_ATTEMPTS) {
    state = "failed";
    await db.execute(sql`
      UPDATE job_callbacks
      SET state = 'failed', next_attempt_at = NULL,
          last_status_code = ${statusCode}, last_error = ${error}
      WHERE transaction_id = ${row.transaction_id}
    `);
    logWarn("job-callback-gave-up", "callback not delivered after the last attempt", {
      transaction_id: row.transaction_id,
      attempts: row.attempts,
      last_status_code: statusCode,
    });
  } else {
    state = "pending";
    const delay = RETRY_DELAYS_SECONDS[Math.min(row.attempts, RETRY_DELAYS_SECONDS.length) - 1];
    await db.execute(sql`
      UPDATE job_callbacks
      SET next_attempt_at = now() + make_interval(secs => ${delay}),
          last_status_code = ${statusCode}, last_error = ${error}
      WHERE transaction_id = ${row.transaction_id}
    `);
  }
  return { transactionId: row.transaction_id, state, statusCode };
}

/** The immediate attempt after a job settles. Never throws. */
export async function deliverNow(db: Exec, transactionId: string, fetchImpl?: CallbackFetch): Promise<DeliveryOutcome | null> {
  try {
    const [row] = await claimDueCallbacks(db, 1, transactionId);
    if (!row) return null;
    return await sendClaimed(db, row, fetchImpl);
  } catch (err) {
    logWarn("job-callback-immediate-failed", String(err), { transaction_id: transactionId });
    return null;
  }
}
