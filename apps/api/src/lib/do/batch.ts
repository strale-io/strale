/**
 * Batch calls: many inputs to one capability, one order, one reservation
 * (portfolio plan Phase 3 item 5, DEC-20261024-B). API-key wallet path only;
 * x402 batch payment is designed in docs/design/2026-10-29-x402-batch-payment.md
 * and not built.
 *
 * Money model — the H4 reserve-execute-capture model (PR #779), per item:
 *
 *   1. ONE short transaction holds the wallet lock, checks the key policy, the
 *      balance and the hourly spend cap against the WHOLE quote, and opens one
 *      `hold` reservation per item with no transaction row yet. Either every
 *      hold is taken or none is: a batch is never half-reserved.
 *   2. Items run outside any transaction with bounded concurrency. An item that
 *      starts links its hold to a new transaction row (conditional on the hold
 *      still being open); one that never starts — the batch time budget ran out
 *      — is released without ever having a row, so it cannot read as a paid
 *      customer failure in the quality and alerting queries.
 *   3. Each item settles in its own short transaction: success captures its
 *      hold (the debit happens here), failure releases it. DEC-14: a failed
 *      item is never charged.
 *
 * A crash at any point leaves open holds with deadlines; the reservation
 * reconciler releases them and marks any linked transaction failed, exactly as
 * it does for a single sync call. Nothing on the order row needs repair: it is
 * written once and every outcome is read from the holds.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type Context } from "hono";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import { batchOrders, transactions, walletReservations } from "../../db/schema.js";
import { keyCapError } from "../api-keys.js";
import { setCostDeadline, noteUnknownCost, withCallCost } from "../call-cost.js";
import { sortKeysDeep } from "../canonical/jcs.js";
import { refusalDetails } from "../capability-refusal.js";
import { checkCircuitBreaker, recordFailure, recordSuccess } from "../circuit-breaker.js";
import { EUR_USD_RATE } from "../currency.js";
import { apiError, type ApiError } from "../errors.js";
import { assertBillableOutput, shouldCountAgainstCapability } from "../execution-outcome.js";
import { fireAndForget } from "../fire-and-forget.js";
import { validateDispatchInput } from "../input-validation.js";
import { logError } from "../log.js";
import { inputForFingerprint, inputForPersistence } from "../never-persist-inputs.js";
import { recordPiggybackResult } from "../piggyback-monitor.js";
import { buildFailureProvenance, getProcessingJurisdictions } from "../provenance-builder.js";
import { recordQuality } from "../quality-capture.js";
import { deployCommitOrNull } from "../receipt/deploy-identity.js";
import { sanitizeFailureReason } from "../sanitize.js";
import * as reservations from "../wallet-reservations.js";
import * as walletService from "../wallet-service.js";
import { validateX402Input } from "../x402-input-validation.js";
import type { AppEnv } from "../../types.js";
import { buildFailureAudit, buildFullAudit, getTransparencyMarker } from "./audit.js";
import { persistCallCost } from "../persist-call-cost.js";
import { settleExecutionReceipt } from "../receipt/settle.js";
import {
  ExecutionTimeoutError,
  executeWithHardTimeout,
  executeWithRetry,
} from "./dispatch.js";
import { spendCapWouldExceed } from "./idempotency.js";
import type { CapabilityInfo } from "./types.js";

/** Most inputs one batch may carry. */
export const BATCH_MAX_ITEMS = 100;
/** €100: 100 items at the top of the €0.02–€1.00 price band. */
export const BATCH_MAX_TOTAL_CENTS = 10_000;
/** Items in flight at once for one batch. */
export const BATCH_CONCURRENCY = 5;
/**
 * Wall-clock budget for the whole batch. Kept under the 100s a proxy in front
 * of the API may allow a response, and far under the 15-minute reservation
 * TTL, so the reconciler never releases a hold whose item is still running.
 */
