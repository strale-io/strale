import { and, eq, inArray, sql } from "drizzle-orm";
import { type Context } from "hono";
import { getDb } from "../../db/index.js";
import { transactions, users, wallets } from "../../db/schema.js";
import { keyCapError } from "../api-keys.js";
import { getShareableUrl } from "../audit-token.js";
import { noteUnknownCost, setCostDeadline } from "../call-cost.js";
import { refusalDetails } from "../capability-refusal.js";
import { recordFailure, recordSuccess } from "../circuit-breaker.js";
import { pgErrorCode } from "../db-error.js";
import { apiError, type ApiError } from "../errors.js";
import { triggerOnFailure } from "../event-triggers.js";
import { assertBillableOutput, outcomeFromError, outcomeFromOutput, shouldCountAgainstCapability } from "../execution-outcome.js";
import { fireAndForget } from "../fire-and-forget.js";
import { computeServedFree, recordAnonymousInvocation } from "../invocation-facts.js";
import { logError, logWarn } from "../log.js";
import { checkMilestone } from "../milestones.js";
import { inputForPersistence } from "../never-persist-inputs.js";
import { persistCallCost } from "../persist-call-cost.js";
import { recordPiggybackResult } from "../piggyback-monitor.js";
import { buildFailureProvenance, getProcessingJurisdictions } from "../provenance-builder.js";
import { recordQuality } from "../quality-capture.js";
import { deployCommitOrNull } from "../receipt/deploy-identity.js";
import { settleExecutionReceipt } from "../receipt/settle.js";
import { executeWithTransientRetry } from "../retry.js";
import { sanitizeFailureReason, redactAuditTrail } from "../sanitize.js";
import { trackBackgroundTask } from "../shutdown.js";
import { type FreshnessInfo } from "../trust-grade.js";
import * as reservations from "../wallet-reservations.js";
import * as jobCallbacks from "../jobs/callbacks.js";
import { insertJobFiles, manifestOf, prepareFiles } from "../jobs/files.js";
import * as walletService from "../wallet-service.js";
import { claimX402Payment, findCachedX402Response, beginX402Execution, releaseX402Claim } from "../x402-payment-claims.js";
import { captureX402RecordingFailure } from "../x402-recording.js";
import { eurCentsToUsd, extractPayerAddress } from "../x402-gateway.js";
import { settleX402Execution } from "../x402-settle.js";
import * as settlementIntent from "../x402-settlement-intent.js";
import type { AppEnv } from "../../types.js";
import { getUnlockedSlugs, recordUnlock } from "../progressive-unlock.js";
import { buildFailureAudit, buildFullAudit, getTransparencyMarker } from "./audit.js";
import { replaySyncRequest, spendCapWouldExceed } from "./idempotency.js";
import type { CapabilityInfo } from "./types.js";
import { buildUpgradeBlock } from "./upgrade.js";

// F-0-009 Stage 2: integrity hashing moved to jobs/integrity-hash-retry.ts.

// Usage/cost headers for Beacon transactability
function setCreditsHeaders(c: { header: (name: string, value: string) => void }, balanceCents: number, costCents?: number) {
  c.header("X-Credits-Remaining", String(balanceCents));
  c.header("X-Credits-Currency", "EUR");
  if (costCents !== undefined) {
    c.header("X-Cost-Cents", String(costCents));
  }
}

/**
 * Who the invocation fact should be attributed to.
 *
 * Threaded as an explicit parameter rather than read from a context, so adding
 * a fifth execution path to this route is a COMPILE error until it says whose
 * call it is. WP4 was accepted with one of five rails silently unwired; a
 * required parameter is the cheapest way to make that particular mistake
 * unavailable.
 */
/**
 * Who the invocation fact belongs to, as a discriminated union.
 *
 * The union is the guard. Only the anonymous variant carries `servedFree`, so
 * the three authenticated execution paths cannot express "this was served free"
 * even by accident -- it is a type error, not a convention. Review found seven
 * of nine call sites unguarded when this was a plain boolean, and the previous
 * two rounds each fixed it by pinning one more file with a source-text
 * assertion, which is how it kept coming back one file over.
 */
type InvocationActor =
  | {
      kind: "anonymous";
      /**
       * Was this call served WITHOUT payment? Computed once in executeFreeTier
       * and handed to both the transaction row and the fact, because two
       * independent derivations of it have been falsified in opposite
       * directions.
       */
      servedFree: boolean;
    }
  | { kind: "account"; userId: string };

/**
 * Execute with retry for non-deterministic capabilities.
 *
 * WP9: this is also where the `/v1/do` rail records its invocation fact. The
 * route has FOUR call sites (anonymous free-tier, authenticated free-tier, sync
 * and async)
 * and WP4 was accepted with one of five rails silently unwired — recording at
 * the wrapper instead of at each caller makes that failure unavailable. A new
 * execution path added to this route inherits the fact by construction, because
 * there is no way to run an executor here without going through this function.
 *
 * One fact per LOGICAL invocation, not per retry attempt: a call that succeeds
 * on its second try is a success, and counting the attempt separately would
 * both understate quality and break the floor's fact-vs-transaction
 * completeness cross-check.
 */
/** Track best-effort invocation telemetry without making it a payment dependency. */
function recordFactWithoutHoldingTheLock(
  fact: Parameters<typeof recordAnonymousInvocation>[0],
): void {
  void trackBackgroundTask(
    `invocation-fact:${fact.rail}:${fact.capabilitySlug}`,
    recordAnonymousInvocation(fact),
  );
}

async function executeWithRetry(
  executor: (input: Record<string, unknown>) => Promise<any>,
  input: Record<string, unknown>,
  capability: CapabilityInfo,
  actor: InvocationActor,
  deadline?: number,
  executionStarted?: () => boolean,
): Promise<any> {
  const startedAt = Date.now();
  try {
    const result = await executeWithTransientRetry(executor, input, capability);
    if (deadline === undefined || Date.now() < deadline) recordFactWithoutHoldingTheLock({
      capabilitySlug: capability.slug,
      rail: "v1_do",
      userId: actor.kind === "account" ? actor.userId : null,
      servedFree: actor.kind === "anonymous" ? actor.servedFree : false,
      latencyMs: Date.now() - startedAt,
      outcome: outcomeFromOutput(capability.slug, result?.output),
    });
    return result;
  } catch (err) {
    if ((deadline === undefined || Date.now() < deadline) && (executionStarted?.() ?? true)) recordFactWithoutHoldingTheLock({
      capabilitySlug: capability.slug,
      rail: "v1_do",
      userId: actor.kind === "account" ? actor.userId : null,
      servedFree: actor.kind === "anonymous" ? actor.servedFree : false,
      latencyMs: Date.now() - startedAt,
      outcome: outcomeFromError(err),
    });
    throw err;
  }
}

// Cert-audit C7 follow-up: hard wall-clock timeout for the async executor
// path. Even if a capability skips AbortSignal on its fetch (or hangs in a
// CPU loop), the watchdog forces the promise chain to reject so the catch
// block runs the refund + mark-failed path. The stuck-deferred sweep
// (integrity-hash-retry) is a janitor that runs at 30-min cadence — this
// is the closer-fitting bound that cuts off the executor in real time.
// Override per-cap or globally with EXEC_HARD_TIMEOUT_MS env.
const EXEC_HARD_TIMEOUT_MS = parseInt(process.env.EXEC_HARD_TIMEOUT_MS ?? "300000", 10);

class ExecutionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Capability execution exceeded ${timeoutMs}ms hard timeout`);
    this.name = "ExecutionTimeoutError";
  }
}

function executeWithHardTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolveExec, rejectExec) => {
    const timer = setTimeout(() => rejectExec(new ExecutionTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolveExec(v);
      },
      (e) => {
        clearTimeout(timer);
        rejectExec(e);
      },
    );
  });
}

/**
 * Build the execution receipt for a transaction this route settled.
 *
 * Called once per executor, always AFTER the settlement write has committed,
 * and never inside the wallet transaction: a receipt must not be able to roll
 * back a payment. `settleExecutionReceipt` swallows its own failures, so this
 * cannot fail a request that has already executed and charged - a row it could
 * not finish simply stays `pending` (the column default since block 0109) and
 * the sweeper owns it.
 *
 * The rail is `v1_do` for every path through this file, and it is decided HERE
 * rather than read from the request. `/v1/do` is also where an A2A call lands
 * (routes/a2a.ts proxies to it over loopback HTTP) and where an MCP client's
 * traffic arrives, so it is tempting to let the caller name its own rail with a
 * header. That would make the rail forgeable, and a forgeable field has no
 * business inside a commitment - so `mcp` and `a2a` stay in the enum, currently
 * unreachable, rather than being populated from something a caller controls.
 */
async function settleReceiptFor(transactionId: string | null | undefined): Promise<void> {
  if (!transactionId) return;
  persistCallCost(transactionId);
  await settleExecutionReceipt(getDb(), { transactionId, rail: "v1_do" });
}

// Build usage summary for conversion emails (DEC-20260410-A)
async function buildUsageSummaryForUser(db: ReturnType<typeof getDb>, userId: string) {
  const [userRow] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const daysSinceSignup = userRow
    ? Math.max(1, Math.ceil((Date.now() - new Date(userRow.createdAt).getTime()) / 86_400_000))
    : 1;

  // WP1: this selected `capability_slug` from `transactions`, a column that
  // does not exist on that table — it keys capabilities by `capability_id`.
  // The query therefore threw on every call in production. Both callers are
  // the low-balance and zero-balance conversion emails, dispatched through
  // fireAndForget, so the failure was swallowed into a log line and every
  // "your agent ran out of credits" email silently failed to send. Found by
  // the ephemeral-Postgres lane; regression-tested in
  // do.usage-summary.integration.test.ts.
  //
  // Solution transactions carry capability_id = NULL and so are excluded by
  // the join, which matches the intent of a top-capabilities summary.
  const rows = await db.execute(
    sql`SELECT c.slug AS capability_slug, COUNT(*)::int AS count
        FROM transactions t
        JOIN capabilities c ON c.id = t.capability_id
        WHERE t.user_id = ${userId} AND t.status = 'completed'
        GROUP BY c.slug
        ORDER BY count DESC
        LIMIT 10`,
  );
  const capRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];

  const totalCalls = capRows.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0);
  const [spentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.priceCents}), 0)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.status, "completed")));

  return {
    totalCalls,
    daysSinceSignup,
    topCapabilities: capRows.map((r: any) => ({ slug: r.capability_slug, count: r.count })),
    totalSpentCents: spentRow?.total ?? 0,
  };
}

/**
 * Test seam for buildUsageSummaryForUser (WP1).
 *
 * The summary is only ever reached through a fireAndForget callback, so a
 * thrown query cannot fail a request and cannot be observed from the outside —
 * which is how a broken column reference survived in production. Exposing it
 * lets the integration lane assert on the query directly instead of inferring
 * its health from a log line.
 */
export async function buildUsageSummaryForUserForTest(userId: string) {
  return buildUsageSummaryForUser(getDb(), userId);
}

// ─── Free-tier execution: unauthenticated, no wallet, persisted for audit ───

type ExecuteFreeTierOptions = {
  c: Context<AppEnv>;
  db: ReturnType<typeof getDb>;
  capability: CapabilityInfo;
  executor: (input: Record<string, unknown>) => Promise<any>;
  executionInput: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  freshness: FreshnessInfo | null;
};

export async function executeFreeTier({ c, db, capability, executor, executionInput, outputSchema, freshness }: ExecuteFreeTierOptions) {
  const startTime = Date.now();
  const marker = getTransparencyMarker(capability.transparencyTag);

  // ONE value, two writes. This function serves three anonymous cases -- a
  // genuinely free-tier capability, a progressive-unlock call, and an X-Payment
  // call -- and only the last of those was paid for. Computed here and handed to
  // both the transaction row below and the invocation fact, because two
  // independent derivations of the same fact is precisely what review falsified
  // twice: the transaction is UPDATEd to is_free_tier=false on successful x402
  // settlement (see the settlement update further down), and production shows
  // 5 of 5 such rows are false, so any derivation that answered "free" for them
  // would drop genuinely paid traffic out of the quality floor.
  const servedFree = computeServedFree(c.get("x402_paid"));

  const x402Verified = c.get("x402_verified");
  const paymentHash = c.get("x402_payment_hash");
  let claimId: string | null = null;
  let releaseClaim = true;
  let executionStarted = false;
  if (x402Verified && paymentHash) {
    let cached = await findCachedX402Response(paymentHash);
    if (!cached) {
      claimId = await claimX402Payment(paymentHash, capability.id, null, "v1_do");
      if (!claimId) cached = await findCachedX402Response(paymentHash);
    }
    if (cached?.status === "completed") {
      return c.json({
        result: {
          transaction_id: cached.id, status: "completed", capability_used: capability.slug,
          price_cents: cached.priceCents, latency_ms: cached.latencyMs,
          output: cached.output, provenance: cached.provenance,
        },
        meta: { audit: redactAuditTrail(cached.auditTrail), replayed: true },
        free_tier: false,
      });
    }
    if (!claimId) {
      return c.json({
        error_code: "payment_failed",
        message: "A request with this payment is already in progress or has failed",
        details: { retryable: false, fix: "Check the prior transaction, then sign a fresh payment authorization before retrying this work." },
        meta: { replayed: true },
      }, 502);
    }
  }

  try {
    // Create a persisted transaction record so the audit trail is verifiable.
    // MED-10: write client_ip_hash directly so the free-tier rate-limit query
    // hits a top-level indexed column instead of audit_trail JSONB.
    const reqCtxForInsert = c.get("requestContext");
    const initialValues = {
        // Captured at INSERT because neither is recoverable later:
        // the rail is not a property of the row, and the deploy commit
        // drifts the moment anything redeploys (block 0110).
        receiptRail: "v1_do" as const,
        receiptDeployCommit: deployCommitOrNull(),
        userId: null,
        capabilityId: capability.id,
        status: "executing" as const,
        clientMeta: c.get("clientMeta") ?? null,
        input: inputForPersistence(capability.slug, executionInput),
        priceCents: 0,
        transparencyMarker: marker,
        dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
        // The same variable the fact gets. Two derivations of one fact is what
        // review falsified twice.
        isFreeTier: servedFree,
        clientIpHash: reqCtxForInsert?.ipHash ?? null,
      };
    const [txnRecord] = claimId
      ? await db.update(transactions).set(initialValues)
          .where(and(eq(transactions.id, claimId), eq(transactions.status, "executing")))
          .returning({ id: transactions.id })
      : await db.insert(transactions).values(initialValues).returning({ id: transactions.id });
    if (!txnRecord) throw new Error("Payment claim is no longer owned by this request");

    try {
      const capResult = await executeWithRetry(async input => {
        if (claimId && paymentHash) await beginX402Execution(claimId, paymentHash);
        executionStarted = true;
        return executor(input);
      }, executionInput, capability, { kind: "anonymous", servedFree }, undefined, () => executionStarted);
      assertBillableOutput(capability.slug, capResult.output);
      const latencyMs = Date.now() - startTime;

      const audit = buildFullAudit({
        transactionId: txnRecord.id,
        startTime,
        capability,
        marker,
        executionMode: "sync",
        latencyMs,
        executionInput,
        output: capResult.output,
        outputSchema,
        provenance: capResult.provenance,
        requestContext: c.get("requestContext"),
      });

      // Settle only after usable output. A confirmed decline releases ownership;
      // an unknown result keeps both the claim and intent for reconciliation.
      let x402SettlementId: string | null = null;
      if (x402Verified) {
        const settled = await settleX402Execution({
          verified: x402Verified,
          paymentHash: c.get("x402_payment_hash"),
          intent: { slug: capability.slug, solutionSlug: null, priceCents: capability.priceCents },
          policy: { claimId, setReleaseClaim: (release) => { releaseClaim = release; } },
        });
        if (!settled.valid) {
          if (!settled.settlementUnknown) {
            await db
              .update(transactions)
              .set({
                status: "failed",
                ...(claimId ? { x402PaymentHash: null, complianceHashState: "pending" } : {}),
                error: `Payment settlement failed: ${settled.error ?? "unknown"}`,
                latencyMs,
                completedAt: new Date(),
              })
              .where(eq(transactions.id, txnRecord.id));
            await settleReceiptFor(txnRecord.id);
          }
          return c.json(
            {
              error_code: "payment_failed",
              message: "x402 settlement failed after successful execution.",
              details: { retryable: false, fix: "Check payment status in your wallet before signing a fresh x402 payment authorization." },
              detail: settled.error,
            },
            402,
          );
        }
        x402SettlementId = settled.settlementId ?? null;
      }

      try {
        const recordQuery = db
          .update(transactions)
          .set({
            status: "completed",
            output: capResult.output,
            provenance: capResult.provenance,
            auditTrail: audit,
            latencyMs,
            completedAt: new Date(),
            ...(claimId ? { complianceHashState: "pending" } : {}),
            ...(x402SettlementId
              ? { paymentMethod: "x402", x402SettlementId, isFreeTier: false, priceCents: capability.priceCents }
              : {}),
          })
          .where(claimId ? and(eq(transactions.id, txnRecord.id), eq(transactions.status, "executing")) : eq(transactions.id, txnRecord.id));
        if (claimId) {
          const recorded = await recordQuery.returning({ id: transactions.id });
          if (!recorded.length) throw new Error("x402 claim finalization matched no row");
        } else {
          await recordQuery;
        }
        await settleReceiptFor(txnRecord.id);

        if (x402SettlementId) {
          try {
            await settlementIntent.markRecordedBySettlement(db, {
              settlementId: x402SettlementId, transactionId: txnRecord.id,
            });
          } catch (intentErr) {
            logError("x402-intent-mark-recorded-failed", intentErr, { settlementId: x402SettlementId });
          }
        }
      } catch (recordErr) {
        if (!x402SettlementId) throw recordErr;
        await captureX402RecordingFailure(db, {
          claimId, settlementId: x402SettlementId, capabilityId: capability.id,
          solutionSlug: null, slug: capability.slug, inputs: executionInput,
          output: capResult.output, provenance: capResult.provenance, auditTrail: audit, latencyMs,
          priceCents: capability.priceCents, priceUsd: eurCentsToUsd(capability.priceCents),
          payerAddress: x402Verified ? extractPayerAddress(x402Verified) : null,
          paymentHash,
        }, recordErr);
      }

      // Record circuit breaker + quality (fire-and-forget)
      fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
      recordQuality({
        transactionId: txnRecord.id,
        responseTimeMs: latencyMs,
        output: capResult.output,
        outputSchema,
      });
      if (capResult.output) {
        fireAndForget(
          () => recordPiggybackResult(capability.slug, capResult.output, outputSchema, latencyMs),
          { label: "piggyback-record", context: { slug: capability.slug } },
        );
      }
      // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
      // by column default; jobs/integrity-hash-retry.ts will fill it in.


      // The reserved count is request-local; a second read could race other calls.
      const reqCtx = c.get("requestContext");
      // Progressive unlock: record + include in response (DEC-20260410-A)
      const ipHashForUnlock = x402Verified ? null : reqCtx?.ipHash ?? null;
      const newlyUnlocked = ipHashForUnlock ? recordUnlock(ipHashForUnlock, capability.slug) : [];
      const allUnlocked = ipHashForUnlock ? getUnlockedSlugs(ipHashForUnlock) : [];

      return c.json({
        result: {
          transaction_id: txnRecord.id,
          status: "completed",
          capability_used: capability.slug,
          price_cents: x402SettlementId ? capability.priceCents : 0,
          latency_ms: latencyMs,
          output: capResult.output,
          provenance: capResult.provenance,
        },
        meta: {
          audit,
        },
        free_tier: !x402SettlementId,
        usage: c.get("freeTierUsage"),
        ...(allUnlocked.length > 0 ? {
          unlocked: {
            capabilities: allUnlocked,
            message: `${newlyUnlocked.length > 0 ? newlyUnlocked.length + " new capabilities unlocked. " : ""}These capabilities are free for you for 24 hours — no signup needed.`,
            ttl_hours: 24,
          },
        } : {}),
        ...(!x402Verified ? { upgrade: buildUpgradeBlock(capability.slug, executionInput, capResult.output as Record<string, unknown>) } : {}),
      });
    } catch (err) {
      if (!executionStarted) {
        logError("x402-execution-admission-failed", err, { slug: capability.slug });
        return c.json({ error_code: "execution_failed", message: "Execution could not start. No payment was taken.",
          details: { retryable: true, next_step: "Retry with exponential backoff." } }, 503);
      }
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      const failAudit = buildFailureAudit({
        transactionId: txnRecord.id, startTime, capability, executionInput,
        errorMessage, executionMode: "sync",
        requestContext: c.get("requestContext"),
      });
      const failProvenance = buildFailureProvenance(
        capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
      );

      if (!claimId || (releaseClaim && executionStarted)) {
        await db
          .update(transactions)
          .set({
            ...(claimId ? { x402PaymentHash: null, complianceHashState: "pending" } : {}),
            status: "failed", error: errorMessage, latencyMs, completedAt: new Date(),
            auditTrail: failAudit, provenance: failProvenance,
          })
          .where(eq(transactions.id, txnRecord.id));
        await settleReceiptFor(txnRecord.id);
      }

      // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
      // by column default; jobs/integrity-hash-retry.ts will fill it in.
      // WP4 remediation: a refusal is the guarded executor working, not a broken
      // capability. Recording it here delisted capabilities for correctly
      // refusing bad input — the quality floor is armed in production.
      if (releaseClaim && executionStarted && shouldCountAgainstCapability(err)) {
        fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
        fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
      }
      recordQuality({
        transactionId: txnRecord.id,
        responseTimeMs: latencyMs,
        output: null,
        outputSchema,
        error: errorMessage,
      });

      return c.json({
        ...apiError(
          "execution_failed",
          "The capability failed to execute.",
          { error: sanitizeFailureReason(errorMessage), ...refusalDetails(err) },
        ),
        free_tier: true,
        upgrade: buildUpgradeBlock(capability.slug, executionInput),
      }, 500);
    }
  } finally {
    if (claimId && paymentHash && releaseClaim) await releaseX402Claim(claimId, paymentHash, executionStarted);
  }
}

// ─── Free-tier execution: authenticated, no wallet debit ────────────────────

type ExecuteFreeTierAuthenticatedOptions = {
  c: Context<AppEnv>;
  db: ReturnType<typeof getDb>;
  user: { id: string };
  capability: CapabilityInfo;
  executor: (input: Record<string, unknown>) => Promise<any>;
  executionInput: Record<string, unknown>;
  idempotencyKey: string | null;
  idempotencyFingerprint: string;
  outputSchema: Record<string, unknown>;
  freshness: FreshnessInfo | null;
};

export async function executeFreeTierAuthenticated({ c, db, user, capability, executor, executionInput, idempotencyKey, idempotencyFingerprint, outputSchema, freshness }: ExecuteFreeTierAuthenticatedOptions) {
  const startTime = Date.now();
  const marker = getTransparencyMarker(capability.transparencyTag);

  // Create transaction record (for usage history), but no wallet lock/debit
  const [txnRecord] = await db
    .insert(transactions)
    .values({
      // Captured at INSERT because neither is recoverable later:
      // the rail is not a property of the row, and the deploy commit
      // drifts the moment anything redeploys (block 0110).
      receiptRail: "v1_do",
      receiptDeployCommit: deployCommitOrNull(),
      userId: user.id,
      capabilityId: capability.id,
      idempotencyKey,
      // Review finding, and the sharpest kind: the parameter was threaded into
      // this function and then never written, so it READ as done. Every
      // authenticated free-tier call carrying a key produced a row with a NULL
      // fingerprint — and a NULL fingerprint is replayable by design, so the
      // guard was permanently off for this path rather than off for a draining
      // legacy set. tsc cannot catch an unused parameter, and the integration
      // tests all seed paid capabilities, so nothing exercised it.
      idempotencyFingerprint,
      status: "executing",
      clientMeta: c.get("clientMeta") ?? null,
      input: inputForPersistence(capability.slug, executionInput),
      priceCents: 0,
      transparencyMarker: marker,
      dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
    })
    .returning({ id: transactions.id });

  try {
    const capResult = await executeWithRetry(executor, executionInput, capability, { kind: "account", userId: user.id });
    assertBillableOutput(capability.slug, capResult.output);
    const latencyMs = Date.now() - startTime;

    const audit = buildFullAudit({
      transactionId: txnRecord.id,
      startTime,
      capability,
      marker,
      executionMode: "sync",
      latencyMs,
      executionInput,
      output: capResult.output,
      outputSchema,
      provenance: capResult.provenance,
      requestContext: c.get("requestContext"),
    });

    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        auditTrail: audit,
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, txnRecord.id));
    await settleReceiptFor(txnRecord.id);

    // Record circuit breaker + quality (fire-and-forget)
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    if (capResult.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, capResult.output, outputSchema, latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
    // by column default; jobs/integrity-hash-retry.ts will fill it in.
    // Activation hook: detect first successful call
    if (user) {
      fireAndForget(
        async () => {
          const { onFirstTransaction } = await import("../activation-hook.js");
          return onFirstTransaction(user.id, capability.slug);
        },
        { label: "activation-hook", context: { userId: user.id, slug: capability.slug } },
      );
    }

    // Get wallet balance for response
    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    setCreditsHeaders(c, wallet?.balanceCents ?? 0, 0);
    return c.json({
      result: {
        transaction_id: txnRecord.id,
        status: "completed",
        capability_used: capability.slug,
        price_cents: 0,
        latency_ms: latencyMs,
        wallet_balance_cents: wallet?.balanceCents ?? 0,
        output: capResult.output,
        provenance: capResult.provenance,
      },
      meta: {
        audit,
      },
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const failAudit = buildFailureAudit({
      transactionId: txnRecord.id, startTime, capability, executionInput,
      errorMessage, executionMode: "sync",
    });
    const failProvenance = buildFailureProvenance(
      capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
    );

    await db
      .update(transactions)
      .set({
        status: "failed",
        error: errorMessage,
        latencyMs,
        completedAt: new Date(),
        auditTrail: failAudit,
        provenance: failProvenance,
      })
      .where(eq(transactions.id, txnRecord.id));
    await settleReceiptFor(txnRecord.id);

    // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
    // by column default; jobs/integrity-hash-retry.ts will fill it in.
    // WP4 remediation: a refusal is the guarded executor working, not a broken
    // capability. Recording it here delisted capabilities for correctly
    // refusing bad input — the quality floor is armed in production.
    if (shouldCountAgainstCapability(err)) {
      fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
      fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    }
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });

    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return c.json(
      apiError(
        "execution_failed",
        "The capability failed to execute. You were not charged.",
        {
          transaction_id: txnRecord.id,
          error: sanitizeFailureReason(errorMessage),
          ...refusalDetails(err),
          wallet_balance_cents: wallet?.balanceCents ?? 0,
        },
      ),
      500,
    );
  }
}

// ─── Sync execution: reserve → execute → capture on success (DEC-14) ────────────

type ExecuteSyncOptions = {
  c: Context<AppEnv>;
  db: ReturnType<typeof getDb>;
  user: { id: string; maxSpendPerHourCents?: number | null; email?: string | null };
  capability: CapabilityInfo;
  executor: (input: Record<string, unknown>) => Promise<any>;
  executionInput: Record<string, unknown>;
  idempotencyKey: string | null;
  idempotencyFingerprint: string;
  outputSchema: Record<string, unknown>;
  freshness: FreshnessInfo | null;
  timeoutMs: number;
};

export async function executeSync({ c, db, user, capability, executor, executionInput, idempotencyKey, idempotencyFingerprint, outputSchema, freshness, timeoutMs }: ExecuteSyncOptions) {
  const startTime = Date.now();

  type TxResult =
    | { ok: false; errorCode: "key_policy"; keyError: ApiError }
    | {
        ok: true;
        transactionId: string;
        output: unknown;
        provenance: unknown;
        latencyMs: number;
        balanceAfter: number;
        // CRIT-5: audit object written atomically during capture so the
        // response can surface it as meta.audit without rebuilding it
        // (and without the f-a-f UPDATE that produced the race).
        audit: ReturnType<typeof buildFullAudit>;
      }
    | {
        ok: false;
        errorCode: "insufficient_balance";
        balance: number;
        required: number;
      }
    | {
        ok: false;
        errorCode: "spend_cap_exceeded";
        balance: number;
        required: number;
        spent: number;
        limit: number;
      }
    | {
        ok: false;
        errorCode: "execution_failed";
        error: string;
        transactionId: string;
        balanceAfter: number;
        /**
         * Whether this failure should count against the capability's health.
         * Decided where the thrown value is still in scope; by the time the
         * caller records the breaker failure it has only the message string,
         * and a refusal is indistinguishable from a fault once flattened.
         */
        countsAgainstCapability: boolean;
        refusal?: Record<string, unknown>;
        timedOut?: boolean;
      };

  // Every DB transaction is short. Only the reservation crosses execution.
  let result: TxResult;
  try {
    const reserved = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15s'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      // Lock wallet row (WP2: via the wallet service, which owns the lock shape)
      const wallet = await walletService.lockWalletForUser(tx, user.id);

      // The preflight lookup can race. Recheck after the wallet lock, before
      // affordability, so an in-flight retry replays even if its hold used the balance.
      // The unique key is account-wide: excluded solution/deleted rows must return
      // a conflict, never replay as a capability (including legacy null fingerprints).
      if (idempotencyKey) {
        const [existing] = await tx.select().from(transactions).where(and(
          eq(transactions.userId, user.id), eq(transactions.idempotencyKey, idempotencyKey),
        )).limit(1);
        if (existing) return { replay: existing };
      }

      const keyError = await keyCapError(tx, user.id, c.get("apiKeyId"), capability.priceCents);
      if (keyError) return { ok: false as const, errorCode: "key_policy" as const, keyError };

      if (!wallet || wallet.balanceCents < capability.priceCents) {
        return {
          ok: false as const,
          errorCode: "insufficient_balance" as const,
          balance: wallet?.balanceCents ?? 0,
          required: capability.priceCents,
        };
      }

      // Cert-audit C8: authoritative spend-cap re-check INSIDE the wallet-
      // locked tx. Concurrent requests for this user serialize on the wallet
      // FOR UPDATE lock, so the SUM here reflects every previously-committed
      // debit. Pre-check at line 698 is a fast-fail; this is the closer.
      if (user.maxSpendPerHourCents) {
        const capCheck = await spendCapWouldExceed(
          tx,
          user.id,
          capability.priceCents,
          user.maxSpendPerHourCents,
        );
        if (capCheck) {
          return {
            ok: false as const,
            errorCode: "spend_cap_exceeded" as const,
            balance: wallet.balanceCents,
            required: capability.priceCents,
            spent: capCheck.spent,
            limit: user.maxSpendPerHourCents,
          };
        }
      }

      // Determine transparency marker based on capability type
      const marker = getTransparencyMarker(capability.transparencyTag);

      // Create transaction record as "executing"
      const [txnRecord] = await tx
        .insert(transactions)
        .values({
          // Captured at INSERT because neither is recoverable later:
          // the rail is not a property of the row, and the deploy commit
          // drifts the moment anything redeploys (block 0110).
          receiptRail: "v1_do",
          receiptDeployCommit: deployCommitOrNull(),
          userId: user.id,
          capabilityId: capability.id,
          idempotencyKey,
          idempotencyFingerprint,
          status: "executing",
          complianceHashState: "deferred",
          clientMeta: c.get("clientMeta") ?? null,
          input: inputForPersistence(capability.slug, executionInput),
          priceCents: capability.priceCents,
          transparencyMarker: marker,
          dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
        })
        .returning({ id: transactions.id });

      const reservation = await reservations.reserve(tx, {
        wallet, userId: user.id, amountCents: capability.priceCents,
        transactionId: txnRecord.id, apiKeyId: c.get("apiKeyId"),
        description: `Capability: ${capability.slug}`, mode: "hold",
      });
      return { transactionId: txnRecord.id, reservationId: reservation.id, marker };
    });

    if (reserved.replay) {
      return replaySyncRequest(c, db, reserved.replay, idempotencyFingerprint, capability.slug, user.id);
    }
    if (reserved.ok === false) {
      result = reserved;
    } else {
      const { transactionId, reservationId, marker } = reserved;
      const txnRecord = { id: transactionId };
      try {
        // Executor interface accepts input only; there is no AbortSignal slot.
        // One budget starts here for the watchdog, SDK timeouts and retries.
        const deadline = setCostDeadline(timeoutMs);
        const capResult = await executeWithHardTimeout(
          executeWithRetry((input) => {
            // A retry waking after the deadline must not start another paid call.
            if (Date.now() >= deadline) throw new ExecutionTimeoutError(timeoutMs);
            return executor(input);
          }, executionInput, capability, { kind: "account", userId: user.id }, deadline),
          Math.max(0, deadline - Date.now()),
        ).catch((err: unknown) => {
          // SDK timers are registered before our watchdog and can win at the
          // same deadline. Normalize execution errors only, never DB errors.
          if (Date.now() >= deadline) throw new ExecutionTimeoutError(timeoutMs);
          throw err;
        });
        if (Date.now() >= deadline) throw new ExecutionTimeoutError(timeoutMs);
        assertBillableOutput(capability.slug, capResult.output);
        const latencyMs = Date.now() - startTime;

        // Publish the final audit and completed status atomically during capture.
        const audit = buildFullAudit({
          transactionId: txnRecord.id,
          startTime,
          capability,
          marker,
          executionMode: "sync",
          latencyMs,
          executionInput,
          output: capResult.output,
          outputSchema,
          provenance: capResult.provenance,
          requestContext: c.get("requestContext"),
        });

        const newBalance = await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
          await walletService.lockWalletForUser(tx, user.id);
          await tx
            .update(transactions)
            .set({
              status: "completed",
              complianceHashState: "pending",
              output: capResult.output,
              provenance: capResult.provenance,
              latencyMs,
              completedAt: new Date(),
              auditTrail: audit,
            })
            .where(eq(transactions.id, txnRecord.id));

          const captured = await reservations.capture(tx, { reservationId });
          if (!captured) throw new reservations.ReservationNotOpenError(reservationId, "capture");
          return (await walletService.readBalance(tx, user.id))!;
        });

        result = {
          ok: true as const,
          transactionId: txnRecord.id,
          output: capResult.output,
          provenance: capResult.provenance,
          latencyMs,
          balanceAfter: newBalance,
          audit,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err);

        // Mark transaction failed — no charge (wallet not debited)
        const failAudit = buildFailureAudit({
          transactionId: txnRecord.id, startTime, capability, executionInput,
          errorMessage, executionMode: "sync",
        });
        const failProvenance = buildFailureProvenance(
          capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
        );

        if (err instanceof ExecutionTimeoutError) noteUnknownCost("sync_execution_timed_out");
        const balanceAfter = await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
          await tx
            .update(transactions)
            .set({
              status: "failed",
              complianceHashState: "pending",
              error: errorMessage,
              latencyMs,
              completedAt: new Date(),
              auditTrail: failAudit,
              provenance: failProvenance,
            })
            .where(and(eq(transactions.id, txnRecord.id), inArray(transactions.status, ["executing", "deferred"])));
          await reservations.release(tx, { reservationId, reason: err instanceof ExecutionTimeoutError ? "sync timeout" : "sync execution failed" });
          return (await walletService.readBalance(tx, user.id)) ?? 0;
        });

        result = {
          ok: false as const,
          errorCode: "execution_failed" as const,
          error: errorMessage,
          transactionId: txnRecord.id,
          balanceAfter,
          timedOut: err instanceof ExecutionTimeoutError,
          // Classified HERE, where the thrown value is still in scope. The caller
          // that records the breaker failure sees only the message string, and a
          // refusal is indistinguishable from a real fault once flattened to text.
          countsAgainstCapability: !(err instanceof ExecutionTimeoutError) && shouldCountAgainstCapability(err),
          refusal: refusalDetails(err),
        };
      }
    }
  } catch (err) {
    // Cert-audit Y-5: catch postgres timeout codes from the wallet tx.
    // The error shape from postgres-js is `{ code: '25P03' }` or
    // `{ code: '55P03' }`; the tx is rolled back automatically so no
    // wallet state needs unwinding. Since drizzle-orm 0.44+ this arrives
    // wrapped in `DrizzleQueryError` (no `code` of its own) — go through
    // db-error.ts's `pgErrorCode` rather than reading `err.code` directly
    // so this branch still fires post-upgrade (see db-error.ts's doc
    // comment for the incident this guards against).
    const code = pgErrorCode(err);
    if (code === "25P03" || code === "55P03") {
      const reason = code === "25P03"
        ? "Wallet bookkeeping exceeded its transaction timeout. The request was not charged."
        : "Wallet was contended by a concurrent request that took too long. Retry with backoff.";
      logWarn("wallet-tx-timeout", reason, { code, slug: capability.slug, userId: user.id });
      return c.json(
        apiError("timeout_exceeded", reason, { postgres_code: code }),
        503,
      );
    }
    throw err; // anything else propagates as a real 500
  }

  // The wallet transaction has committed. Both its branches - the success
  // UPDATE and the failure UPDATE - reach here, so one call covers the whole
  // executor, and it is outside the transaction by construction.
  await settleReceiptFor((result as { transactionId?: string }).transactionId);

  // ── Record circuit breaker + quality + piggyback (fire-and-forget) ───
  if (result.ok) {
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId: result.transactionId,
      responseTimeMs: result.latencyMs,
      output: result.output,
      outputSchema,
    });
    // Piggyback monitoring: validate output and record as test data point
    if (result.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, result.output, outputSchema, result.latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // Check transaction milestones (fire-and-forget)
    fireAndForget(
      async () => {
        const res: any = await db.execute(
          sql`SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        );
        const rows = Array.isArray(res) ? res : res?.rows ?? [];
        checkMilestone(Number(rows[0]?.count ?? 0));
      },
      { label: "milestone-check" },
    );
    // Activation hook: detect first successful call (sync paid)
    fireAndForget(
      async () => {
        const { onFirstTransaction } = await import("../activation-hook.js");
        return onFirstTransaction(user.id, capability.slug);
      },
      { label: "activation-hook", context: { userId: user.id, slug: capability.slug } },
    );
  } else if (result.errorCode === "execution_failed" && result.countsAgainstCapability !== false) {
    fireAndForget(() => recordFailure(capability.slug, result.error), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
    fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    recordQuality({
      transactionId: result.transactionId,
      responseTimeMs: Date.now() - startTime,
      output: null,
      outputSchema,
      error: result.error,
    });
  }

  // ── Return response ───────────────────────────────────────────────────
  if (!result.ok && result.errorCode === "key_policy") {
    return c.json(result.keyError, result.keyError.error_code === "unauthorized" ? 401 : 429);
  }

  if (!result.ok && result.errorCode === "insufficient_balance") {
    return c.json(
      apiError(
        "insufficient_balance",
        `Your wallet has €${(result.balance / 100).toFixed(2)} but this capability costs €${(result.required / 100).toFixed(2)}.`,
        {
          wallet_balance_cents: result.balance,
          required_cents: result.required,
          topup_url: "/v1/wallet/topup",
          x402_fallback: `This capability is also available via x402 pay-per-call (USDC on Base). GET https://api.strale.io/x402/v2/${capability.slug}`,
        },
      ),
      402,
    );
  }

  if (!result.ok && result.errorCode === "spend_cap_exceeded") {
    // Cert-audit C8: hit the in-tx authoritative check after the pre-check
    // already passed. Treat as the same client-facing error so SDKs don't
    // need to handle two error codes.
    return c.json(
      apiError(
        "spend_cap_exceeded",
        `Hourly spend limit (€${(result.limit / 100).toFixed(2)}) would be exceeded. Spent: €${(result.spent / 100).toFixed(2)}, requested: €${(result.required / 100).toFixed(2)}.`,
        {
          spent_cents: result.spent,
          requested_cents: result.required,
          limit_cents: result.limit,
        },
      ),
      429,
    );
  }

  if (!result.ok && result.errorCode === "execution_failed") {
    return c.json(
      apiError(
        result.timedOut ? "timeout_exceeded" : "execution_failed",
        result.timedOut ? "The capability exceeded timeout_seconds. You were not charged." : "The capability failed to execute. You were not charged.",
        {
          transaction_id: result.transactionId,
          error: sanitizeFailureReason(result.error),
          ...result.refusal,
          ...(result.timedOut ? { retryable: true, fix: "Retry with a new Idempotency-Key and a larger timeout_seconds (up to 60), or retry later." } : {}),
          wallet_balance_cents: result.balanceAfter,
        },
      ),
      result.timedOut ? 503 : 500,
    );
  }

  // CRIT-5: audit was previously rebuilt here and written via fire-and-forget
  // UPDATE — the worker's GRACE_MS could fire between status='completed'
  // commit and the f-a-f write, hashing auditTrail=null permanently. Audit
  // is now written atomically during capture and returned via TxResult; nothing left to
  // write here.
  const audit = result.audit;


  // Low-balance / zero-balance conversion emails (DEC-20260410-A, fire-and-forget)
  const LOW_BALANCE_THRESHOLD = 50; // €0.50
  const balanceBefore = result.balanceAfter + capability.priceCents;
  const userEmail = user.email;
  if (userEmail && result.balanceAfter <= 0 && balanceBefore > 0) {
    // Just crossed zero
    fireAndForget(
      async () => {
        const { sendZeroBalanceEmail } = await import("../conversion-emails.js");
        const usage = await buildUsageSummaryForUser(db, user.id);
        return sendZeroBalanceEmail(userEmail, usage);
      },
      { label: "conversion-email-zero-balance", context: { userId: user.id } },
    );
  } else if (userEmail && result.balanceAfter <= LOW_BALANCE_THRESHOLD && balanceBefore > LOW_BALANCE_THRESHOLD) {
    // Just crossed low-balance threshold
    fireAndForget(
      async () => {
        const { sendLowBalanceEmail } = await import("../conversion-emails.js");
        const usage = await buildUsageSummaryForUser(db, user.id);
        return sendLowBalanceEmail(userEmail, result.balanceAfter, usage);
      },
      { label: "conversion-email-low-balance", context: { userId: user.id } },
    );
  }

  setCreditsHeaders(c, result.balanceAfter, capability.priceCents);
  return c.json({
    result: {
      transaction_id: result.transactionId,
      status: "completed",
      capability_used: capability.slug,
      price_cents: capability.priceCents,
      latency_ms: result.latencyMs,
      wallet_balance_cents: result.balanceAfter,
      output: result.output,
      provenance: result.provenance,
    },
    meta: {
      audit,
    },
  });
}

