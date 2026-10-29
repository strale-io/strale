import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createHash } from "node:crypto";
import { assertGuardedAllow } from "../capabilities/guarded-executor.js";
import { getExecutor } from "../capabilities/index.js";
import { getDb } from "../db/index.js";
import { batchOrders } from "../db/schema.js";
import { extractClientMeta } from "../lib/attribution.js";
import { checkCircuitBreaker } from "../lib/circuit-breaker.js";
import { pgErrorCode } from "../lib/db-error.js";
import { hasMissingRequiredCredential } from "../lib/dependency-manifest.js";
import { apiError } from "../lib/errors.js";
import { shouldExecuteAsync } from "../lib/execution-routing.js";
import { logWarn } from "../lib/log.js";
import { matchCapability } from "../lib/matching.js";
import { authMiddleware } from "../lib/middleware.js";
import { consumeKeyUnits } from "../lib/rate-limit.js";
import { isReplayable } from "../lib/idempotency-fingerprint.js";
import * as walletService from "../lib/wallet-service.js";
import type { AppEnv } from "../types.js";
import {
  BATCH_ITEMS_PER_MINUTE,
  BATCH_MAX_ITEMS,
  BATCH_MAX_TOTAL_CENTS,
  computeBatchFingerprint,
  loadBatchResults,
  reserveBatch,
  runBatch,
  summarise,
  validateBatchItem,
  type BatchItemResult,
} from "../lib/do/batch.js";
import { setCreditsHeaders } from "../lib/do/dispatch.js";
import type { CapabilityInfo } from "../lib/do/types.js";

const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_SECONDS = 30;

export const doBatchRoute = new Hono<AppEnv>();

function batchBody(params: {
  batchId: string;
  slug: string;
  unitPriceCents: number;
  quotedTotalCents: number;
  results: BatchItemResult[];
  walletBalanceCents: number;
  replay: boolean;
}) {
  const summary = summarise(params.results);
  return {
    batch_id: params.batchId,
    status: summary.status,
    capability_used: params.slug,
    item_count: params.results.length,
    succeeded: summary.succeeded,
    failed: summary.failed,
    not_run: summary.not_run,
    unit_price_cents: params.unitPriceCents,
    quoted_total_cents: params.quotedTotalCents,
    charged_cents: summary.charged_cents,
    released_cents: params.quotedTotalCents - summary.charged_cents,
    wallet_balance_cents: params.walletBalanceCents,
    results: params.results,
    meta: params.replay ? { idempotency_replay: true } : {},
  };
}

async function replayBatch(c: Context<AppEnv>, db: ReturnType<typeof getDb>, order: typeof batchOrders.$inferSelect, fingerprint: string, slug: string, userId: string) {
  if (!isReplayable(order.idempotencyFingerprint, fingerprint)) {
    return c.json(apiError(
      "idempotency_key_reused",
      "This Idempotency-Key was already used for a different batch. A key identifies one specific request; reusing it for other inputs or another capability is not a retry. Use a new key.",
      { conflicting_batch_id: order.id },
    ), 409);
  }
  const results = await loadBatchResults(db, order);
  if (!results) {
    return c.json(apiError("request_in_progress", "The original batch is still running.", { batch_id: order.id }), 409);
  }
  const balance = (await walletService.readBalance(db, userId)) ?? 0;
  return c.json(batchBody({
    batchId: order.id, slug, unitPriceCents: order.unitPriceCents, quotedTotalCents: order.quotedTotalCents,
    results, walletBalanceCents: balance, replay: true,
  }));
}

