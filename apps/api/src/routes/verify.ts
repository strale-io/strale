/**
 * Hash chain verification endpoint — public, no auth required.
 * Recomputes a transaction's SHA-256 hash and walks the chain backward.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { computeIntegrityHash, GENESIS_HASH } from "../lib/integrity-hash.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// F-A-012: tighter caps than the original 200/50 (30 req/min). Prod chain
// lengths have p95 ~1,308 hops per day — any cap truncates p95-day walks,
// so "reaches_genesis" is effectively a same-day signal. Lower cap +
// tighter rate limit cut worst-case memory cost per IP/minute from
// ~300MB to ~25MB (12× reduction).
const MAX_DEPTH = 50;
const DEFAULT_DEPTH = 20;

export const verifyRoute = new Hono<AppEnv>();

// F-A-012: 10 req/min per IP (was 30). See audit-reports/F_A_012_a_audit.md.
verifyRoute.use("*", rateLimitByIp(10, 60_000));

verifyRoute.get("/:transactionId", async (c) => {
  const transactionId = c.req.param("transactionId");
  const depthParam = parseInt(c.req.query("depth") ?? String(DEFAULT_DEPTH), 10);
  const maxDepth = Math.min(Math.max(depthParam, 1), MAX_DEPTH);

  const db = getDb();

  // Look up the target transaction
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!txn) {
    return c.json(apiError("not_found", "Transaction not found."), 404);
  }

  // CCO P0 #5: rows in 'unhashed_legacy' state predate the cryptographic
  // chain (migration 0047 backfilled them; migration 0052 marked them
  // honestly). They have integrity_hash IS NULL by definition. Report as
  // a legitimate state rather than as missing/broken — same treatment as
  // redacted rows. /v1/audit/:id stamps these too.
  if (txn.complianceHashState === "unhashed_legacy") {
    return c.json({
      transaction_id: transactionId,
      verified: null,
      hash_valid: null,
      legacy: true,
      legacy_reason:
        "Transaction predates Strale's cryptographic audit chain. " +
        "It has no integrity_hash by design — see /v1/audit/:id for the reconstructed compliance record (informational, not hash-protected). " +
        "Transactions executed after the chain was finalised carry hash_valid: true | false here.",
      transaction_metadata: {
        created_at: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : txn.createdAt,
        status: txn.status,
      },
      methodology_url: "https://strale.dev/trust/methodology",
    });
  }

  if (!txn.integrityHash) {
    return c.json({
      transaction_id: transactionId,
      verified: false,
      hash_valid: false,
      reason: "Transaction does not have an integrity hash (may be too old or in-progress).",
    });
  }

  // Recompute hash for this transaction
  const recomputed = computeIntegrityHash(
    {
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
    },
    txn.previousHash ?? GENESIS_HASH,
  );

  const hashValid = recomputed === txn.integrityHash;

  // Walk the chain backward
  const chain = await walkChain(db, txn.previousHash, maxDepth);

  // Get capability slug for metadata
  let capSlug: string | null = null;
  if (txn.capabilityId) {
    const [cap] = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.id, txn.capabilityId))
      .limit(1);
    capSlug = cap?.slug ?? null;
  }

  // F-AUDIT-13/16: target transaction itself may also be redacted.
  // If so, hash_valid is meaningless — the source data is gone — but
  // the chain link itself is preserved.
  const targetRedacted = txn.deletedAt != null;
  const targetVerifiedLink = !targetRedacted && hashValid;
  const targetDeletionReason = txn.deletionReason ?? null;

  // CCO #4-polish + World-class #6: human-readable reason for the redacted
  // state. The text varies by deletion_reason so customers/regulators can
  // distinguish GDPR Art. 17 erasure (customer-initiated) from retention
  // policy purge (system-initiated). Pre-fix, both rendered the same
  // generic "redacted under GDPR Art. 17" text — wrong for retention rows.
  function redactionReasonText(reason: string | null): string {
    if (reason === "retention_purge") {
      return (
        "Row redacted by Strale's retention policy after the configured retention window. " +
        "Original chain hash is preserved for chain continuity; per-row content hash no longer matches " +
        "because the row's input/output/audit_trail were zeroed by design. This is routine and not tampering."
      );
    }
    if (reason === "user_request") {
      return (
        "Row redacted at the customer's request under GDPR Art. 17 right-to-erasure. " +
        "Original chain hash is preserved for chain continuity; per-row content hash no longer matches " +
        "because input/output/audit_trail were zeroed by design. This is a legitimate customer action and not tampering."
      );
    }
    // Unknown reason or legacy redaction without deletion_reason set.
    return (
      "Row redacted (deletion_reason unknown). Original chain hash is preserved for chain continuity; " +
      "per-row content hash no longer matches because the row's input/output/audit_trail were zeroed. " +
      "This is not tampering, but the deletion_reason was not recorded — flagged for operator review."
    );
  }

  return c.json({
    transaction_id: transactionId,
    // `verified` means: every link in the chain we walked is either
    // verified-against-its-stored-hash OR a legitimate redaction.
    // Redacted links are NOT broken — see ChainWalkResult docstring.
    verified: (targetVerifiedLink || targetRedacted) && chain.brokenLinks === 0,
    hash_valid: targetRedacted ? null : hashValid,
    redacted: targetRedacted,
    ...(targetRedacted ? {
      redaction_reason: redactionReasonText(targetDeletionReason),
      deletion_reason: targetDeletionReason,
    } : {}),
    chain: {
      length: chain.length + 1, // +1 for the target transaction
      verified_links: chain.verifiedLinks + (targetVerifiedLink ? 1 : 0),
      broken_links: chain.brokenLinks + (!targetRedacted && !hashValid ? 1 : 0),
      redacted_links: chain.redactedLinks + (targetRedacted ? 1 : 0),
      // World-class #6: per-reason breakdown so a regulator walking the
      // chain sees how many links are GDPR-erasure vs. retention-purge.
      redacted_by_reason: {
        user_request: chain.redactedByReason.user_request + (targetRedacted && targetDeletionReason === "user_request" ? 1 : 0),
        retention_purge: chain.redactedByReason.retention_purge + (targetRedacted && targetDeletionReason === "retention_purge" ? 1 : 0),
        other: chain.redactedByReason.other + (targetRedacted && targetDeletionReason !== "user_request" && targetDeletionReason !== "retention_purge" ? 1 : 0),
      },
      reaches_genesis: chain.reachesGenesis,
      chain_start_date: chain.startDate,
      chain_end_date: txn.createdAt instanceof Date
        ? txn.createdAt.toISOString().slice(0, 10)
        : String(txn.createdAt).slice(0, 10),
      ...(chain.firstBrokenLinkId ? { first_broken_link_id: chain.firstBrokenLinkId } : {}),
      max_depth: maxDepth,
      truncated: chain.truncated,
      truncated_reason: chain.truncated ? `max_depth_reached (N=${maxDepth})` : null,
    },
    transaction_metadata: {
      created_at: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : txn.createdAt,
      capability_slug: capSlug,
      transparency_marker: txn.transparencyMarker,
      data_jurisdiction: txn.dataJurisdiction,
      status: txn.status,
      ...(targetRedacted ? { redacted_at: txn.redactedAt instanceof Date ? txn.redactedAt.toISOString() : txn.redactedAt } : {}),
    },
    methodology_url: "https://strale.dev/trust/methodology",
  });
});

// ── Chain walk ────────────────────────────────────────────────────────────────

export interface ChainWalkResult {
  length: number;
  verifiedLinks: number;
  brokenLinks: number;
  // F-AUDIT-13/16: rows whose source data has been redacted under GDPR Art.
  // 17 right-to-erasure. Per-row content-hash verifiability is intentionally
  // sacrificed on redaction (see DELETE /v1/transactions/:id), so the recomputed
  // hash will not match the stored one. These are NOT broken — they are a
  // legitimate, customer-requested erasure. Counted separately so the public
  // chain verify doesn't falsely report tampering when a customer exercises
  // their legal rights.
  redactedLinks: number;
  // World-class #6: per-redaction breakdown so customers and regulators
  // can distinguish three different events with three different regulator
  // responses:
  //   - user_request   → GDPR Art. 17 / DSAR-driven erasure (customer-initiated)
  //   - retention_purge → routine retention policy (system-initiated)
  //   - other            → any other deletion_reason; flagged for review
  redactedByReason: { user_request: number; retention_purge: number; other: number };
  reachesGenesis: boolean;
  startDate: string | null;
  firstBrokenLinkId: string | null;
  // F-A-012: true when the walk stopped at maxDepth before reaching
  // genesis. Surfaces to the response as chain.truncated so callers
  // distinguish "chain is short" from "chain is longer than we walked."
  truncated: boolean;
}

// Exported so the auth-gated /v1/transactions/:id/verify endpoint can
// share the same walker (MED-7 convergence with the public surface).
export async function walkChain(
  db: ReturnType<typeof getDb>,
  startHash: string | null,
  maxDepth: number,
): Promise<ChainWalkResult> {
  let currentHash = startHash;
  let length = 0;
  let verifiedLinks = 0;
  let brokenLinks = 0;
  let redactedLinks = 0;
  // World-class #6: per-reason redaction tally
  let redactedByUserRequest = 0;
  let redactedByRetentionPurge = 0;
  let redactedByOther = 0;
  let reachesGenesis = false;
  let startDate: string | null = null;
  let firstBrokenLinkId: string | null = null;

  let truncated = false;
  while (currentHash && length < maxDepth) {
    // Check for genesis
    if (currentHash === GENESIS_HASH) {
      reachesGenesis = true;
      break;
    }

    // Use Drizzle ORM (not raw SQL) for consistent Date/JSONB handling
    const [prev] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.integrityHash, currentHash))
      .limit(1);

    if (!prev) break;

    length++;

    // F-AUDIT-13/16: redacted rows (deletedAt IS NOT NULL) had their
    // input/output/audit_trail zeroed under GDPR Art. 17 OR by retention
    // purge. Their stored integrityHash predates the redaction; recomputing
    // now will mismatch by design. Treat as a third category — neither
    // verified nor broken. World-class #6: tally by deletion_reason so
    // the response can report user_request vs retention_purge separately.
    if (prev.deletedAt != null) {
      redactedLinks++;
      const reason = prev.deletionReason ?? "";
      if (reason === "user_request") redactedByUserRequest++;
      else if (reason === "retention_purge") redactedByRetentionPurge++;
      else redactedByOther++;
      startDate = prev.createdAt instanceof Date
        ? prev.createdAt.toISOString().slice(0, 10)
        : String(prev.createdAt).slice(0, 10);
      currentHash = prev.previousHash;
      continue;
    }

    // Same field mapping as storeIntegrityHash() in do.ts
    const recomputed = computeIntegrityHash(
      {
        id: prev.id,
        userId: prev.userId,
        status: prev.status,
        input: prev.input,
        output: prev.output,
        error: prev.error,
        priceCents: prev.priceCents,
        latencyMs: prev.latencyMs,
        provenance: prev.provenance,
        auditTrail: prev.auditTrail,
        transparencyMarker: prev.transparencyMarker,
        dataJurisdiction: prev.dataJurisdiction,
        createdAt: prev.createdAt,
        completedAt: prev.completedAt,
      },
      prev.previousHash ?? GENESIS_HASH,
    );

    if (recomputed === prev.integrityHash) {
      verifiedLinks++;
    } else {
      brokenLinks++;
      if (!firstBrokenLinkId) firstBrokenLinkId = prev.id;
    }

    startDate = prev.createdAt instanceof Date
      ? prev.createdAt.toISOString().slice(0, 10)
      : String(prev.createdAt).slice(0, 10);

    currentHash = prev.previousHash;
  }

  // Check if we ended at genesis after exiting the loop
  if (currentHash === GENESIS_HASH) {
    reachesGenesis = true;
  }

  // F-A-012: loop exited due to the depth cap (rather than genesis,
  // a missing link, or a null pointer). Caller needs this to know the
  // chain continues past what we returned.
  if (length >= maxDepth && currentHash && currentHash !== GENESIS_HASH) {
    truncated = true;
  }

  return {
    length,
    verifiedLinks,
    brokenLinks,
    redactedLinks,
    redactedByReason: {
      user_request: redactedByUserRequest,
      retention_purge: redactedByRetentionPurge,
      other: redactedByOther,
    },
    reachesGenesis,
    startDate,
    firstBrokenLinkId,
    truncated,
  };
}

// Pure helper, exported for unit testing. Mirrors the per-row classification
// logic in walkChain but operates on a single fetched row so tests can exercise
// the redacted-vs-broken-vs-verified decision without spinning up a DB.
export type ChainLinkClassification = "verified" | "redacted" | "broken";

export function classifyChainLink(prev: {
  deletedAt: Date | null;
  integrityHash: string | null;
  recomputedHash: string | null;
}): ChainLinkClassification {
  if (prev.deletedAt != null) return "redacted";
  if (prev.integrityHash != null && prev.recomputedHash === prev.integrityHash) return "verified";
  return "broken";
}
