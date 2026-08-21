/**
 * POST /v1/solutions/:slug/execute — Execute a bundled solution.
 *
 * Two-phase transaction write matching /v1/do pattern:
 * 1. Insert transaction row at "executing" inside same DB transaction as wallet debit
 * 2. Update to "completed" or "failed" after executeSolution() returns
 *
 * Status vocabulary matches /v1/do: "completed" or "failed".
 * Partial successes (some steps failed, caller received value) map to "completed"
 * with per-step detail in audit_trail JSONB.
 *
 * Full failure refunds the wallet. Partial success does NOT refund.
 *
 * Part of DEC-20260405-A fix plan, phase 1.4.
 */

import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  computeIdempotencyFingerprint,
  isReplayable,
} from "../lib/idempotency-fingerprint.js";
import { extractClientMeta } from "../lib/attribution.js";
import { solutions, wallets, walletTransactions, transactions } from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { executeSolution } from "../lib/solution-executor.js";
import {
  aggregateSolutionOutcome,
  assessOutput,
  outcomeFromOutput,
} from "../lib/execution-outcome.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { logError, logWarn } from "../lib/log.js";
import * as walletService from "../lib/wallet-service.js";
import * as reservations from "../lib/wallet-reservations.js";
import { getProcessingJurisdictions } from "../lib/provenance-builder.js";
import type { AppEnv } from "../types.js";

export const solutionExecuteRoute = new Hono<AppEnv>();

