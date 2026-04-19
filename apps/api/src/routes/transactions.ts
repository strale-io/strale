import { Hono } from "hono";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, transactionQuality, capabilities } from "../db/schema.js";
import { authMiddleware, optionalAuthMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { computeIntegrityHash } from "../lib/integrity-hash.js";
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

    // F-A-001: deleted rows are hidden from the user's own list by default.
    // Opt-in visibility via `?include_deleted=true` for users who want to
    // see their deletion history (the stub rows survive — just their PII
    // fields are redacted).
    const includeDeleted = c.req.query("include_deleted") === "true";
    const whereClause = includeDeleted
      ? eq(transactions.userId, user.id)
      : and(eq(transactions.userId, user.id), isNull(transactions.deletedAt));

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
        deleted_at: transactions.deletedAt,
      })
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(whereClause)
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
      deleted_at: transactions.deletedAt,
      integrity_hash: transactions.integrityHash,
      previous_hash: transactions.previousHash,
      // Quality data from capabilities table (only populated for capability rows)
      _matrix_sqs: capabilities.matrixSqs,
      _qp_score: capabilities.qpScore,
      _rp_score: capabilities.rpScore,
      _guidance_usable: capabilities.guidanceUsable,
      _guidance_strategy: capabilities.guidanceStrategy,
    };

    function formatRow(row: typeof selectFields extends infer T ? { [K in keyof T]: any } : never) {
      // F-A-001: deleted rows return a redacted body. Chain-continuity
      // fields (integrity_hash, previous_hash, timestamps) stay visible;
      // payload fields are null. 200 (not 410) so auditors can still
      // confirm the row existed and is now deleted.
      if (row.deleted_at != null) {
        return {
          id: row.id,
          type: row.solution_slug != null ? "solution" as const : "capability" as const,
          status: "deleted" as const,
          capability_slug: row.capability_slug ?? null,
          solution_slug: row.solution_slug ?? null,
          deleted_at: row.deleted_at,
          created_at: row.created_at,
          integrity_hash: row.integrity_hash,
          previous_hash: row.previous_hash,
          input: null,
          output: null,
          audit_trail: null,
        };
      }

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

    if (user) {
      // Authenticated: look up by ID + user ownership
      const [row] = await db
        .select(selectFields)
        .from(transactions)
        .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
        .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
        .limit(1);

      if (!row) {
        return c.json(apiError("not_found", "Transaction not found."), 404);
      }

      return c.json(formatRow(row));
    }

    // Unauthenticated: only free-tier transactions are publicly accessible by ID
    const [row] = await db
      .select(selectFields)
      .from(transactions)
      .leftJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(and(eq(transactions.id, id), eq(transactions.isFreeTier, true)))
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

    return c.json(formatRow(row));
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
      ? and(eq(transactions.id, id), eq(transactions.userId, user.id))
      : and(eq(transactions.id, id), eq(transactions.isFreeTier, true));

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

// DELETE /v1/transactions/:id — GDPR Article 17 right-to-erasure (F-A-001)
//
// Auth-gated: only the transaction's owner can delete. Free-tier
// unauthenticated transactions are not deletable via this route — the
// caller has no identity the server can verify. That gap is a separate
// scope question (HMAC-token-gated delete for free-tier), not part of
// this fix.
//
// Soft delete: sets deleted_at, redacts input/output/audit_trail to a
// {deleted: true, deleted_at} marker. integrity_hash and previous_hash
// are preserved so the tamper-evidence chain stays intact — the chain
// walker in verify.ts trusts the stored hash for deleted rows rather
// than recomputing from the (now-redacted) inputs.
//
// Cascades:
//   - transaction_quality row for this transaction_id → hard delete
//     (one-shot scoring signal; retaining it after the audit row is
//     redacted has no value and leaks row shape)
//   - SQS aggregates → untouched; they aggregate events, not rows.
//     Past aggregates already incorporated this transaction's
//     contribution; deletion doesn't retroactively alter them.
//
// Audit trail of the deletion: a new transaction row is inserted with
// compliance_hash_state='pending'. The integrity-hash-retry worker picks
// it up and chains it into the integrity ledger — so the deletion is
// itself a tamper-evident audit event.
//
// legal_hold: rows with legal_hold=true return 423 Locked. A
// compliance contact must review before deletion can proceed.
transactionsRoute.delete(
  "/:id",
  authMiddleware,
  rateLimitByKey(5, 1000),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user");
    const db = getDb();

    const [txn] = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        legalHold: transactions.legalHold,
        deletedAt: transactions.deletedAt,
      })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    // Don't leak existence to non-owners — same 404 whether missing or
    // owned by someone else.
    if (!txn || txn.userId !== user.id) {
      return c.json(apiError("not_found", "Transaction not found."), 404);
    }

    // Idempotent: second delete of the same row returns 204 without
    // inserting another deletion audit entry.
    if (txn.deletedAt) {
      return c.body(null, 204);
    }

    if (txn.legalHold) {
      return c.json(
        {
          error_code: "legal_hold_active" as const,
          message:
            "Transaction is under legal hold and cannot be deleted. Contact hello@strale.io for deletion inquiries.",
          transaction_id: id,
        },
        423,
      );
    }

    const deletedAt = new Date();
    const redactionMarker = {
      deleted: true,
      deleted_at: deletedAt.toISOString(),
    };

    await db.transaction(async (tx) => {
      // Redact the row. integrity_hash / previous_hash preserved.
      await tx
        .update(transactions)
        .set({
          deletedAt,
          input: redactionMarker,
          output: redactionMarker,
          auditTrail: redactionMarker,
          provenance: redactionMarker,
          error: null,
        })
        .where(eq(transactions.id, id));

      // Cascade the transaction_quality row if present. Hard delete —
      // quality signals are one-shot and have no independent audit value.
      await tx
        .delete(transactionQuality)
        .where(eq(transactionQuality.transactionId, id));

      // Insert the deletion-as-audit-entry. compliance_hash_state defaults
      // to 'pending' — the retry worker hashes it and chains it normally.
      await tx.insert(transactions).values({
        userId: user.id,
        capabilityId: null,
        solutionSlug: null,
        status: "completed",
        input: {
          type: "deletion",
          deleted_transaction_id: id,
          requested_by_user_id: user.id,
        },
        output: { deleted_at: deletedAt.toISOString() },
        priceCents: 0,
        latencyMs: 0,
        auditTrail: {
          type: "deletion",
          deleted_transaction_id: id,
          deleted_at: deletedAt.toISOString(),
          requested_by_user_id: user.id,
        },
        transparencyMarker: "algorithmic",
        dataJurisdiction: "EU",
        isFreeTier: false,
        completedAt: deletedAt,
      });
    });

    return c.body(null, 204);
  },
);
