import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { type Context } from "hono";
import { transactions, walletReservations, wallets } from "../../db/schema.js";
import { apiError } from "../errors.js";
import { isReplayable } from "../idempotency-fingerprint.js";
import { redactAuditTrail } from "../sanitize.js";
import type { AppEnv } from "../../types.js";

// F-0-009 Stage 2: integrity hashing moved to jobs/integrity-hash-retry.ts.

/**
 * Cert-audit C8: in-transaction spend-cap check. Caller must hold the
 * wallet FOR UPDATE lock for `userId` so concurrent requests for the
 * same user serialize on this read. Returns the over-cap details if
 * the requested cents would push hourly spend above `capCents`,
 * otherwise null.
 *
 * Counts both `completed` (sync success) and `executing` rows so a
 * burst of in-flight async requests can't slip past while their final
 * status is still being written.
 *
 * Cert-audit Y-11 (documented, intentionally not "fixed"): there is a
 * brief window where a row that has just completed but whose status
 * column hasn't been UPDATEd yet from `executing` to `completed` is
 * counted in BOTH buckets — the SUM still includes it as `executing`,
 * and the next sub-second post-commit it'll appear as `completed`.
 * Within the wallet-locked tx the row is a single value (one or the
 * other, not both), so this can't cause double-billing — it can only
 * cause a false `spend_cap_exceeded` rejection of a request that
 * arrives in the millisecond between the executor returning and the
 * status-flip committing. Tightening the SUM filter to exclude rows
 * whose `completed_at` is set but `status` is still `executing` would
 * close the window but at the cost of a more complex query for a
 * benign over-rejection case. Documented; not fixed.
 */
// Exported for the regression test at do.spend-cap.test.ts. The unit test
// asserts no `Date` instance is ever passed through `tx.execute(sql``)` —
// the bug at commit 6613bd7 (2026-04-30) interpolated a Date directly into
// a sql-template, and postgres-js's bind-parameter encoder couldn't
// serialize it (Buffer.byteLength on a Date throws). Every authenticated
// paid /v1/do call for a user with maxSpendPerHourCents set 500'd as a
// result. The fix below uses Drizzle's typed column query so the Date
// goes through the column's mapToDriverValue serializer.
export async function spendCapWouldExceed(
  tx: any,
  userId: string,
  requestedCents: number,
  capCents: number,
): Promise<{ spent: number } | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await tx
    .select({ total: sql<string>`COALESCE(SUM(price_cents), 0)::text` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.status, ["completed", "executing"]),
        gte(transactions.createdAt, oneHourAgo),
      ),
    );
  // A batch takes all its item holds up front and creates each item's
  // transaction row only when the item starts, so its not-yet-started items
  // have no row above to count. Without this, a second request in that window
  // would pass the cap against spend the batch has already committed to.
  const [held] = await tx
    .select({ total: sql<string>`COALESCE(SUM(amount_cents), 0)::text` })
    .from(walletReservations)
    .where(
      and(
        eq(walletReservations.userId, userId),
        eq(walletReservations.mode, "hold"),
        inArray(walletReservations.state, ["reserved", "executing"]),
        isNull(walletReservations.transactionId),
      ),
    );
  const spent = Number(row?.total ?? 0) + Number(held?.total ?? 0);
  if (spent + requestedCents > capCents) return { spent };
  return null;
}

export async function replaySyncRequest(c: Context<AppEnv>, db: any, existing: any, fingerprint: string, capabilitySlug: string | undefined, userId: string) {
    if (existing && (existing.solutionSlug != null || existing.deletedAt != null || !isReplayable(existing.idempotencyFingerprint, fingerprint))) {
      // The dangerous case, and the reason this package exists. Pre-WP6 this
      // path returned the EARLIER call's output while echoing the slug the
      // caller had just asked for — an answer to someone else's question,
      // labelled as an answer to theirs. A deterministic key like "order-123"
      // reused across two capabilities is far likelier than a UUID collision.
      return c.json(
        apiError(
          "idempotency_key_reused",
          "This Idempotency-Key was already used for a different request. " +
            "A key identifies one specific request; reusing it for different " +
            "inputs or a different capability is not a retry, so replaying the " +
            "earlier result would answer a question you did not ask. Use a new key.",
          { conflicting_transaction_id: existing.id },
        ),
        409,
      );
    }

    if (existing?.status === "executing") {
      return c.json(apiError("request_in_progress", "The original request is still running.", {
        retryable: true,
        retry_after_seconds: 2,
        transaction_id: existing.id,
        fix: "The original request is still running; retry with the same Idempotency-Key after 2 seconds.",
      }), 409);
    }

    if (existing) {
      const [wallet] = await db
        .select({ balanceCents: wallets.balanceCents })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);

      // MED-5: include the stored audit body in the replay so an agent
      // relying on compliance.shareable_url from the original call still
      // gets it on retry. Pre-fix, replays returned no meta.audit at all
      // and customers parsing audit data hit undefined. idempotency_replay:
      // true distinguishes replays from original calls in customer logs.
      return c.json({
        transaction_id: existing.id,
        status: existing.status,
        capability_used: capabilitySlug ?? null,
        price_cents: existing.priceCents,
        latency_ms: existing.latencyMs,
        wallet_balance_cents: wallet?.balanceCents ?? 0,
        output: existing.output,
        provenance: existing.provenance,
        meta: {
          idempotency_replay: true,
          // A STORED audit body, so it can predate the sanitising write below
          // and carry a raw error. Reviewer-found: the fix originally covered
          // only GET /v1/transactions/:id and missed both replay paths.
          audit: redactAuditTrail(existing.auditTrail),
        },
      });
    }
}

