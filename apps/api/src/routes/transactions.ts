import { Hono } from "hono";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities, transactionQuality } from "../db/schema.js";
import { authMiddleware, optionalAuthMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { computeIntegrityHash } from "../lib/integrity-hash.js";
import { generateAuditToken } from "../lib/audit-token.js";
import { sqsLabel, gradeFromScore } from "../lib/trust-labels.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import type { AppEnv } from "../types.js";

export const transactionsRoute = new Hono<AppEnv>();

// GET /v1/transactions — List transactions (auth required)
// Returns both capability and solution transactions.
transactionsRoute.get(
  "/",
  authMiddleware,
  rateLimitByKey(5, 1000),
  async (c) => {
    const user = c.get("user");
    const db = getDb();

    const rows = await db
      .select({
        id: transactions.id,
        status: transactions.status,
        capability_slug: capabilities.slug,
        solution_slug: transactions.solutionSlug,
        price_cents: transactions.priceCents,
        latency_ms: transactions.latencyMs,
        created_at: transactions.createdAt,
        completed_at: transactions.completedAt,
      })
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.createdAt))
      .limit(100);

    return c.json({
      transactions: rows.map((r) => ({
        ...r,
        type: r.solution_slug ? "solution" : "capability",
        capability_slug: r.capability_slug ?? r.solution_slug,
      })),
    });
  },
);

