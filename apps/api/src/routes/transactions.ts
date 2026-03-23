import { Hono } from "hono";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { authMiddleware, optionalAuthMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { computeIntegrityHash } from "../lib/integrity-hash.js";
import { sqsLabel, gradeFromScore } from "../lib/trust-labels.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import type { AppEnv } from "../types.js";

export const transactionsRoute = new Hono<AppEnv>();

// GET /v1/transactions — List capability transactions (auth required)
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
        price_cents: transactions.priceCents,
        latency_ms: transactions.latencyMs,
        created_at: transactions.createdAt,
        completed_at: transactions.completedAt,
      })
      .from(transactions)
      .innerJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
      .where(eq(transactions.userId, user.id))
      .orderBy(desc(transactions.createdAt))
      .limit(100);

    return c.json({ transactions: rows });
  },
);

// GET /v1/transactions/:id — Transaction details
// - Authenticated: can look up any of their own transactions
// - Unauthenticated: can only look up free-tier transactions (is_free_tier=true)
//   Safe because: transaction_id is a UUID (unguessable), free-tier data is non-sensitive,
//   and this enables external audit trail verification without requiring signup.
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
      // Quality data from capabilities table (persisted after each test batch)
      _matrix_sqs: capabilities.matrixSqs,
      _qp_score: capabilities.qpScore,
      _rp_score: capabilities.rpScore,
      _guidance_usable: capabilities.guidanceUsable,
      _guidance_strategy: capabilities.guidanceStrategy,
    };

    function formatRow(row: typeof selectFields extends infer T ? { [K in keyof T]: any } : never) {
      const sqs = row._matrix_sqs != null ? parseFloat(row._matrix_sqs) : null;
      const qpScore = row._qp_score != null ? parseFloat(row._qp_score) : null;
      const rpScore = row._rp_score != null ? parseFloat(row._rp_score) : null;



      return {
        id: row.id,
        status: row.status,
        capability_slug: row.capability_slug,
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
        quality: {
          sqs: sqs ?? 0,
          sqs_label: sqsLabel(sqs),
          quality_grade: gradeFromScore(qpScore),
          reliability_grade: gradeFromScore(rpScore),
          usable: row._guidance_usable ?? true,
          strategy: row._guidance_strategy ?? "direct",
        },
      };
    }

    if (user) {
      // Authenticated: look up by ID + user ownership
      const [row] = await db
        .select(selectFields)
        .from(transactions)
        .innerJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
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
      .innerJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
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
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user") as { id: string } | undefined;
    const db = getDb();

    const [txn] = await db
      .select()
      .from(transactions)
      .where(user
        ? and(eq(transactions.id, id), eq(transactions.userId, user.id))
        : and(eq(transactions.id, id), eq(transactions.isFreeTier, true)),
      )
      .limit(1);

    if (!txn) {
      return c.json(apiError("not_found", "Transaction not found."), 404);
    }

    if (!txn.integrityHash) {
      return c.json({
        transaction_id: id,
        verified: false,
        chain_intact: false,
        reason: "No integrity hash computed (transaction predates hash chain implementation)",
      });
    }

    const recomputed = computeIntegrityHash({
      id: txn.id,
      userId: txn.userId,
      status: txn.status,
      input: txn.input,
      output: txn.output,
      error: txn.error,
      priceCents: txn.priceCents,
      latencyMs: txn.latencyMs,
      provenance: txn.provenance,
      auditTrail: txn.auditTrail,
      transparencyMarker: txn.transparencyMarker,
      dataJurisdiction: txn.dataJurisdiction,
      createdAt: txn.createdAt,
      completedAt: txn.completedAt,
    }, txn.previousHash ?? "");

    const hashMatches = recomputed === txn.integrityHash;

    // Check chain: does the previous_hash match an actual preceding transaction?
    let chainIntact = hashMatches;
    if (txn.previousHash) {
      const [prev] = await db
        .select({ integrityHash: transactions.integrityHash })
        .from(transactions)
        .where(eq(transactions.integrityHash, txn.previousHash))
        .limit(1);
      if (!prev) {
        chainIntact = false;
      }
    }

    return c.json({
      transaction_id: id,
      verified: hashMatches,
      chain_intact: chainIntact,
      integrity_hash: txn.integrityHash,
      previous_hash: txn.previousHash,
    });
  },
);

// POST /v1/transactions/hold — Set legal hold on transactions (prevents deletion)
transactionsRoute.post(
  "/hold",
  authMiddleware,
  rateLimitByKey(5, 1000),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const transactionIds = body.transaction_ids as string[] | undefined;
    const reason = body.reason as string | undefined;

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return c.json(apiError("invalid_request", "transaction_ids array is required"), 400);
    }

    if (transactionIds.length > 100) {
      return c.json(apiError("invalid_request", "Maximum 100 transaction IDs per request"), 400);
    }

    const user = c.get("user") as { id: string };
    const db = getDb();

    // Only allow holding own transactions
    const result = await db
      .update(transactions)
      .set({ legalHold: true })
      .where(and(
        inArray(transactions.id, transactionIds),
        eq(transactions.userId, user.id),
      ))
      .returning({ id: transactions.id });

    return c.json({
      held: result.length,
      reason: reason ?? null,
      transaction_ids: result.map((r) => r.id),
    });
  },
);