solutionExecuteRoute.post(
  "/:slug/execute",
  authMiddleware,
  rateLimitByKey(10, 1000),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user");
    const db = getDb();

    c.get("log").info(
      { label: "solutions-execute-start", solution_slug: slug },
      "solutions-execute-start",
    );

    // ── 1. Parse request body ─────────────────────────────────────────
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json(apiError("invalid_request", "Request body is required."), 400);
    }

    const inputs = body.inputs;

    // WP6: bound to the bundle and its inputs, exactly as on the capability
    // rail, so one helper defines what "the same request" means everywhere.
    const idempotencyKey = c.req.header("Idempotency-Key") || null;
    const idempotencyFingerprint = computeIdempotencyFingerprint({
      rail: "solution",
      capabilitySlug: slug,
      inputs: inputs as Record<string, unknown> | null,
    });
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      return c.json(
        apiError("invalid_request", "'inputs' is required and must be an object."),
        400,
      );
    }

    const maxPriceCents: number | undefined =
      typeof body.max_price_cents === "number" && body.max_price_cents > 0
        ? Math.round(body.max_price_cents)
        : undefined;

    // ── 2. Look up solution ───────────────────────────────────────────
    const [sol] = await db
      .select({
        id: solutions.id,
        slug: solutions.slug,
        name: solutions.name,
        priceCents: solutions.priceCents,
        isActive: solutions.isActive,
        transparencyTag: solutions.transparencyTag,
      })
      .from(solutions)
      .where(eq(solutions.slug, slug))
      .limit(1);

    if (!sol || !sol.isActive) {
      return c.json(
        apiError("not_found", `Solution '${slug}' not found.`),
        404,
      );
    }

    // ── 3. Price check (before wallet debit) ──────────────────────────
    if (maxPriceCents !== undefined && sol.priceCents > maxPriceCents) {
      return c.json(
        apiError("budget_exceeded", `Solution '${slug}' costs €${(sol.priceCents / 100).toFixed(2)} which exceeds your max_price_cents of ${maxPriceCents}.`, {
          solution_slug: slug,
          actual_price_cents: sol.priceCents,
          max_price_cents: maxPriceCents,
        }),
        402,
      );
    }

    // ── 4. Wallet debit + transaction insert (single DB transaction) ──
    const startTime = Date.now();
    let transactionId: string;
    let balanceAfter: number;
    let walletId: string;
    let walletBalanceBefore: number;
    /** WP3: the open reservation this run must capture or release. */
    let reservationId: string;

    try {
      const txResult = await db.transaction(async (tx) => {
        // Lock wallet row
        // WP6: idempotency on the most expensive SKUs. Solutions had NO replay
        // guard at all, so a client retrying a €2.50 call — a timeout, a proxy
        // redelivery, an agent's own retry loop — was charged again. The
        // capability rail has had this since MVP; the bundle rail never did.
        if (idempotencyKey) {
          const [prior] = await tx
            .select()
            .from(transactions)
            .where(
              and(
                eq(transactions.idempotencyKey, idempotencyKey),
                eq(transactions.userId, user.id),
                // Review finding, and it would have been live on day one:
                // without this the lookup matched ANY prior row with that key,
                // including the 421 existing capability rows — every one of
                // which carries a NULL fingerprint, because solutions never
                // wrote keys before. A customer reusing an old /v1/do key on a
                // KYB bundle would have received that capability's payload,
                // labelled as a KYB Complete result, on the product whose
                // entire selling point is the audit trail. No charge, so not a
                // double-charge — a wrong-answer defect, which is the class
                // this package exists to close.
                eq(transactions.solutionSlug, sol.slug),
                isNull(transactions.deletedAt),
              ),
            )
            .limit(1);

          if (prior) {
            if (!isReplayable(prior.idempotencyFingerprint, idempotencyFingerprint)) {
              return { ok: false as const, keyConflictWith: prior.id };
            }
            // Only a COMPLETED run is a replay. A prior failure is exactly when
            // a client retries, and short-circuiting would hand back HTTP 200
            // carrying status:"failed" with a non-zero price — read as success
            // by anything keying off response.ok. Re-executing is what the
            // caller wants and what happened before this package existed.
            if (prior.status === "completed") {
              return { ok: false as const, replayOf: prior };
            }
          }
        }

        const [wallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, user.id))
          .for("update");

        if (!wallet || wallet.balanceCents < sol.priceCents) {
          return {
            ok: false as const,
            balance: wallet?.balanceCents ?? 0,
          };
        }

        // Insert transaction row at "executing" — two-phase write per /v1/do pattern
        const [txnRecord] = await tx
          .insert(transactions)
          .values({
            userId: user.id,
            capabilityId: null,
            solutionSlug: sol.slug,
            status: "executing",
            idempotencyKey,
            idempotencyFingerprint,
            clientMeta: extractClientMeta(c.req, {
              src: c.req.query("src"),
              ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
            }) ?? null,
            input: inputs as Record<string, unknown>,
            priceCents: sol.priceCents,
            transparencyMarker: sol.transparencyTag ?? "mixed",
            // F-AUDIT-01 / CCO #3: previously hardcoded "EU" while running in
            // US East. Solutions always include orchestration through Strale's
            // own processing region, plus US for any LLM step (Anthropic).
            // transparencyTag "mixed" or "ai_generated" → adds US automatically.
            dataJurisdiction:
              getProcessingJurisdictions("stable_api", sol.transparencyTag ?? "mixed").join(",") ||
              "unknown",
            // CCO P0 #6: solutions can take >10s (the GRACE_MS the retry
            // worker uses), so a 'pending' insert would race the worker.
            // Insert as 'deferred'; phase-2 UPDATEs flip to 'pending'
            // atomically with the final auditTrail/output writes.
            complianceHashState: "deferred",
            paymentMethod: "wallet",
          })
          .returning({ id: transactions.id });

        // WP3: reserve rather than plainly debit. Solutions have the same
        // crash window /v1/do had, and a wider one — execution is multi-step
        // and takes seconds to minutes — on the platform's most expensive
        // SKUs. The four refund call sites below all live in this process; a
        // SIGKILL anywhere in that window strands the charge unless something
        // durable records that the debit was provisional.
        //
        // Ordered after the transaction insert so the reservation can carry
        // its reference. Both writes are in this transaction, so the sequence
        // between them is not observable.
        const reservation = await reservations.reserve(tx, {
          wallet,
          userId: user.id,
          amountCents: sol.priceCents,
          transactionId: txnRecord.id,
          description: `Solution: ${sol.slug}`,
        });

        return {
          ok: true as const,
          transactionId: txnRecord.id,
          balanceAfter: reservation.balanceAfter,
          walletId: wallet.id,
          walletBalanceBefore: wallet.balanceCents,
          reservationId: reservation.id,
        };
      });

      // WP6: three distinct not-ok shapes now share this branch, and they mean
      // very different things to the caller. Discriminate before assuming the
      // wallet one, or a replay would be reported as insufficient funds.
      if (!txResult.ok && "keyConflictWith" in txResult) {
        return c.json(
          apiError(
            "idempotency_key_reused",
            "This Idempotency-Key was already used for a different request. " +
              "A key identifies one specific request; reusing it for different " +
              "inputs or a different solution is not a retry. Use a new key.",
            { conflicting_transaction_id: txResult.keyConflictWith },
          ),
          409,
        );
      }

      if (!txResult.ok && "replayOf" in txResult) {
        // The whole point: the bundle is NOT executed again and NOT charged
        // again. Pre-WP6 a retry of a €2.50 solution simply ran and billed a
        // second time.
        const prior = txResult.replayOf!;
        return c.json({
          result: {
            transaction_id: prior.id,
            solution_slug: sol.slug,
            status: prior.status,
            steps: (prior.output as { steps?: unknown } | null)?.steps ?? prior.output,
            price_cents: prior.priceCents,
            latency_ms: prior.latencyMs,
          },
          meta: { idempotency_replay: true, audit: prior.auditTrail },
        });
      }

      if (!txResult.ok) {
        return c.json(
          apiError("insufficient_balance", `Your wallet has €${(txResult.balance / 100).toFixed(2)} but this solution costs €${(sol.priceCents / 100).toFixed(2)}.`, {
            wallet_balance_cents: txResult.balance,
            required_cents: sol.priceCents,
            topup_url: "/v1/wallet/topup",
          }),
          402,
        );
      }

      transactionId = txResult.transactionId;
      balanceAfter = txResult.balanceAfter;
      walletId = txResult.walletId;
      walletBalanceBefore = txResult.walletBalanceBefore;
      reservationId = txResult.reservationId;
    } catch (err) {
      c.get("log").error(
        { label: "solutions-tx-insert-failed", solution_slug: slug, err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
        "solutions-tx-insert-failed",
      );
      return c.json(
        apiError("execution_failed", "Failed to process payment."),
        500,
      );
    }

    // ── 5. Execute solution steps ─────────────────────────────────────
    let execResult;
    try {
      execResult = await executeSolution(sol.id, inputs as Record<string, unknown>);
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      c.get("log").error(
        { label: "solutions-execute-error", solution_slug: slug, err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
        "solutions-execute-error",
      );

      // F-B-022: Update transaction to failed. AWAIT so the row reaches a
      // terminal state before we respond — a fire-and-forget UPDATE on a DB
      // blip would wedge the row at status='executing'. Refund runs
      // regardless; the caller is already receiving a failure response.
      try {
        await db.update(transactions)
          .set({
            status: "failed",
            error: sanitizeFailureReason(errorMessage),
            latencyMs,
            completedAt: new Date(),
            auditTrail: buildInlineAudit(slug, [], 0, 0, latencyMs, true, c),
            // CCO P0 #6: flip 'deferred' → 'pending' atomically with the
            // final write so the retry worker hashes the final state.
            complianceHashState: "pending",
          })
          .where(eq(transactions.id, transactionId));
      } catch (e) {
        c.get("log").error(
          { label: "solutions-tx-update-failed", transaction_id: transactionId, solution_slug: slug, err: e instanceof Error ? { message: e.message } : e },
          "solutions-tx-update-failed",
        );
      }

      // Refund
      await refundWallet(db, walletId, sol.priceCents, sol.slug, "execution error", reservationId);

      return c.json(
        apiError("execution_failed", "Solution execution failed. You were not charged.", {
          transaction_id: transactionId,
          solution_slug: slug,
          error: sanitizeFailureReason(errorMessage),
          wallet_balance_cents: walletBalanceBefore,
        }),
        500,
      );
    }

    if (!execResult) {
      const latencyMs = Date.now() - startTime;

      // F-B-022: await the UPDATE so the row isn't wedged at 'executing'
      // if the DB briefly flakes. Refund runs regardless.
      try {
        await db.update(transactions)
          .set({
            status: "failed",
            error: "Solution has no steps configured",
            latencyMs,
            completedAt: new Date(),
            auditTrail: buildInlineAudit(slug, [], 0, 0, latencyMs, true, c),
            // CCO P0 #6: flip 'deferred' → 'pending' atomically with the
            // final write so the retry worker hashes the final state.
            complianceHashState: "pending",
          })
          .where(eq(transactions.id, transactionId));
      } catch (e) {
        c.get("log").error(
          { label: "solutions-tx-update-failed", transaction_id: transactionId, solution_slug: slug, err: e instanceof Error ? { message: e.message } : e },
          "solutions-tx-update-failed",
        );
      }

      await refundWallet(db, walletId, sol.priceCents, sol.slug, "no steps configured", reservationId);

      return c.json(
        apiError("execution_failed", "Solution has no steps configured. You were not charged.", {
          transaction_id: transactionId,
          solution_slug: slug,
          wallet_balance_cents: walletBalanceBefore,
        }),
        503,
      );
    }

    // ── 6. Determine status (matches /v1/do vocabulary) ───────────────
    const latencyMs = Date.now() - startTime;
    const totalSteps = execResult.step_count;
    const errorCount = execResult.errors.length;
    // Money-integrity 2026-08-12: success = a step that actually produced
    // output. The previous `step_count - errors.length` counted SKIPPED and
    // UNAVAILABLE steps as successes, so a solution whose step 1 failed
    // (starving every downstream step) billed full price for zero executed
    // checks. Same predicate the x402 rail settles on (DEC-14).
    // WP4: the same aggregate the x402 rail now reads. The rule this encodes is
    // unchanged from what this rail already did — a tripped gate is not a
    // failure (the gate answered truthfully) but it is a refund, because the
    // bundle could not perform the work it was sold for. What changed is that
    // the rule now lives in one place, so the other rail cannot disagree.
    const outcome = aggregateSolutionOutcome(
      Object.entries(execResult.steps).map(([stepSlug, stepOutput]) =>
        outcomeFromOutput(stepSlug, stepOutput),
      ),
      execResult.gated,
    );
    // WP8: a bundle we could not run in full because WE withheld a component
    // is not partial delivery — it is us failing to deliver what was sold. Six
    // live solutions currently contain a quarantined capability, two of them
    // EUR 2.50 KYB bundles; billing full price for a KYB check missing its
    // registry lookup would be charging for a hollow answer. DEC-14: no charge
    // for work not delivered.
    const platformWithheldStep = Object.values(execResult.steps).some(
      (v) =>
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).platform_withheld === true,
    );

    const gated = execResult.gated;
    const stepsSucceeded = outcome.steps_succeeded;
    const allFailed = stepsSucceeded === 0;
    const refundRequired = !outcome.billable || platformWithheldStep;

    // /v1/do vocabulary: "completed" or "failed". Partial success maps to
    // "completed" with per-step detail in audit_trail. A gated run completed —
    // it answered — so status is not simply `transactionStatusFor(outcome)`.
    const txStatus = allFailed ? "failed" : "completed";
    const chargedPrice = refundRequired ? 0 : sol.priceCents;

    if (refundRequired) {
      await refundWallet(
        db, walletId, sol.priceCents, sol.slug,
        gated ? `gate tripped: ${gated.capabilitySlug}.${gated.field}` : "all steps failed",
        reservationId,
      );
    }

    const finalBalance = refundRequired ? walletBalanceBefore : balanceAfter;

    // Build per-step audit breakdown with per-step latency. Every step now
    // appears (the executor records skipped/unavailable markers instead of
    // silently omitting them), with an honest four-state status — an audit
    // trail that says "14 steps" must list 14 steps.
    const stepAuditEntries = Object.entries(execResult.steps).map(([capSlug, output], index) => {
      const obj = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
      // WP4: the audit label reads the same assessment billing reads. Leaving
      // this on the old predicate would print "completed" for an
      // `{error, status}` step that billing had just counted as a failure —
      // the same divergence this package closes, one layer down.
      const status = assessOutput(capSlug, output).semantically_usable
        ? "completed"
        : obj.skipped === true
          ? "skipped"
          : obj.unavailable === true
            ? "unavailable"
            : "failed";
      const timing = execResult.stepTimings.find((t) => t.capabilitySlug === capSlug);
      return {
        index,
        capabilitySlug: capSlug,
        status,
        latencyMs: timing?.latencyMs ?? 0,
        // error is populated only for real executor failures; the reason slot
        // covers skipped/unavailable. A completed soft verdict (valid:false)
        // carries neither (review H-1/L-1).
        error: status === "failed"
          ? sanitizeFailureReason(execResult.errors.find((e) => e.startsWith(`${capSlug}:`))?.split(": ").slice(1).join(": ") ?? (typeof obj.error === "string" ? obj.error : null))
          : status === "skipped" || status === "unavailable"
            ? (typeof obj.reason === "string" ? obj.reason : null)
            : null,
      };
    });

    // TODO: extract to buildFullSolutionAudit() once the shape stabilizes
    // across multiple solution executions in production. See DEC-20260405-B.
    const auditTrail = buildInlineAudit(
      slug, stepAuditEntries, stepsSucceeded, errorCount, latencyMs, allFailed, c,
    );

    // ── 7. Update transaction row (phase 2 of two-phase write) ────────
    // F-B-022: AWAIT the phase-2 UPDATE. If it fails, the wallet was debited
    // in phase-1 (unless allFailed, in which case we already refunded at
    // line ~270). A wedged 'executing' row with a debited wallet is the
    // worst outcome — customer paid, no record. Refund on the non-allFailed
    // path and return 500 so the caller can retry.
    try {
      await db.transaction(async (tx) => {
        await tx.update(transactions)
          .set({
            status: txStatus,
            output: execResult.steps,
            latencyMs,
            completedAt: new Date(),
            priceCents: chargedPrice,
            auditTrail,
            // CCO P0 #6: flip 'deferred' → 'pending' atomically with the
            // final auditTrail/output write. The retry worker will hash the
            // final state on its next tick (≥10s later) — no race possible.
            complianceHashState: "pending",
          })
          .where(eq(transactions.id, transactionId));

        // WP3: settle the reservation in the SAME transaction as the terminal
        // status write. A refunded run has already released it above, so this
        // only captures the runs that kept the money. Separately, a crash
        // between the two writes would leave a finished run holding an open
        // reservation for the reconciler to refund — paying back work the
        // customer received.
        if (!refundRequired) {
          const captured = await reservations.capture(tx, {
            reservationId,
            reason: `solution ${txStatus}`,
          });
          if (!captured) {
            logWarn(
              "solutions-capture-missed",
              "reservation was already terminal at capture time",
              { transaction_id: transactionId, reservation_id: reservationId },
            );
          }
        }
      });
    } catch (e) {
      c.get("log").error(
        {
          label: "solutions-tx-update-failed",
          transaction_id: transactionId,
          solution_slug: slug,
          all_failed: allFailed,
          gated: gated !== undefined,
          err: e instanceof Error ? { message: e.message, stack: e.stack } : e,
        },
        "solutions-tx-update-failed",
      );

      // Anything on the refundRequired path already refunded above. Guarding
      // on `allFailed` alone was correct until gates existed: a gated run has
      // allFailed === false (the gate step succeeded), so it would have been
      // refunded here a SECOND time. Caught by auditing the whole route rather
      // than only the block being edited.
      if (!refundRequired) {
        await refundWallet(db, walletId, sol.priceCents, sol.slug, "phase2 update failed", reservationId);
      }

      return c.json(
        apiError("transaction_finalization_failed", "Solution executed but the transaction record could not be finalized. You were not charged.", {
          transaction_id: transactionId,
          solution_slug: slug,
          wallet_balance_cents: walletBalanceBefore,
        }),
        500,
      );
    }

    c.get("log").info(
      {
        label: "solutions-execute-done",
        solution_slug: slug,
        status: txStatus,
        latency_ms: latencyMs,
        steps_succeeded: stepsSucceeded,
        steps_failed: errorCount,
        transaction_id: transactionId,
      },
      "solutions-execute-done",
    );

    // ── 8. Build response ─────────────────────────────────────────────
    // result.status uses the richer vocabulary for the caller:
    // "completed" (all ok), "partial" (some failed), "failed" (all failed)
    const responseStatus = allFailed ? "failed" : (errorCount > 0 ? "partial" : "completed");

    return c.json({
      result: {
        transaction_id: transactionId,
        solution_slug: sol.slug,
        status: responseStatus,
        steps: execResult.steps,
        errors: execResult.errors.length > 0 ? execResult.errors : undefined,
        step_count: totalSteps,
        latency_ms: latencyMs,
        price_cents: chargedPrice,
        wallet_balance_cents: finalBalance,
        // Present only when a precondition stopped the run. Says which step
        // stopped it, what it saw, and — because the caller's next question is
        // always "was I charged?" — that they were not.
        ...(gated
          ? {
              gated: {
                stopped_at: gated.capabilitySlug,
                field: gated.field,
                observed: gated.observed,
                reason: gated.reason,
                charged: false,
              },
            }
          : {}),
      },
      meta: {
        solution_used: sol.slug,
        price_cents: chargedPrice,
        latency_ms: latencyMs,
        wallet_balance_cents: finalBalance,
        audit: auditTrail,
      },
    });
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a solution charge.
 *
 * WP2: this used to write an ABSOLUTE balance — the value read before the
 * solution executed — outside any transaction and without a row lock. Execution
 * takes seconds to minutes, so any debit or top-up that landed in that window
 * was silently overwritten, and the ledger row it wrote recorded a delta that
 * did not match the balance change. It now goes through the wallet service,
 * which applies an in-database delta and writes the paired ledger row in one
 * transaction, so `originalBalance` is no longer needed or wanted.
 *
 * The swallow is kept deliberately: the customer has already been told they
 * were not charged, and throwing here would turn a refund failure into a
 * confusing execution error. It is still wrong for a failed refund to be
 * invisible — WP3's reconciler is what makes it recoverable rather than merely
 * logged.
 */
async function refundWallet(
  db: ReturnType<typeof getDb>,
  walletId: string,
  priceCents: number,
  solutionSlug: string,
  reason: string,
  reservationId: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // WP3: release the reservation rather than crediting directly. The
      // release claims the row with a conditional UPDATE and only credits if
      // it won, so this cannot double-refund against a reconciler that got
      // there first — which is what makes the reconciler safe to run while
      // solutions are executing.
      const released = await reservations.release(tx, {
        reservationId,
        reason: `${solutionSlug} (${reason})`,
      });
      if (!released) {
        logWarn(
          "solutions-release-missed",
          "reservation was already terminal at release time",
          { solution_slug: solutionSlug, reservation_id: reservationId },
        );
      }
    });
  } catch (err) {
    logError("solutions-refund-failed", err, { solution_slug: solutionSlug, wallet_id: walletId });
  }
}

function buildInlineAudit(
  solutionSlug: string,
  steps: Array<{ index: number; capabilitySlug: string; status: string; latencyMs: number; error: string | null }>,
  stepsSucceeded: number,
  stepsFailed: number,
  totalLatencyMs: number,
  refunded: boolean,
  c: any,
): Record<string, unknown> {
  // TODO: extract to buildFullSolutionAudit() once the shape stabilizes
  // across multiple solution executions in production. See DEC-20260405-B.
  return {
    requestContext: {
      userAgent: c.req.header("user-agent") ?? null,
      referer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      origin: c.req.header("origin") ?? null,
      timestamp: new Date().toISOString(),
    },
    solutionSlug,
    steps,
    stepsSucceeded,
    stepsFailed,
    totalLatencyMs,
    refunded,
  };
}
