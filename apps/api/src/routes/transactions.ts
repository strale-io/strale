import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { authMiddleware, optionalAuthMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
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

      function scoreToGrade(s: number | null): string {
        if (s == null) return "pending";
        if (s >= 90) return "A";
        if (s >= 75) return "B";
        if (s >= 50) return "C";
        if (s >= 25) return "D";
        return "F";
      }

      function sqsLabel(s: number | null): string {
        if (s == null) return "Pending";
        if (s >= 90) return "Excellent";
        if (s >= 75) return "Good";
        if (s >= 50) return "Fair";
        if (s >= 25) return "Poor";
        return "Degraded";
      }

      return {
        id: row.id,
        status: row.status,
        capability_slug: row.capability_slug,
        input: row.input,
        output: row.output,
        error: row.error,
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
          quality_grade: scoreToGrade(qpScore),
          reliability_grade: scoreToGrade(rpScore),
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
