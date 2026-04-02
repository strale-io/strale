/**
 * Hash chain verification endpoint — public, no auth required.
 * Recomputes a transaction's SHA-256 hash and walks the chain backward.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { computeIntegrityHash } from "../lib/integrity-hash.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

import { createHash } from "node:crypto";
const GENESIS_HASH = createHash("sha256").update("strale-genesis-v1").digest("hex");
const MAX_DEPTH = 200;
const DEFAULT_DEPTH = 50;

export const verifyRoute = new Hono<AppEnv>();

// Rate limit: 30 req/min per IP
verifyRoute.use("*", rateLimitByIp(30, 60_000));

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

  return c.json({
    transaction_id: transactionId,
    verified: hashValid && chain.brokenLinks === 0,
    hash_valid: hashValid,
    chain: {
      length: chain.length + 1, // +1 for the target transaction
      verified_links: chain.verifiedLinks + (hashValid ? 1 : 0),
      broken_links: chain.brokenLinks + (hashValid ? 0 : 1),
      reaches_genesis: chain.reachesGenesis,
      chain_start_date: chain.startDate,
      chain_end_date: txn.createdAt instanceof Date
        ? txn.createdAt.toISOString().slice(0, 10)
        : String(txn.createdAt).slice(0, 10),
      ...(chain.firstBrokenLinkId ? { first_broken_link_id: chain.firstBrokenLinkId } : {}),
      max_depth: maxDepth,
    },
    transaction_metadata: {
      created_at: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : txn.createdAt,
      capability_slug: capSlug,
      transparency_marker: txn.transparencyMarker,
      data_jurisdiction: txn.dataJurisdiction,
      status: txn.status,
    },
    methodology_url: "https://strale.dev/trust/methodology",
  });
});

// ── Chain walk ────────────────────────────────────────────────────────────────

interface ChainWalkResult {
  length: number;
  verifiedLinks: number;
  brokenLinks: number;
  reachesGenesis: boolean;
  startDate: string | null;
  firstBrokenLinkId: string | null;
}

async function walkChain(
  db: ReturnType<typeof getDb>,
  startHash: string | null,
  maxDepth: number,
): Promise<ChainWalkResult> {
  let currentHash = startHash;
  let length = 0;
  let verifiedLinks = 0;
  let brokenLinks = 0;
  let reachesGenesis = false;
  let startDate: string | null = null;
  let firstBrokenLinkId: string | null = null;

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

  return { length, verifiedLinks, brokenLinks, reachesGenesis, startDate, firstBrokenLinkId };
}