export const BATCH_TIME_BUDGET_MS = 90_000;
/** An item is not started with less than this left in the batch budget. */
export const BATCH_MIN_ITEM_START_MS = 5_000;
/**
 * Items per key per minute, in a bucket of its own: a batch counts its items,
 * not itself, all or nothing, and only when it is about to reserve (a replay,
 * an invalid batch or a dry run costs nothing). This adds to /v1/do's own
 * 10 requests/second per key; it does not share that bucket.
 */
export const BATCH_ITEMS_PER_MINUTE = 300;

export type BatchUser = { id: string; maxSpendPerHourCents?: number | null };

/**
 * What an Idempotency-Key on a batch is a key TO. Bound to the capability and
 * every input in order, so the same key reused for different work is a 409,
 * never a replay of someone else's answer (the WP6 rule for single calls).
 * Never-persisted fields are masked first, as for single calls.
 */
export function computeBatchFingerprint(slug: string, inputs: Record<string, unknown>[]): string {
  const canonical = sortKeysDeep({
    rail: "batch",
    capability_slug: slug,
    inputs: inputs.map((input) => inputForFingerprint(slug, input)),
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

const DO_BODY_KEYS = new Set(["task", "capability_slug", "inputs", "max_price_cents", "max_total_price_cents", "dry_run"]);

/**
 * Validate one item's inputs with the same rules /v1/do applies to a single
 * call: the compiled schema, classic required fields, and anyOf/oneOf groups.
 * Returns the refusal for the item, or null. A schema the platform cannot
 * compile is returned as `capability_unavailable`, which refuses the batch.
 */
export function validateBatchItem(
  capability: { slug: string; inputSchema: unknown },
  input: unknown,
): ApiError | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return apiError("invalid_request", "Each item in 'inputs' must be a JSON object of the tool's parameters.");
  }
  const item = input as Record<string, unknown>;
  const schema = capability.inputSchema as { required?: string[]; properties?: Record<string, unknown>; anyOf?: unknown; oneOf?: unknown } | null;
  const confused = Object.keys(item).filter((k) => DO_BODY_KEYS.has(k));
  if (confused.length > 0 && schema?.properties) {
    return apiError("invalid_request", "This item looks like a request envelope; an item holds only the tool's parameters.", {
      confused_keys: confused,
      expected_fields: Object.keys(schema.properties),
    });
  }
  const schemaFailure = validateDispatchInput(capability.slug, "wallet", schema, item);
  if (schemaFailure) return schemaFailure;
  if (Array.isArray(schema?.required) && schema?.properties) {
    const missing = schema.required.filter((f) => !(f in item) || item[f] === undefined);
    if (missing.length > 0) {
      return apiError("invalid_request", `Missing required input fields: ${missing.join(", ")}`, {
        missing_fields: missing,
        expected_fields: Object.keys(schema.properties),
      });
    }
  }
  if (Array.isArray(schema?.anyOf) || Array.isArray(schema?.oneOf)) {
    const group = validateX402Input(item, schema as Record<string, unknown>);
    if (!group.ok) return apiError("invalid_request", group.error);
  }
  return null;
}

// ─── Reserve ─────────────────────────────────────────────────────────────────

type BatchOrderRow = typeof batchOrders.$inferSelect;

export type ReserveOutcome =
  | { kind: "replay"; order: BatchOrderRow }
  | { kind: "key_conflict"; transactionId: string }
  | { kind: "key_policy"; error: ApiError }
  | { kind: "insufficient_balance"; balance: number; required: number }
  | { kind: "spend_cap_exceeded"; spent: number; limit: number; required: number }
  | { kind: "reserved"; batchId: string; reservationIds: string[] };

/**
 * Take every item's hold in one transaction, or none.
 *
 * Each check here is the single-call check applied to the whole quote: the
 * key's caps, the balance (net of other open holds) and the account's hourly
 * cap. Items count as their prices, so a batch can reach exactly what the same
 * calls made one by one could, and no further.
 */
export async function reserveBatch(params: {
  db: ReturnType<typeof getDb>;
  user: BatchUser;
  apiKeyId: string | null | undefined;
  capability: CapabilityInfo;
  itemCount: number;
  maxTotalPriceCents: number;
  idempotencyKey: string | null;
  fingerprint: string;
}): Promise<ReserveOutcome> {
  const { db, user, capability, itemCount, idempotencyKey } = params;
  const unitPrice = capability.priceCents;
  const total = unitPrice * itemCount;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    const wallet = await walletService.lockWalletForUser(tx, user.id);

    // Rechecked under the wallet lock: two submissions of one key serialise
    // here, and the second replays (in progress) instead of reserving again.
    if (idempotencyKey) {
      const [order] = await tx.select().from(batchOrders)
        .where(and(eq(batchOrders.userId, user.id), eq(batchOrders.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (order) return { kind: "replay" as const, order };
      // Keys are account-wide. A key already spent on a single call is not a
      // retry of this batch, and replaying either as the other would answer a
      // question nobody asked.
      const [single] = await tx.select({ id: transactions.id }).from(transactions)
        .where(and(eq(transactions.userId, user.id), eq(transactions.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (single) return { kind: "key_conflict" as const, transactionId: single.id };
    }

    const keyError = await keyCapError(tx, user.id, params.apiKeyId, total);
    if (keyError) return { kind: "key_policy" as const, error: keyError };

    if (!wallet || wallet.balanceCents < total) {
      return { kind: "insufficient_balance" as const, balance: wallet?.balanceCents ?? 0, required: total };
    }

    if (user.maxSpendPerHourCents) {
      const over = await spendCapWouldExceed(tx, user.id, total, user.maxSpendPerHourCents);
      if (over) {
        return { kind: "spend_cap_exceeded" as const, spent: over.spent, limit: user.maxSpendPerHourCents, required: total };
      }
    }

    // Holds leave the ledger balance alone; each reserve sees the balance net
    // of the holds before it, so no single hold is checked against money an
    // earlier item already holds.
    const reservationIds: string[] = [];
    let available = wallet.balanceCents;
    for (let i = 0; i < itemCount; i++) {
      const reservation = await reservations.reserve(tx, {
        wallet: { id: wallet.id, balanceCents: available },
        userId: user.id,
        amountCents: unitPrice,
        transactionId: null,
        apiKeyId: params.apiKeyId ?? null,
        description: `Batch item ${i + 1}/${itemCount}: ${capability.slug}`,
        mode: "hold",
      });
      reservationIds.push(reservation.id);
      available -= unitPrice;
    }

    const [order] = await tx.insert(batchOrders).values({
      userId: user.id,
      apiKeyId: params.apiKeyId ?? null,
      capabilityId: capability.id,
      idempotencyKey,
      idempotencyFingerprint: params.fingerprint,
      itemCount,
      unitPriceCents: unitPrice,
      quotedTotalCents: total,
      maxTotalPriceCents: params.maxTotalPriceCents,
      itemReservationIds: reservationIds,
    }).returning({ id: batchOrders.id });

    return { kind: "reserved" as const, batchId: order.id, reservationIds };
  });
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export type BatchItemStatus = "completed" | "failed" | "not_run";

export interface BatchItemResult {
  index: number;
  status: BatchItemStatus;
  transaction_id: string | null;
  /** What this item was charged: the unit price if completed, else 0. */
  price_cents: number;
  latency_ms: number | null;
  output: unknown;
  provenance: unknown;
  error?: { error_code: string; message: string; retryable: boolean; detail?: string } & Record<string, unknown>;
}

const NOT_RUN_MESSAGE = "Not started: the batch time budget ran out first. You were not charged; resend this input.";
const BREAKER_MESSAGE = "Not started: the tool was suspended after repeated failures while the batch ran. You were not charged; resend this input later.";

function notRun(index: number, message = NOT_RUN_MESSAGE): BatchItemResult {
  return {
    index, status: "not_run", transaction_id: null, price_cents: 0, latency_ms: null, output: null, provenance: null,
    error: { error_code: message === BREAKER_MESSAGE ? "capability_unavailable" : "timeout_exceeded", message, retryable: true },
  };
}

interface RunContext {
  c: Context<AppEnv>;
  db: ReturnType<typeof getDb>;
  user: BatchUser;
  capability: CapabilityInfo;
  executor: (input: Record<string, unknown>) => Promise<any>;
  outputSchema: Record<string, unknown>;
  itemTimeoutMs: number;
  batchDeadline: number;
}

/**
 * Record the item's cost and build its execution receipt, after its settlement
 * transaction has committed and never inside it — a receipt must not be able
 * to roll back a payment. Same rail and order as executeSync's settleReceiptFor.
 */
async function settleItemReceipt(transactionId: string): Promise<void> {
  persistCallCost(transactionId);
  await settleExecutionReceipt(getDb(), { transactionId, rail: "v1_do" });
}

/** Close a hold whose item will not run. Holds never moved money, so nothing is refunded. */
async function releaseUnstarted(db: ReturnType<typeof getDb>, reservationId: string, reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await reservations.release(tx, { reservationId, reason });
  });
}

/**
 * One item, start to settled. Mirrors executeSync's execute-and-settle half;
 * the reserve half is reserveBatch.
 */
async function runItem(ctx: RunContext, index: number, input: Record<string, unknown>, reservationId: string): Promise<BatchItemResult> {
  const { db, user, capability, executor } = ctx;

  if (ctx.batchDeadline - Date.now() < BATCH_MIN_ITEM_START_MS) {
    await releaseUnstarted(db, reservationId, "batch time budget exhausted before the item started");
    return notRun(index);
  }
  // Rechecked per item: a vendor that starts failing mid-batch trips the
  // breaker, and the items still waiting must not keep calling it.
  const circuit = await checkCircuitBreaker(capability.slug);
  if (!circuit.allowed) {
    await releaseUnstarted(db, reservationId, "circuit breaker open before the item started");
    return notRun(index, BREAKER_MESSAGE);
  }

  const startTime = Date.now();
  const transactionId = randomUUID();
  const marker = getTransparencyMarker(capability.transparencyTag);
  const linked = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    // Link first: if the hold is no longer open, nothing pays for this item,
    // so it must not get a row or run.
    const ok = await reservations.linkTransaction(tx, { reservationId, transactionId });
    if (!ok) return false;
    await tx.insert(transactions).values({
      id: transactionId,
      receiptRail: "v1_do",
      receiptDeployCommit: deployCommitOrNull(),
      userId: user.id,
      capabilityId: capability.id,
      status: "executing",
      complianceHashState: "deferred",
      clientMeta: ctx.c.get("clientMeta") ?? null,
      input: inputForPersistence(capability.slug, input),
      priceCents: capability.priceCents,
      transparencyMarker: marker,
      dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
    });
    return true;
  });
  if (!linked) return notRun(index);

  const itemBudgetMs = Math.min(ctx.itemTimeoutMs, ctx.batchDeadline - Date.now());
  let completed: { latencyMs: number; output: unknown; provenance: unknown };
  try {
    const deadline = setCostDeadline(itemBudgetMs);
    const capResult = await executeWithHardTimeout(
      executeWithRetry((inp) => {
        if (Date.now() >= deadline) throw new ExecutionTimeoutError(itemBudgetMs);
        return executor(inp);
      }, input, capability, { kind: "account", userId: user.id }, deadline),
      Math.max(0, deadline - Date.now()),
    ).catch((err: unknown) => {
      if (Date.now() >= deadline) throw new ExecutionTimeoutError(itemBudgetMs);
      throw err;
    });
    if (Date.now() >= deadline) throw new ExecutionTimeoutError(itemBudgetMs);
    assertBillableOutput(capability.slug, capResult.output);
    const latencyMs = Date.now() - startTime;

    const audit = buildFullAudit({
      transactionId, startTime, capability, marker, executionMode: "sync", latencyMs,
      executionInput: input, output: capResult.output, outputSchema: ctx.outputSchema,
      provenance: capResult.provenance, requestContext: ctx.c.get("requestContext"),
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await walletService.lockWalletForUser(tx, user.id);
      await tx.update(transactions).set({
        status: "completed",
        complianceHashState: "pending",
        output: capResult.output,
        provenance: capResult.provenance,
        latencyMs,
        completedAt: new Date(),
        auditTrail: audit,
      }).where(eq(transactions.id, transactionId));
      const captured = await reservations.capture(tx, { reservationId });
      if (!captured) throw new reservations.ReservationNotOpenError(reservationId, "capture");
    });
    completed = { latencyMs, output: capResult.output, provenance: capResult.provenance };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof ExecutionTimeoutError;
    if (timedOut) noteUnknownCost("sync_execution_timed_out");
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.update(transactions).set({
        status: "failed",
        complianceHashState: "pending",
        error: errorMessage,
        latencyMs,
        completedAt: new Date(),
        auditTrail: buildFailureAudit({ transactionId, startTime, capability, executionInput: input, errorMessage, executionMode: "sync" }),
        provenance: buildFailureProvenance(capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error"),
      }).where(and(eq(transactions.id, transactionId), inArray(transactions.status, ["executing", "deferred"])));
      await reservations.release(tx, { reservationId, reason: timedOut ? "batch item timeout" : "batch item execution failed" });
    });

    await settleItemReceipt(transactionId);
    if (!timedOut && shouldCountAgainstCapability(err)) {
      fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
      recordQuality({ transactionId, responseTimeMs: latencyMs, output: null, outputSchema: ctx.outputSchema, error: errorMessage });
    }
    return {
      index, status: "failed", transaction_id: transactionId, price_cents: 0, latency_ms: latencyMs, output: null, provenance: null,
      error: {
        error_code: timedOut ? "timeout_exceeded" : "execution_failed",
        message: timedOut ? "The item exceeded its time budget. You were not charged for it." : "The item failed to execute. You were not charged for it.",
        retryable: timedOut,
        detail: sanitizeFailureReason(errorMessage),
        ...refusalDetails(err),
      },
    };
  }

  // Charged and committed. Everything below is bookkeeping and runs outside
  // the try, so a fault here can never report a charged item as free.
  await settleItemReceipt(transactionId);
  fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
  recordQuality({ transactionId, responseTimeMs: completed.latencyMs, output: completed.output, outputSchema: ctx.outputSchema });
  if (completed.output) {
    fireAndForget(
      () => recordPiggybackResult(capability.slug, completed.output, ctx.outputSchema, completed.latencyMs),
      { label: "piggyback-record", context: { slug: capability.slug } },
    );
  }
  return {
    index, status: "completed", transaction_id: transactionId, price_cents: capability.priceCents,
    latency_ms: completed.latencyMs, output: completed.output, provenance: completed.provenance,
  };
}

/**
 * Run every item with at most BATCH_CONCURRENCY in flight and return results
 * in input order. One item's failure — including a database error settling it
 * — never stops the others; such an item's hold stays open for the reconciler,
 * and the caller is told the item's outcome is unknown rather than charged.
 */
export async function runBatch(params: Omit<RunContext, "batchDeadline"> & {
  inputs: Record<string, unknown>[];
  reservationIds: string[];
  batchId: string;
  /** Test seam; the route always uses BATCH_TIME_BUDGET_MS. */
  timeBudgetMs?: number;
}): Promise<BatchItemResult[]> {
  const ctx: RunContext = { ...params, batchDeadline: Date.now() + (params.timeBudgetMs ?? BATCH_TIME_BUDGET_MS) };
  const results: BatchItemResult[] = new Array(params.inputs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= params.inputs.length) return;
      try {
        // Each item gets its own cost scope, so its receipt and recorded cost
        // are its own and not the sum of whatever else ran beside it.
        results[i] = await withCallCost(() => runItem(ctx, i, params.inputs[i], params.reservationIds[i]), EUR_USD_RATE);
      } catch (err) {
        logError("batch-item-settle-failed", err, { batch_id: params.batchId, index: i, reservation_id: params.reservationIds[i] });
        results[i] = {
          index: i, status: "failed", transaction_id: null, price_cents: 0, latency_ms: null, output: null, provenance: null,
          error: {
            error_code: "transaction_finalization_failed",
            message: "This item's outcome could not be recorded. Any charge for it is released automatically within 15 minutes; check the batch again with the same Idempotency-Key.",
            retryable: true,
          },
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, params.inputs.length) }, worker));
  return results;
}