// TODO: Partial results for multi-step solution execution
// When solutions execute as a pipeline (e.g., company-due-diligence = 5 capability calls),
// each step should record its output independently so that:
// 1. GET /v1/transactions/:id can return partial_output with completed steps
// 2. If step 3/5 fails, steps 1-2 results are still available to the caller
// 3. The caller is charged only for steps that succeeded (pro-rata pricing)
// 4. The response includes a `steps` array with per-step status, output, and latency
// This requires: solution-aware execution in /v1/do (currently solutions are
// client-orchestrated as separate /v1/do calls per step).

// ─── Async execution: debit upfront → 202 → background → refund on failure ──

type ExecuteAsyncOptions = {
  c: Context<AppEnv>;
  db: ReturnType<typeof getDb>;
  user: { id: string; maxSpendPerHourCents?: number | null };
  capability: CapabilityInfo;
  executor: (input: Record<string, unknown>) => Promise<any>;
  executionInput: Record<string, unknown>;
  idempotencyKey: string | null;
  idempotencyFingerprint: string;
  outputSchema: Record<string, unknown>;
  freshness: FreshnessInfo | null;
  /** Validated by the route (checkCallbackUrl); signed POST on completion. */
  callbackUrl?: string | null;
};

export async function executeAsync({ c, db, user, capability, executor, executionInput, idempotencyKey, idempotencyFingerprint, outputSchema, freshness, callbackUrl = null }: ExecuteAsyncOptions) {
  // Short DB tx: lock wallet → check balance → debit → create record → commit
  type SetupResult =
    | { ok: false; errorCode: "key_policy"; keyError: ApiError }
    | {
        ok: true;
        transactionId: string;
        walletId: string;
        balanceAfter: number;
        /** WP3: the open reservation this execution must capture or release. */
        reservationId: string;
      }
    | {
        ok: false;
        errorCode: "insufficient_balance";
        balance: number;
        required: number;
      }
    | {
        ok: false;
        errorCode: "spend_cap_exceeded";
        spent: number;
        required: number;
        limit: number;
      };

  const setupResult: SetupResult = await db.transaction(async (tx) => {
    const wallet = await walletService.lockWalletForUser(tx, user.id);

    const keyError = await keyCapError(tx, user.id, c.get("apiKeyId"), capability.priceCents);
    if (keyError) return { ok: false as const, errorCode: "key_policy" as const, keyError };

    if (!wallet || wallet.balanceCents < capability.priceCents) {
      return {
        ok: false as const,
        errorCode: "insufficient_balance" as const,
        balance: wallet?.balanceCents ?? 0,
        required: capability.priceCents,
      };
    }

    // Cert-audit C8: spend-cap re-check inside the wallet-locked tx.
    // Same rationale as executeSync — see spendCapWouldExceed().
    if (user.maxSpendPerHourCents) {
      const capCheck = await spendCapWouldExceed(
        tx,
        user.id,
        capability.priceCents,
        user.maxSpendPerHourCents,
      );
      if (capCheck) {
        return {
          ok: false as const,
          errorCode: "spend_cap_exceeded" as const,
          spent: capCheck.spent,
          required: capability.priceCents,
          limit: user.maxSpendPerHourCents,
        };
      }
    }

    // Create transaction record
    const marker = getTransparencyMarker(capability.transparencyTag);
    const [txnRecord] = await tx
      .insert(transactions)
      .values({
        // Captured at INSERT because neither is recoverable later:
        // the rail is not a property of the row, and the deploy commit
        // drifts the moment anything redeploys (block 0110).
        receiptRail: "v1_do",
        receiptDeployCommit: deployCommitOrNull(),
        userId: user.id,
        capabilityId: capability.id,
        idempotencyKey,
        idempotencyFingerprint,
        status: "executing",
      clientMeta: c.get("clientMeta") ?? null,
        input: inputForPersistence(capability.slug, executionInput),
        priceCents: capability.priceCents,
        transparencyMarker: marker,
        dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
        // CCO P0 #6: async path INSERTs as 'deferred', not 'pending'.
        // Async exists for executions taking >10s — exactly the case
        // where the worker's GRACE_MS=10s would let it hash a still-
        // executing row. The retry worker filters on 'pending' only,
        // so deferred rows are invisible until executeInBackground
        // flips them to 'pending' atomically with the final write.
        complianceHashState: "deferred",
      })
      .returning({ id: transactions.id });

    // Reserve rather than plainly debit (WP3).
    //
    // The money moves now, exactly as before — but the reservation row records
    // in this same transaction that the movement is still provisional. That
    // record outlives the process, so a crash between this commit and the
    // in-memory catch block below no longer strands the charge: the reconciler
    // finds the open reservation and releases it.
    const reservation = await reservations.reserve(tx, {
      wallet,
      userId: user.id,
      amountCents: capability.priceCents,
      transactionId: txnRecord.id,
      apiKeyId: c.get("apiKeyId"),
      description: `Capability: ${capability.slug}`,
    });
    const newBalance = reservation.balanceAfter;

    // Portfolio 2.11: the callback is recorded with the job, so it is
    // delivered whichever path makes the job terminal — including the
    // reservation reconciler after a crash.
    if (callbackUrl) {
      await jobCallbacks.enqueueCallback(tx, { transactionId: txnRecord.id, userId: user.id, url: callbackUrl });
    }

    return {
      ok: true as const,
      transactionId: txnRecord.id,
      walletId: wallet.id,
      balanceAfter: newBalance,
      reservationId: reservation.id,
    };
  });

  if (!setupResult.ok && setupResult.errorCode === "key_policy") {
    return c.json(setupResult.keyError, setupResult.keyError.error_code === "unauthorized" ? 401 : 429);
  }

  if (!setupResult.ok && setupResult.errorCode === "spend_cap_exceeded") {
    return c.json(
      apiError(
        "spend_cap_exceeded",
        `Hourly spend limit (€${(setupResult.limit / 100).toFixed(2)}) would be exceeded. Spent: €${(setupResult.spent / 100).toFixed(2)}, requested: €${(setupResult.required / 100).toFixed(2)}.`,
        {
          spent_cents: setupResult.spent,
          requested_cents: setupResult.required,
          limit_cents: setupResult.limit,
        },
      ),
      429,
    );
  }

  if (!setupResult.ok) {
    return c.json(
      apiError(
        "insufficient_balance",
        `Your wallet has €${(setupResult.balance / 100).toFixed(2)} but this capability costs €${(setupResult.required / 100).toFixed(2)}.`,
        {
          wallet_balance_cents: setupResult.balance,
          required_cents: setupResult.required,
          topup_url: "/v1/wallet/topup",
        },
      ),
      402,
    );
  }

  const { transactionId, walletId, balanceAfter } = setupResult;
  const startTime = Date.now();

  // Fire-and-forget: execute in background, update DB when done.
  // MED-3: pass the SQS that was already computed before the async launch
  // (instead of the prior hardcoded {score: 0, label: "unknown", pending: true}
  // sentinel that made every async audit body claim no-quality-data).
  // Cert-audit Y-6: wrap with trackBackgroundTask so SIGTERM drains
  // this promise before the HTTP server / DB pool tear down. Without
  // tracking, a Railway redeploy in the middle of a 12-second
  // executor would kill it mid-write, leaving the row in `executing`
  // for the 30-min janitor sweep and stranding the optimistic debit.
  trackBackgroundTask(
    `async-exec:${capability.slug}:${transactionId}`,
    executeInBackground({
      db,
      actor: { kind: "account", userId: user.id },
      executor,
      executionInput,
      transactionId,
      walletId,
      capability,
      startTime,
      outputSchema,
      reservationId: setupResult.reservationId,
      ownerUserId: user.id,
      hasCallback: callbackUrl !== null,
    }),
  ).catch((err) => {
    // Last-resort error logging — should not normally reach here
    logError("async-exec-unhandled", err, { transaction_id: transactionId });
  });

  // Return 202 immediately — client polls GET /v1/transactions/:id
  // MED-6: pre-fix, the 202 response carried no audit reference at all.
  // Callers had to poll /v1/transactions/:id and parse audit_trail JSONB
  // to find shareable_url — undocumented and brittle. The audit token is
  // deterministic for a given transaction_id (HMAC over txnId + expiresAt),
  // so we can issue and surface the shareable URL NOW even though the
  // audit body itself fills in once the background execution completes.
  // Callers store the URL; it resolves the moment the worker hashes the
  // row. Polling /v1/transactions/:id is no longer required to discover
  // the URL.
  const shareable = getShareableUrl(transactionId);
  return c.json(
    {
      result: {
        transaction_id: transactionId,
        status: "executing",
        capability_used: capability.slug,
        price_cents: capability.priceCents,
        wallet_balance_cents: balanceAfter,
        poll_url: `/v1/transactions/${transactionId}`,
      },
      meta: {
        ...(callbackUrl
          ? {
              callback: {
                registered: true,
                signature_header: "Strale-Signature",
                secret_url: "/v1/jobs/webhook-secret",
              },
            }
          : {}),
        // The audit body is not yet available (background execution still
        // running) — but the URL that will serve the eventual audit IS
        // available now. The /v1/audit/:id endpoint will return 202 +
        // Retry-After while the row's compliance_hash_state is 'pending';
        // the same URL becomes successful once the worker finalises the
        // chain link. Callers should store this URL and poll the audit
        // endpoint with it (or the polling URL below) to resolve.
        audit: {
          status: "pending",
          shareable_url: shareable.url,
          shareable_url_expires_at: shareable.expiresAt,
          poll_url: `/v1/transactions/${transactionId}`,
        },
      },
    },
    202,
  );
}