// GET /v1/transactions/:id — Transaction details
// - Authenticated: can look up any of their own transactions
// - Unauthenticated: can only look up free-tier transactions (is_free_tier=true)
//   Safe because: transaction_id is a UUID (unguessable), free-tier data is non-sensitive,
//   and this enables external audit trail verification without requiring signup.
//
// NOTE: The GET response is flat and does NOT mirror the two-tier result + meta shape
// used by POST /v1/solutions/:slug/execute. Unifying the two response shapes is a
// future decision, not part of this PR. For now, both capability and solution rows
// return the same flat shape with a `type` discriminator.
transactionsRoute.get(
  "/:id",
  optionalAuthMiddleware,
  rateLimitByKey(10, 1000),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user") as { id: string } | undefined;
    const db = getDb();

    const selectFields = {
      id: transactions.id,
      status: transactions.status,
      capability_slug: capabilities.slug,
      solution_slug: transactions.solutionSlug,
      input: transactions.input,
      output: transactions.output,
      error: transactions.error,
      price_cents: transactions.priceCents,
      latency_ms: transactions.latencyMs,
      provenance: transactions.provenance,
      audit_trail: transactions.auditTrail,
      transparency_marker: transactions.transparencyMarker,
      data_jurisdiction: transactions.dataJurisdiction,
      is_free_tier: transactions.isFreeTier,
      created_at: transactions.createdAt,
      completed_at: transactions.completedAt,
      // Quality data from capabilities table (only populated for capability rows)
      _matrix_sqs: capabilities.matrixSqs,
      _qp_score: capabilities.qpScore,
      _rp_score: capabilities.rpScore,
      _guidance_usable: capabilities.guidanceUsable,
      _guidance_strategy: capabilities.guidanceStrategy,
    };

    function formatRow(row: typeof selectFields extends infer T ? { [K in keyof T]: any } : never) {
      const isSolution = row.solution_slug != null;

      // For solution rows, all SQS/quality fields are strictly null.
      // A solution has no SQS — the response says so honestly.
      const quality = isSolution
        ? {
            sqs: null,
            sqs_label: null,
            quality_grade: null,
            reliability_grade: null,
            usable: null,
            strategy: null,
          }
        : {
            sqs: row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null,
            sqs_label: sqsLabel(row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null),
            quality_grade: gradeFromScore(row._qp_score != null ? parseFloat(row._qp_score) : null),
            reliability_grade: gradeFromScore(row._rp_score != null ? parseFloat(row._rp_score) : null),
            usable: row._guidance_usable ?? true,
            strategy: row._guidance_strategy ?? "direct",
          };

      return {
        id: row.id,
        type: isSolution ? "solution" as const : "capability" as const,
        status: row.status,
        capability_slug: row.capability_slug ?? null,
        solution_slug: row.solution_slug ?? null,
        input: row.input,
        output: row.output,
        error: row.error ? sanitizeFailureReason(row.error) : null,
        price_cents: row.price_cents,
        latency_ms: row.latency_ms,
        provenance: row.provenance,
        audit_trail: row.audit_trail,
        transparency_marker: row.transparency_marker,
        data_jurisdiction: row.data_jurisdiction,
        is_free_tier: row.is_free_tier,
        created_at: row.created_at,
        completed_at: row.completed_at,
        quality,
      };
    }

    function formatRedactedRow(row: typeof selectFields extends infer T ? { [K in keyof T]: any } : never) {
      const isSolution = row.solution_slug != null;

      // Same quality construction as formatRow — operator-domain metric, no PII.
      const quality = isSolution
        ? {
            sqs: null,
            sqs_label: null,
            quality_grade: null,
            reliability_grade: null,
            usable: null,
            strategy: null,
          }
        : {
            sqs: row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null,
            sqs_label: sqsLabel(row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null),
            quality_grade: gradeFromScore(row._qp_score != null ? parseFloat(row._qp_score) : null),
            reliability_grade: gradeFromScore(row._rp_score != null ? parseFloat(row._rp_score) : null),
            usable: row._guidance_usable ?? true,
            strategy: row._guidance_strategy ?? "direct",
          };

      return {
        id: row.id,
        type: isSolution ? "solution" as const : "capability" as const,
        status: row.status,
        capability_slug: row.capability_slug ?? null,
        solution_slug: row.solution_slug ?? null,
        price_cents: row.price_cents,
        latency_ms: row.latency_ms,
        transparency_marker: row.transparency_marker,
        data_jurisdiction: row.data_jurisdiction,
        is_free_tier: row.is_free_tier,
        created_at: row.created_at,
        completed_at: row.completed_at,
        quality,
        // F-A-005: explicit body redaction marker. input, output, error,
        // provenance, audit_trail are not returned to unauthenticated callers.
        body_redacted: true as const,
        body_redacted_reason:
          "Free-tier public lookup. input, output, error, provenance, and audit_trail " +
          "are redacted for unauthenticated callers. Authenticate with an API key to " +
          "access the full body.",
      };
    }

    if (user) {
      // Authenticated: look up by ID + user ownership
      const [row] = await db
        .select(selectFields)
        .from(transactions)
        .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
        .where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
        .limit(1);

      if (!row) {
        return c.json(apiError("not_found", "Transaction not found."), 404);
      }

      return c.json(formatRow(row));
    }

    // F-A-005: Unauthenticated lookups return a redacted envelope — body fields
    // (input/output/error/provenance/audit_trail) are NOT returned. The sibling
    // GET /:id/verify is unaffected because its response is hash-only (no PII).
    const [row] = await db
      .select(selectFields)
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(and(eq(transactions.id, id), eq(transactions.isFreeTier, true), isNull(transactions.deletedAt)))
      .limit(1);

    if (!row) {
      // Don't leak whether the transaction exists or just requires auth
      return c.json(
        apiError(
          "not_found",
          "Transaction not found. Paid transaction lookups require an API key.",
        ),
        404,
      );
    }

    return c.json(formatRedactedRow(row));
  },
);

// GET /v1/transactions/:id/verify — Verify cryptographic integrity of a transaction record
transactionsRoute.get(
  "/:id/verify",
  optionalAuthMiddleware,
  rateLimitByKey(10, 1000),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user") as { id: string } | undefined;
    const db = getDb();

    // Look up transaction — same auth rules as /:id above
    const condition = user
      ? and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt))
      : and(eq(transactions.id, id), eq(transactions.isFreeTier, true), isNull(transactions.deletedAt));

    const [txn] = await db
      .select()
      .from(transactions)
      .where(condition)
      .limit(1);

    if (!txn) {
      return c.json(apiError("not_found", "Transaction not found."), 404);
    }

    // Recompute hash and compare
    const recomputed = computeIntegrityHash(txn, txn.previousHash ?? "");
    const storedHash = txn.integrityHash;
    const verified = storedHash != null && recomputed === storedHash;

    // Walk chain backward
    const chain: Array<{ id: string; hash: string | null; verified: boolean }> = [];
    let current = txn;
    for (let i = 0; i < 10 && current; i++) {
      const hash = computeIntegrityHash(current, current.previousHash ?? "");
      chain.push({
        id: current.id,
        hash: current.integrityHash,
        verified: current.integrityHash != null && hash === current.integrityHash,
      });
      if (!current.previousHash) break;
      const [prev] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.integrityHash, current.previousHash))
        .limit(1);
      if (!prev) break;
      current = prev;
    }

    return c.json({
      transaction_id: txn.id,
      integrity_hash: storedHash,
      recomputed_hash: recomputed,
      verified,
      chain_length: chain.length,
      chain,
    });
  },
);