// ─── Respond ─────────────────────────────────────────────────────────────────

export function summarise(results: BatchItemResult[]) {
  const succeeded = results.filter((r) => r.status === "completed").length;
  const notRun = results.filter((r) => r.status === "not_run").length;
  const failed = results.length - succeeded - notRun;
  return {
    status: succeeded === results.length ? "completed" : succeeded === 0 ? "failed" : "partial",
    succeeded,
    failed,
    not_run: notRun,
    charged_cents: results.reduce((sum, r) => sum + r.price_cents, 0),
  };
}

/**
 * Rebuild a batch's answer from what the database recorded: the holds, and
 * the transactions they link to. Used for Idempotency-Key replays, so a
 * client that lost the response gets the same per-item outcomes and charges.
 *
 * Returns null while any hold is still open — the batch is still running, or
 * a crash left it for the reconciler to finish.
 */
export async function loadBatchResults(db: ReturnType<typeof getDb>, order: BatchOrderRow): Promise<BatchItemResult[] | null> {
  const ids = order.itemReservationIds;
  const holds = await db.select({
    id: walletReservations.id, state: walletReservations.state, transactionId: walletReservations.transactionId,
    terminalReason: walletReservations.terminalReason,
  }).from(walletReservations).where(inArray(walletReservations.id, ids));
  if (holds.some((h) => h.state === "reserved" || h.state === "executing")) return null;
  const byId = new Map(holds.map((h) => [h.id, h]));
  const txIds = holds.map((h) => h.transactionId).filter((id): id is string => id !== null);
  const rows = txIds.length === 0 ? [] : await db.select({
    id: transactions.id, status: transactions.status, output: transactions.output, provenance: transactions.provenance,
    latencyMs: transactions.latencyMs, error: transactions.error,
  }).from(transactions).where(and(inArray(transactions.id, txIds), isNull(transactions.deletedAt)));
  const txById = new Map(rows.map((r) => [r.id, r]));

  // Decided from the hold, which is what moved (or did not move) money. A
  // captured hold was charged even if its transaction row has since been
  // deleted; only a released hold that never got a row was never run.
  return ids.map((reservationId, index): BatchItemResult => {
    const hold = byId.get(reservationId);
    const row = hold?.transactionId ? txById.get(hold.transactionId) : undefined;
    if (hold?.state === "captured") {
      return {
        index, status: "completed", transaction_id: hold.transactionId, price_cents: order.unitPriceCents,
        latency_ms: row?.latencyMs ?? null, output: row?.output ?? null, provenance: row?.provenance ?? null,
      };
    }
    if (!hold?.transactionId) {
      return notRun(index, hold?.terminalReason === "circuit breaker open before the item started" ? BREAKER_MESSAGE : NOT_RUN_MESSAGE);
    }
    if (!row) {
      return {
        index, status: "failed", transaction_id: hold.transactionId, price_cents: 0, latency_ms: null, output: null, provenance: null,
        error: { error_code: "execution_failed", message: "The item did not complete. You were not charged for it.", retryable: true },
      };
    }
    const timedOut = hold.terminalReason === "batch item timeout";
    return {
      index, status: "failed", transaction_id: row.id, price_cents: 0, latency_ms: row.latencyMs, output: null, provenance: null,
      error: {
        error_code: timedOut ? "timeout_exceeded" : "execution_failed",
        message: timedOut ? "The item exceeded its time budget. You were not charged for it." : "The item failed to execute. You were not charged for it.",
        retryable: timedOut,
        detail: sanitizeFailureReason(row.error ?? "unknown error"),
      },
    };
  });
}