// POST /v1/do/batch — many inputs to one capability: one quote, one set of
// holds, per-item results in input order, a charge only for items that
// succeeded. API key and wallet only; x402 batch payment is not built yet.
doBatchRoute.post("/do/batch", authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getDb();
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
  c.set("clientMeta", extractClientMeta(c.req, { src: c.req.query("src"), ip: ip ?? undefined }) ?? null);
  // The audit trail's request context, as /v1/do records it (raw IPs are never stored).
  c.set("requestContext", {
    referer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
    origin: c.req.header("origin") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null,
    acceptLanguage: c.req.header("accept-language")?.split(",")[0]?.trim() ?? null,
    fingerprintHash: null,
    mcpClient: null,
  });

  // ── 1. Shape ───────────────────────────────────────────────────────────
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json(apiError("invalid_request", "Request body is required.", { fix: "Send a JSON object with 'capability_slug', 'inputs' (an array) and 'max_total_price_cents'." }), 400);
  }
  const slug: unknown = body.capability_slug;
  const inputs: unknown = body.inputs;
  const maxTotal: unknown = body.max_total_price_cents;
  if (typeof slug !== "string" || slug.length === 0) {
    return c.json(apiError("invalid_request", "'capability_slug' is required for a batch.", { fix: "Name the tool with 'capability_slug' from GET /v1/capabilities; batches do not match on 'task'." }), 400);
  }
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > BATCH_MAX_ITEMS) {
    return c.json(apiError("invalid_request", `'inputs' must be an array of 1 to ${BATCH_MAX_ITEMS} input objects.`, { fix: `Send between 1 and ${BATCH_MAX_ITEMS} items in 'inputs'; split larger jobs into several batches.`, max_items: BATCH_MAX_ITEMS }), 400);
  }
  if (typeof maxTotal !== "number" || !Number.isSafeInteger(maxTotal) || maxTotal <= 0 || maxTotal > BATCH_MAX_TOTAL_CENTS) {
    return c.json(apiError("invalid_request", `'max_total_price_cents' is required and must be an integer between 1 and ${BATCH_MAX_TOTAL_CENTS}.`, { fix: "Set 'max_total_price_cents' to at least the tool's price_cents times the number of inputs.", max_allowed: BATCH_MAX_TOTAL_CENTS }), 400);
  }
  if (body.timeout_seconds !== undefined &&
      (typeof body.timeout_seconds !== "number" || !Number.isFinite(body.timeout_seconds) || body.timeout_seconds <= 0)) {
    return c.json(apiError("invalid_request", "'timeout_seconds' must be a positive finite number.", { fix: "Send 'timeout_seconds' as a positive number of seconds per item (maximum 60)." }), 400);
  }
  const itemTimeoutMs = Math.min(Math.max(5, body.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS), MAX_TIMEOUT_SECONDS) * 1000;
  const dryRun = body.dry_run === true;

  const idempotencyKey = c.req.header("Idempotency-Key") || null;
  if (idempotencyKey && idempotencyKey.length > 255) {
    return c.json(apiError("invalid_request", "Idempotency-Key must be 255 characters or fewer.", { fix: "Shorten the Idempotency-Key header to 255 characters or fewer." }), 400);
  }

  // ── 2. Rate limit: items, not requests ─────────────────────────────────
  const limited = consumeKeyUnits(c, inputs.length, BATCH_ITEMS_PER_MINUTE, 60_000, "batch-items");
  if (limited) return limited;

  // ── 3. Replay before any other work ────────────────────────────────────
  // Validated as objects first so the fingerprint is over what was sent.
  const objectInputs = inputs as Record<string, unknown>[];
  const fingerprint = computeBatchFingerprint(slug, objectInputs);
  if (idempotencyKey && !dryRun) {
    const [order] = await db.select().from(batchOrders)
      .where(and(eq(batchOrders.userId, user.id), eq(batchOrders.idempotencyKey, idempotencyKey))).limit(1);
    if (order) return replayBatch(c, db, order, fingerprint, slug, user.id);
  }

  // ── 4. The capability ──────────────────────────────────────────────────
  const match = await matchCapability({ capabilitySlug: slug, maxPriceCents: Number.MAX_SAFE_INTEGER });
  if (!match) {
    return c.json(apiError("no_matching_capability", `No servable capability '${slug}'.`, { capability_slug: slug }), 404);
  }
  const capability = match.capability as unknown as CapabilityInfo & { inputSchema: unknown; outputSchema: unknown; avgLatencyMs: number | null };
  if (capability.isFreeTier || capability.priceCents <= 0) {
    return c.json(apiError("invalid_request", `'${slug}' is a free tool; batches are for paid tools.`, { fix: "Call free tools one input at a time with POST /v1/do; they are not charged." }), 400);
  }
  if (shouldExecuteAsync(capability.avgLatencyMs)) {
    return c.json(apiError("invalid_request", `'${slug}' runs asynchronously and cannot be batched yet.`, { fix: "Call this tool one input at a time with POST /v1/do and poll each transaction." }), 400);
  }

  const quoted = capability.priceCents * objectInputs.length;
  if (quoted > maxTotal) {
    return c.json(apiError("budget_exceeded",
      `${objectInputs.length} × ${capability.priceCents} cents = ${quoted} cents, which exceeds your max_total_price_cents of ${maxTotal}.`,
      { capability_slug: slug, unit_price_cents: capability.priceCents, item_count: objectInputs.length, quoted_total_cents: quoted, required_cents: quoted, max_total_price_cents: maxTotal }), 402);
  }

  // ── 5. Every item valid, or none runs ──────────────────────────────────
  const invalid: Array<{ index: number; error_code: string; message: string; details?: Record<string, unknown> }> = [];
  for (let i = 0; i < objectInputs.length; i++) {
    const failure = validateBatchItem(capability, objectInputs[i]);
    if (failure?.error_code === "capability_unavailable") return c.json(failure, 503);
    if (failure) invalid.push({ index: i, error_code: failure.error_code, message: failure.message, details: failure.details });
  }
  if (invalid.length > 0) {
    return c.json(apiError("invalid_request", `${invalid.length} of ${objectInputs.length} inputs are invalid; nothing was run or charged.`, {
      fix: "Correct the listed items (by zero-based index) and resend the whole batch.",
      invalid_items: invalid,
    }), 400);
  }

  // ── 6. Servability, once for the batch ─────────────────────────────────
  if (hasMissingRequiredCredential(capability.slug)) {
    return c.json(apiError("capability_unavailable", "This capability is temporarily unavailable. Contact Strale support."), 503);
  }
  const executor = getExecutor(capability.slug);
  if (!executor) {
    return c.json(apiError("capability_unavailable", `Capability '${capability.slug}' is registered but has no executor.`), 503);
  }
  try {
    await assertGuardedAllow(capability.slug, { kind: "customer_paid", userId: user.id, transactionId: null });
  } catch (err) {
    return c.json(apiError("capability_unavailable", err instanceof Error ? err.message : "Capability refused."), 503);
  }
  const circuit = await checkCircuitBreaker(capability.slug);
  if (!circuit.allowed) {
    return c.json(apiError("capability_unavailable", circuit.reason ?? `Capability '${capability.slug}' is temporarily suspended.`,
      { circuit_state: circuit.state, next_retry_at: circuit.next_retry_at ?? null }), 503);
  }

  if (dryRun) {
    const balance = (await walletService.readBalance(db, user.id)) ?? 0;
    return c.json({
      dry_run: true,
      would_execute: capability.slug,
      item_count: objectInputs.length,
      unit_price_cents: capability.priceCents,
      quoted_total_cents: quoted,
      wallet_balance_cents: balance,
      wallet_sufficient: balance >= quoted,
    });
  }

  // ── 7. Reserve the whole quote, once ───────────────────────────────────
  let reserved;
  try {
    reserved = await reserveBatch({
      db, user, apiKeyId: c.get("apiKeyId"), capability, itemCount: objectInputs.length,
      maxTotalPriceCents: maxTotal, idempotencyKey, fingerprint,
    });
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "25P03" || code === "55P03") {
      logWarn("wallet-tx-timeout", "batch reserve timed out", { code, slug, userId: user.id });
      return c.json(apiError("timeout_exceeded", "The wallet was busy and the batch was not reserved or charged. Retry with backoff.", { postgres_code: code }), 503);
    }
    // A concurrent submission of the same key that lost the unique index.
    if (code === "23505" && idempotencyKey) {
      return c.json(apiError("request_in_progress", "A batch with this Idempotency-Key is already running."), 409);
    }
    throw err;
  }

  switch (reserved.kind) {
    case "replay":
      return replayBatch(c, db, reserved.order, fingerprint, slug, user.id);
    case "key_conflict":
      return c.json(apiError("idempotency_key_reused",
        "This Idempotency-Key was already used for a single call. Use a new key for the batch.",
        { conflicting_transaction_id: reserved.transactionId }), 409);
    case "key_policy":
      return c.json(reserved.error, reserved.error.error_code === "unauthorized" ? 401 : 429);
    case "insufficient_balance":
      return c.json(apiError("insufficient_balance",
        `Your wallet has €${(reserved.balance / 100).toFixed(2)} available but this batch is quoted at €${(reserved.required / 100).toFixed(2)}.`,
        { wallet_balance_cents: reserved.balance, required_cents: reserved.required, topup_url: "/v1/wallet/topup" }), 402);
    case "spend_cap_exceeded":
      return c.json(apiError("spend_cap_exceeded",
        `Hourly spend limit (€${(reserved.limit / 100).toFixed(2)}) would be exceeded. Spent: €${(reserved.spent / 100).toFixed(2)}, requested: €${(reserved.required / 100).toFixed(2)}.`,
        { spent_cents: reserved.spent, requested_cents: reserved.required, limit_cents: reserved.limit }), 429);
  }

  // ── 8. Run, settle per item, answer in input order ─────────────────────
  const results = await runBatch({
    c, db, user, capability, executor,
    outputSchema: (capability.outputSchema ?? {}) as Record<string, unknown>,
    itemTimeoutMs, inputs: objectInputs, reservationIds: reserved.reservationIds, batchId: reserved.batchId,
  });
  const balance = (await walletService.readBalance(db, user.id)) ?? 0;
  const response = batchBody({
    batchId: reserved.batchId, slug: capability.slug, unitPriceCents: capability.priceCents,
    quotedTotalCents: quoted, results, walletBalanceCents: balance, replay: false,
  });
  setCreditsHeaders(c, balance, response.charged_cents);
  return c.json(response);
});