// DELETE /v1/transactions/:id — Soft-delete with in-place PII redaction.
// GDPR Art. 17 right-to-erasure. Caller must own the transaction.
// legal_hold = true → 423 Locked. Deletion is represented by the
// deleted_at / redacted_at / deletion_reason columns on the row itself
// (no separate audit-event row — see SA.2a.3a Sub-report C).
//
// Per-row content-hash verifiability is sacrificed on redaction; chain-link
// continuity is preserved via the original `integrityHash` and `previousHash`.
transactionsRoute.delete(
  "/:id",
  authMiddleware,
  rateLimitByKey(5, 1000),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user");
    const db = getDb();

    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: transactions.id,
          legalHold: transactions.legalHold,
        })
        .from(transactions)
        .where(and(
          eq(transactions.id, id),
          eq(transactions.userId, user.id),
          isNull(transactions.deletedAt),
        ))
        .limit(1);

      if (!row) {
        return c.json(apiError("not_found", "Transaction not found."), 404);
      }

      if (row.legalHold) {
        return c.json(
          apiError(
            "locked",
            "This transaction is under legal hold and cannot be deleted. Contact compliance@strale.io.",
          ),
          423,
        );
      }

      const now = new Date();

      await tx
        .update(transactions)
        .set({
          deletedAt: now,
          redactedAt: now,
          deletionReason: "user_request",
          input: {},
          output: null,
          error: null,
          auditTrail: null,
          provenance: null,
          idempotencyKey: null,
        })
        .where(eq(transactions.id, id));

      await tx
        .update(transactionQuality)
        .set({ deletedAt: now })
        .where(eq(transactionQuality.transactionId, id));

      return c.json({
        id,
        deleted_at: now.toISOString(),
        redacted_at: now.toISOString(),
        deletion_reason: "user_request",
      });
    });
  },
);

// POST /v1/transactions/:id/audit-token — Re-issue a shareable audit URL.
// F-A-006: audit tokens expire (default 90d). Owners refresh via this
// endpoint. Auth required, ownership enforced, deleted rows return 404
// (SA.2a.2a A-filter pattern). Free-tier rows (userId NULL) fall through
// ownership check naturally and return 404.
transactionsRoute.post(
  "/:id/audit-token",
  authMiddleware,
  rateLimitByKey(5, 1000),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user");
    const db = getDb();

    const body = (await c.req.json().catch(() => ({}))) as {
      expires_in_days?: unknown;
    };

    // Validate expires_in_days: integer, 1-365, default 90.
    let expiresInDays = 90;
    if (body.expires_in_days !== undefined) {
      if (
        typeof body.expires_in_days !== "number" ||
        !Number.isInteger(body.expires_in_days) ||
        body.expires_in_days < 1 ||
        body.expires_in_days > 365
      ) {
        return c.json(
          apiError(
            "invalid_request",
            "expires_in_days must be an integer between 1 and 365.",
          ),
          400,
        );
      }
      expiresInDays = body.expires_in_days;
    }

    const [row] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(
        eq(transactions.id, id),
        eq(transactions.userId, user.id),
        isNull(transactions.deletedAt),
      ))
      .limit(1);

    if (!row) {
      // No-existence-leak: same 404 whether the row doesn't exist, belongs
      // to someone else, or was soft-deleted.
      return c.json(apiError("not_found", "Transaction not found."), 404);
    }

    const { token, expiresAt } = generateAuditToken(id, expiresInDays * 24 * 60 * 60);

    return c.json({
      transaction_id: id,
      token,
      expires_at: expiresAt,
      expires_at_iso: new Date(expiresAt * 1000).toISOString(),
      audit_url: `https://strale.dev/audit/${id}?token=${token}&expires_at=${expiresAt}`,
    });
  },
);
