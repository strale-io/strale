import { Hono } from "hono";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities, transactionQuality } from "../db/schema.js";
import { authMiddleware, optionalAuthMiddleware } from "../lib/middleware.js";
import { rateLimitByKey, rateLimitByIp } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { computeIntegrityHash, GENESIS_HASH } from "../lib/integrity-hash.js";
import { walkChain } from "./verify.js";
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
// F-AUDIT-15 + MED-7: this endpoint adds an ownership check to the public
// /v1/verify/:id (auth'd users see only their own; unauth see only free-tier).
// Apart from that filter, it now uses the same walker, depth ceiling, and
// response shape as the public endpoint — pre-fix it had its own walker
// hardcoded to depth=10, no truncated flag, no redacted-aware handling, no
// methodology_url. Two endpoints with divergent answers for the same row.
const AUTH_VERIFY_MAX_DEPTH = 50;
const AUTH_VERIFY_DEFAULT_DEPTH = 20;

transactionsRoute.get(
  "/:id/verify",
  optionalAuthMiddleware,
  rateLimitByIp(10, 60_000),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user") as { id: string } | undefined;
    const db = getDb();

    // MED-7: depth query param matches public endpoint.
    const depthParam = parseInt(c.req.query("depth") ?? String(AUTH_VERIFY_DEFAULT_DEPTH), 10);
    const maxDepth = Math.min(Math.max(Number.isFinite(depthParam) ? depthParam : AUTH_VERIFY_DEFAULT_DEPTH, 1), AUTH_VERIFY_MAX_DEPTH);

    // Look up transaction — ownership filter is the unique value of this
    // endpoint (auth'd: only your own; unauth: only free-tier). Note: we
    // do NOT exclude redacted rows here — verify needs to be able to walk
    // through (and report on) redacted predecessors per F-AUDIT-13/16.
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

    // CCO P0 #5: rows in 'unhashed_legacy' state predate the cryptographic
    // chain (migration 0047 backfilled them). Same handling as public verify.
    if (txn.complianceHashState === "unhashed_legacy") {
      return c.json({
        transaction_id: txn.id,
        verified: null,
        hash_valid: null,
        legacy: true,
        legacy_reason:
          "Transaction predates Strale's cryptographic audit chain. " +
          "It has no integrity_hash by design — see /v1/audit/:id for the reconstructed compliance record (informational, not hash-protected).",
        transaction_metadata: {
          created_at: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : txn.createdAt,
          status: txn.status,
        },
        methodology_url: "https://strale.dev/trust/methodology",
      });
    }

    if (!txn.integrityHash) {
      return c.json({
        transaction_id: id,
        verified: false,
        hash_valid: false,
        reason: "Transaction does not have an integrity hash (may be too old or in-progress).",
      });
    }

    // F-AUDIT-11: previousHash defaults to GENESIS_HASH, matching the worker
    // in jobs/integrity-hash-retry.ts and the public /v1/verify/:id endpoint.
    const recomputed = computeIntegrityHash(txn, txn.previousHash ?? GENESIS_HASH);
    const storedHash = txn.integrityHash;
    const hashValid = recomputed === storedHash;

    // MED-7: shared walker — eliminates depth + flag drift between the two
    // endpoints. Deletion-aware handling (redacted_links) and truncation
    // signalling are inherited.
    const chain = await walkChain(db, txn.previousHash, maxDepth);

    const targetRedacted = txn.deletedAt != null;
    const targetVerifiedLink = !targetRedacted && hashValid;

    return c.json({
      transaction_id: txn.id,
      verified: (targetVerifiedLink || targetRedacted) && chain.brokenLinks === 0,
      hash_valid: targetRedacted ? null : hashValid,
      redacted: targetRedacted,
      ...(targetRedacted ? {
        redaction_reason:
          "Row redacted under GDPR Art. 17 right-to-erasure or retention policy. Original chain hash preserved for chain continuity; per-row content hash no longer matches by design.",
      } : {}),
      chain: {
        length: chain.length + 1,
        verified_links: chain.verifiedLinks + (targetVerifiedLink ? 1 : 0),
        broken_links: chain.brokenLinks + (!targetRedacted && !hashValid ? 1 : 0),
        redacted_links: chain.redactedLinks + (targetRedacted ? 1 : 0),
        reaches_genesis: chain.reachesGenesis,
        max_depth: maxDepth,
        truncated: chain.truncated,
        truncated_reason: chain.truncated ? `max_depth_reached (N=${maxDepth})` : null,
        ...(chain.firstBrokenLinkId ? { first_broken_link_id: chain.firstBrokenLinkId } : {}),
      },
      transaction_metadata: {
        created_at: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : txn.createdAt,
        transparency_marker: txn.transparencyMarker,
        data_jurisdiction: txn.dataJurisdiction,
        status: txn.status,
      },
      methodology_url: "https://strale.dev/trust/methodology",
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