type ExecuteInBackgroundOptions = {
  db: ReturnType<typeof getDb>;
  actor: InvocationActor;
  executor: (input: Record<string, unknown>) => Promise<any>;
  executionInput: Record<string, unknown>;
  transactionId: string;
  walletId: string;
  capability: CapabilityInfo;
  startTime: number;
  outputSchema: Record<string, unknown>;
  /** WP3: the open reservation this execution must capture or release. */
  reservationId: string;
  /** Owner of any files the execution produces (portfolio 2.11). */
  ownerUserId: string;
  /** A completion callback was enqueued with the job; try it as soon as it settles. */
  hasCallback: boolean;
};

async function executeInBackground({ db, actor, executor, executionInput, transactionId, walletId, capability, startTime, outputSchema, reservationId, ownerUserId, hasCallback }: ExecuteInBackgroundOptions) {
  try {
    // WP3: record that work actually began. Advisory only — the reconciler
    // releases 'reserved' and 'executing' alike — but it is the difference
    // between "we took the money and never started" and "we took the money
    // and the work was in flight" when reading the table after an incident.
    await reservations.markExecuting(db, reservationId).catch((err) =>
      logWarn("reservation-mark-executing-failed", String(err), {
        transaction_id: transactionId,
        reservation_id: reservationId,
      }),
    );

    // Cert-audit C7: hard timeout on the executor. Without this, an executor
    // that hangs (no AbortSignal on its fetch, infinite CPU loop, deadlock)
    // would leave the row in 'deferred' until the integrity-hash-retry
    // janitor flips it to 'failed' 30 min later — and would never refund
    // the optimistic debit. The race forces the catch block to run when
    // the wall-clock budget is up.
    const capResult = await executeWithHardTimeout(
      executeWithRetry(executor, executionInput, capability, actor),
      EXEC_HARD_TIMEOUT_MS,
    );
    assertBillableOutput(capability.slug, capResult.output);
    // Portfolio 2.11: a file result over the caps throws here, before any
    // money settles, so the catch below releases the reservation.
    const files = prepareFiles(capResult.files);
    const provenance = files.length > 0
      ? { ...capResult.provenance, output_files: manifestOf(files) }
      : capResult.provenance;
    const latencyMs = Date.now() - startTime;

    // Success: update transaction record with full audit trail
    const marker = getTransparencyMarker(capability.transparencyTag);
    const audit = buildFullAudit({
      transactionId,
      startTime,
      capability,
      marker,
      executionMode: "async",
      latencyMs,
      executionInput,
      output: capResult.output,
      outputSchema,
      provenance,
      requestContext: undefined, // background execution — no request context available
    });

    // WP3: settle the reservation in the SAME transaction as the terminal
    // status write. Separately, a crash between them would leave a completed
    // execution with an open reservation, which the reconciler would then
    // refund — handing back money for work the customer received.
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({
          status: "completed",
          output: capResult.output,
          provenance,
          auditTrail: audit,
          latencyMs,
          completedAt: new Date(),
          // CCO P0 #6: flip from 'deferred' to 'pending' atomically with the
          // hashed-field writes. After this UPDATE commits, the retry worker
          // will pick the row up on its next tick (≥10s later) and hash it
          // with the final values — no race possible.
          complianceHashState: "pending",
        })
        // No `redacted_at` predicate here, deliberately.
        //
        // An async execution completes in its own transaction seconds to
        // minutes after the request returned 202, and account closure can land
        // in that window — four production capabilities exceed the 10s async
        // threshold — so the content must not come back. That is enforced by
        // the BEFORE UPDATE trigger from migration 0103, for this site and the
        // seven others that write content, rather than by a predicate each one
        // has to remember.
        //
        // Gating the whole statement instead was the first attempt, and it
        // costs something: the row keeps a non-terminal status forever while
        // the reservation settles around it. Letting the write land and the
        // trigger scrub the content is the better half of the trade — the
        // status, latency and hash state are not the customer's data.
        .where(eq(transactions.id, transactionId));

      // Same transaction as the status write and the capture: a file insert
      // that fails rolls both back, and the catch below releases instead.
      await insertJobFiles(tx, files, { transactionId, userId: ownerUserId });

      // False means the reconciler already released it — the execution
      // outran its deadline. The customer has been refunded; leave it that
      // way rather than re-charging them for a result they waited too long
      // for. Logged so the deadline can be tuned if it happens often.
      const captured = await reservations.capture(tx, {
        reservationId,
        reason: "execution succeeded",
      });
      if (!captured) {
        logWarn(
          "reservation-capture-missed",
          "reservation was already terminal at capture time",
          { transaction_id: transactionId, reservation_id: reservationId },
        );
      }
    });

    await settleReceiptFor(transactionId);
    if (hasCallback) await jobCallbacks.deliverNow(db, transactionId);

    // Record success for circuit breaker + quality + piggyback
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    // Piggyback monitoring
    if (capResult.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, capResult.output, outputSchema, latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // F-0-009 Stage 2: row already has compliance_hash_state = 'pending'
    // by column default; retry worker fills it in.

    // Check transaction milestones (fire-and-forget)
    fireAndForget(
      async () => {
        const res: any = await db.execute(
          sql`SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        );
        const rows = Array.isArray(res) ? res : res?.rows ?? [];
        checkMilestone(Number(rows[0]?.count ?? 0));
      },
      { label: "milestone-check" },
    );
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);

    // Failure: refund wallet + update transaction in a single tx
    await db.transaction(async (tx) => {
      // WP3: release the reservation rather than refunding directly. The
      // release claims the row with a conditional UPDATE and only credits if
      // it won, so this cannot double-refund against a reconciler that got
      // there first — which is what makes the reconciler safe to run against
      // a live system.
      //
      // False means it was already terminal; the money is already back.
      const released = await reservations.release(tx, {
        reservationId,
        reason: `${capability.slug} execution failed`,
      });
      if (!released) {
        logWarn(
          "reservation-release-missed",
          "reservation was already terminal at release time",
          { transaction_id: transactionId, reservation_id: reservationId },
        );
      }

      // Mark transaction failed with audit trail
      const failAudit = buildFailureAudit({
        transactionId, startTime, capability, executionInput,
        errorMessage, executionMode: "async",
      });
      const failProvenance = buildFailureProvenance(
        capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
      );

      await tx
        .update(transactions)
        .set({
          status: "failed",
          error: errorMessage,
          latencyMs,
          completedAt: new Date(),
          auditTrail: failAudit,
          provenance: failProvenance,
          // CCO P0 #6: flip from 'deferred' to 'pending' atomically with
          // the failure write so the retry worker picks up the final
          // state. Same race-elimination as the success path above.
          complianceHashState: "pending",
        })
        .where(
          and(
            eq(transactions.id, transactionId),
            // WP3: do not overwrite a row that already reached a terminal
            // state. Post-WP3 the release is conditional, so a throw AFTER
            // the success commit would otherwise leave the customer charged
            // (capture won) while the row reads "failed" — they would poll,
            // see failure, and reasonably conclude they were not billed.
            inArray(transactions.status, ["executing", "deferred"]),
          ),
        );
    });

    await settleReceiptFor(transactionId);
    if (hasCallback) await jobCallbacks.deliverNow(db, transactionId);

    // CCO P0 #6: row was 'deferred' until the UPDATE above flipped it
    // to 'pending'. Retry worker picks it up on its next tick.
    // Record failure for circuit breaker + quality
    // WP4 remediation: a refusal is the guarded executor working, not a broken
    // capability. Recording it here delisted capabilities for correctly
    // refusing bad input — the quality floor is armed in production.
    if (shouldCountAgainstCapability(err)) {
      fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
      fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    }
    recordQuality({
      transactionId,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });
  }
}


