import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions } from "../db/schema.js";
import { deployCommitOrNull } from "./receipt/deploy-identity.js";
import { openIntent } from "./x402-settlement-intent.js";
import type { WalletTx } from "./wallet-service.js";

const MAX_EXECUTIONS = 2;

async function attemptsForHash(tx: WalletTx, paymentHash: string): Promise<number> {
  const [row] = await tx.execute(sql`
    SELECT COALESCE(SUM((x402_execution_attempts->>'count')::integer), 0)::integer AS attempts
    FROM transactions WHERE x402_execution_attempts IS NOT NULL
      AND x402_execution_attempts->>'paymentHash' = ${paymentHash}
  `) as unknown as Array<{ attempts: number }>;
  return Number(row?.attempts ?? 0);
}

/** The unique hash slot serializes admission, including the durable retry budget. */
export async function claimX402Payment(paymentHash: string, capabilityId: string | null, solutionSlug: string | null, receiptRail: "x402" | "v1_do" = "x402"): Promise<string | null> {
  return getDb().transaction(async tx => {
    const [row] = await tx.insert(transactions).values({
      userId: null, capabilityId, solutionSlug, status: "executing", input: {}, priceCents: 0,
      paymentMethod: "x402", x402PaymentHash: paymentHash, isFreeTier: false,
      receiptRail, receiptDeployCommit: deployCommitOrNull(), complianceHashState: "deferred",
      x402ExecutionAttempts: { paymentHash, count: 0 },
    }).onConflictDoNothing().returning({ id: transactions.id });
    if (!row) return null;
    if (await attemptsForHash(tx, paymentHash) >= MAX_EXECUTIONS) {
      await tx.delete(transactions).where(eq(transactions.id, row.id));
      return null;
    }
    return row.id;
  });
}

async function lockClaim(tx: WalletTx, transactionId: string, paymentHash: string) {
  const [row] = await tx.select().from(transactions).where(and(
    eq(transactions.id, transactionId), eq(transactions.x402PaymentHash, paymentHash),
    eq(transactions.status, "executing"), isNull(transactions.x402SettlementId),
  )).for("update");
  if (!row) throw new Error("Payment claim is no longer owned by this request");
  return row;
}

/** Count each executor invocation, including a transient retry, before any vendor work. */
export async function beginX402Execution(transactionId: string, paymentHash: string): Promise<void> {
  await getDb().transaction(async tx => {
    const row = await lockClaim(tx, transactionId, paymentHash);
    if (await attemptsForHash(tx, paymentHash) >= MAX_EXECUTIONS) {
      throw new Error("Payment execution limit reached");
    }
    await tx.update(transactions).set({ x402ExecutionAttempts: {
      paymentHash, count: (row.x402ExecutionAttempts?.count ?? 0) + 1,
    } }).where(eq(transactions.id, transactionId));
  });
}

/** A janitor and an intent writer lock the claim first; a swept owner cannot settle. */
export async function openClaimedX402Intent(transactionId: string, params: Parameters<typeof openIntent>[1]) {
  return getDb().transaction(async tx => {
    await lockClaim(tx, transactionId, params.paymentHash);
    return openIntent(tx, params);
  });
}

export async function releaseX402Claim(transactionId: string, paymentHash: string, executionStarted: boolean): Promise<void> {
  const db = getDb();
  const owned = and(eq(transactions.id, transactionId), eq(transactions.x402PaymentHash, paymentHash),
    eq(transactions.status, "executing"), isNull(transactions.x402SettlementId));
  if (!executionStarted) {
    await db.delete(transactions).where(owned);
    return;
  }
  await db.update(transactions).set({
    x402PaymentHash: null, status: "failed", complianceHashState: "pending",
    error: "Request ended before payment settlement", completedAt: new Date(),
  }).where(owned);
}

/** Called by the existing minute sweeper. Lock first, then check intents in a fresh snapshot. */
export async function releaseStaleX402Claims(tx: WalletTx, limit: number): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT id, x402_payment_hash, x402_execution_attempts FROM transactions t
    WHERE payment_method = 'x402' AND status = 'executing'
      AND x402_payment_hash IS NOT NULL AND x402_settlement_id IS NULL
      AND created_at < now() - interval '10 minutes'
      AND NOT EXISTS (SELECT 1 FROM x402_settlement_intents i WHERE i.payment_hash = t.x402_payment_hash)
    ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
  `) as unknown as Array<{ id: string; x402_payment_hash: string; x402_execution_attempts: { count: number } | null }>;
  let released = 0;
  for (const row of rows) {
    // Separate statement after acquiring the row lock: an intent writer may
    // have committed while the first statement was acquiring its snapshot.
    const intents = await tx.execute(sql`SELECT id FROM x402_settlement_intents WHERE payment_hash = ${row.x402_payment_hash} LIMIT 1`);
    if (intents.length) continue;
    if ((row.x402_execution_attempts?.count ?? 0) === 0) {
      await tx.delete(transactions).where(eq(transactions.id, row.id));
    } else {
      await tx.update(transactions).set({ x402PaymentHash: null, status: "failed",
        error: "Execution abandoned before settlement intent", completedAt: new Date(), complianceHashState: "pending",
      }).where(eq(transactions.id, row.id));
    }
    released++;
  }
  return released;
}

export async function findCachedX402Response(
  paymentHash: string,
): Promise<Pick<typeof transactions.$inferSelect, "id" | "status" | "output" | "latencyMs" | "priceCents" | "provenance" | "auditTrail" | "capabilityId" | "solutionSlug"> & { settlementId: string | null } | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      priceCents: transactions.priceCents,
      provenance: transactions.provenance,
      auditTrail: transactions.auditTrail,
      status: transactions.status,
      output: transactions.output,
      latencyMs: transactions.latencyMs,
      settlementId: transactions.x402SettlementId,
      capabilityId: transactions.capabilityId,
      solutionSlug: transactions.solutionSlug,
    })
    .from(transactions)
    .where(eq(transactions.x402PaymentHash, paymentHash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * A payment is bound to the work it was first claimed for. Two capabilities at
 * the same price verify the same signed authorization, so a replay must match
 * the stored row's capability and solution before its output is served.
 */
export function x402PaymentBoundElsewhere(
  row: { capabilityId?: string | null; solutionSlug?: string | null },
  work: { capabilityId: string | null; solutionSlug: string | null },
): boolean {
  return (row.capabilityId ?? null) !== work.capabilityId || (row.solutionSlug ?? null) !== work.solutionSlug;
}
