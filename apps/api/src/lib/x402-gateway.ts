/**
 * x402 Payment Gateway — per-request USDC payments for AI agents.
 *
 * Enables agents to pay for Strale capabilities per-call using USDC on Base.
 * No signup, no API key, no human in the loop.
 *
 * Flow:
 * 1. Agent requests paid capability without auth → gets HTTP 402 with price
 * 2. Agent signs USDC transfer authorization
 * 3. Agent retries with X-PAYMENT header containing signed proof
 * 4. Facilitator verifies and settles on-chain
 * 5. Capability executes and returns result
 *
 * Testnet (Base Sepolia): free x402.org facilitator, no CDP keys needed
 * Mainnet (Base): Coinbase CDP facilitator with API keys
 */

import { HTTPFacilitatorClient } from "@x402/core/server";
import { parsePaymentPayload } from "@x402/core/schemas";
import { createFacilitatorConfig } from "@coinbase/x402";
import { logError } from "./log.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS ?? "";
// x402 v1 simple network names ("base", "base-sepolia") for compatibility
// with the canonical x402-fetch client. See x402-gateway-v2.ts for rationale.
const NETWORK = process.env.X402_NETWORK ?? "base-sepolia";
const EUR_USD_RATE = parseFloat(process.env.EUR_USD_RATE ?? "1.08");
if (!Number.isFinite(EUR_USD_RATE) || EUR_USD_RATE <= 0) {
  // Fail fast at module load: a malformed env value ("1,085", "") would
  // otherwise emit maxAmountRequired: "NaN" on every 402.
  throw new Error(`EUR_USD_RATE is not a positive number: "${process.env.EUR_USD_RATE}"`);
}
// Integer micro-USD rate for exact conversion. Float arithmetic on the raw
// rate produced machine-surface artifacts (catalog `price_usd:
// 0.21600000000000003`) and a systematic +1 atomic-unit overcharge in
// settlement (ceil(216000.00000000003) = 216001). All conversions below go
// through integer micro-USD so advertised price and settled amount agree
// exactly. P1 machine-surface audit finding, 2026-08-12.
const EUR_USD_RATE_MICRO = Math.round(EUR_USD_RATE * 1_000_000);

/** EUR cents → integer micro-USD (= USDC atomic units), rounded up. */
function eurCentsToMicroUsd(eurCents: number): number {
  return Math.ceil((eurCents * EUR_USD_RATE_MICRO) / 100);
}

// USDC contract addresses
const USDC_CONTRACTS: Record<string, string> = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // Base mainnet
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Base Sepolia
};

const USDC_ADDRESS = USDC_CONTRACTS[NETWORK] ?? USDC_CONTRACTS["base-sepolia"];

/** Whether x402 is configured (wallet address set). */
export function isX402Configured(): boolean {
  return WALLET_ADDRESS.length > 0;
}

// ─── Facilitator selection ──────────────────────────────────────────────────
//
// Which facilitator processes verify/settle is a money-path decision, so it is
// an explicit, reviewable config switch rather than an implicit consequence of
// which credentials happen to be present.
//
// `X402_FACILITATOR` selects the mode:
//
//   auto    (default) — Base mainnet + CDP keys present → CDP; otherwise the
//                       HTTP facilitator at X402_FACILITATOR_URL. This is the
//                       historical behaviour, kept as the default so deploying
//                       this change alone moves no traffic.
//   cdp               — always Coinbase's CDP facilitator. Requires
//                       CDP_API_KEY_ID + CDP_API_KEY_SECRET; refuses to start
//                       without them (see below). This is the rollout target.
//   legacy            — always the HTTP facilitator at X402_FACILITATOR_URL,
//                       even when CDP keys are present. This is the rollback
//                       lever: flipping back does not require deleting keys.
//
// Why the rollout matters (2026-08-12 distribution audit): the CDP Bazaar —
// the discovery index behind Agentic.Market and several downstream
// aggregators — catalogues a resource when *its own facilitator* processes a
// PaymentPayload carrying the bazaar extension. Strale already emits a
// complete `extensions.bazaar` block on every 402 (see buildBazaarDiscovery in
// routes/x402-gateway-v2.ts), but it is emitted into a facilitator that does
// not catalogue it. Routing settlement through CDP makes the whole paid
// catalog self-index off organic traffic.
//
// This switch changes only WHICH facilitator is called. It does not touch the
// verify → execute → settle ordering (DEC-14); both callers below are
// unchanged, and x402-gateway-v2.settlement-order.test.ts still pins the
// ordering at the route layer.

/** Coinbase CDP facilitator base URL, from @coinbase/x402's createFacilitatorConfig. */
export const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

/** Facilitator used when no X402_FACILITATOR_URL is configured. */
export const DEFAULT_LEGACY_FACILITATOR_URL = "https://x402.org/facilitator";

export type FacilitatorMode = "auto" | "cdp" | "legacy";

export interface FacilitatorSelection {
  /** The facilitator the payment path will actually call. */
  kind: "cdp" | "legacy";
  /** Its URL — also what discovery surfaces must advertise. */
  url: string;
  /** The configured mode that produced this selection. */
  mode: FacilitatorMode;
}

/** Env slice the selection depends on. Passed explicitly so it is testable. */
export interface FacilitatorEnv {
  X402_FACILITATOR?: string;
  X402_FACILITATOR_URL?: string;
  X402_NETWORK?: string;
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
}

const FACILITATOR_MODES: readonly FacilitatorMode[] = ["auto", "cdp", "legacy"];

function isMainnetNetwork(network: string): boolean {
  return network === "base" || network === "eip155:8453";
}

/**
 * Resolve which facilitator to use from environment configuration.
 *
 * Pure — no module state, no side effects — so the selection matrix can be
 * unit-tested without touching process.env or constructing a client.
 *
 * @throws if X402_FACILITATOR is set to an unknown value, or is set to "cdp"
 *   without both CDP credentials. Failing loudly is deliberate: @coinbase/x402
 *   builds an unauthenticated config when keys are absent, so a silent fallback
 *   would produce 401s from CDP on every paid call — or, worse, look like a
 *   successful cutover while nothing indexes.
 */
export function resolveFacilitatorSelection(env: FacilitatorEnv): FacilitatorSelection {
  const raw = (env.X402_FACILITATOR ?? "").trim().toLowerCase();
  const mode = (raw === "" ? "auto" : raw) as FacilitatorMode;
  if (!FACILITATOR_MODES.includes(mode)) {
    throw new Error(
      `X402_FACILITATOR must be one of ${FACILITATOR_MODES.join(" | ")}, got "${env.X402_FACILITATOR}"`,
    );
  }

  const legacyUrl = env.X402_FACILITATOR_URL?.trim() || DEFAULT_LEGACY_FACILITATOR_URL;
  const hasCdpKeys = Boolean(env.CDP_API_KEY_ID?.trim() && env.CDP_API_KEY_SECRET?.trim());

  if (mode === "legacy") {
    return { kind: "legacy", url: legacyUrl, mode };
  }

  if (mode === "cdp") {
    if (!hasCdpKeys) {
      throw new Error(
        "X402_FACILITATOR=cdp requires both CDP_API_KEY_ID and CDP_API_KEY_SECRET. " +
          "Set them, or use X402_FACILITATOR=legacy.",
      );
    }
    // Deliberately not gated on mainnet: running mode=cdp against
    // base-sepolia is the supported way to rehearse the switch before
    // pointing production traffic at it.
    return { kind: "cdp", url: CDP_FACILITATOR_URL, mode };
  }

  // auto — the pre-switch rule, preserved exactly.
  const network = env.X402_NETWORK ?? "base-sepolia";
  if (isMainnetNetwork(network) && hasCdpKeys) {
    return { kind: "cdp", url: CDP_FACILITATOR_URL, mode };
  }
  return { kind: "legacy", url: legacyUrl, mode };
}

// Resolve once at module load so a misconfiguration surfaces at boot rather
// than on the first paid call. Mirrors the EUR_USD_RATE fail-fast above: a
// config error that only appears mid-payment is far more expensive than one
// that stops the deploy.
// Cast: ProcessEnv is an index-signature type, so TS's weak-type check rejects
// it against FacilitatorEnv's all-optional shape. The value shapes match
// (string | undefined), and every field is read defensively above.
const FACILITATOR_SELECTION = resolveFacilitatorSelection(process.env as FacilitatorEnv);

/** The facilitator selection this process is running with. */
export function getFacilitatorSelection(): FacilitatorSelection {
  return FACILITATOR_SELECTION;
}

/**
 * The facilitator URL discovery surfaces must advertise.
 *
 * `/x402/catalog` and `/.well-known/x402.json` previously hardcoded
 * X402_FACILITATOR_URL, which would have advertised x402.org while payments
 * actually settled through CDP. Both now read this.
 */
export function getFacilitatorUrl(): string {
  return FACILITATOR_SELECTION.url;
}

// ─── Facilitator client (lazy init) ─────────────────────────────────────────

let _facilitator: HTTPFacilitatorClient | null = null;

function getFacilitator(): HTTPFacilitatorClient {
  if (_facilitator) return _facilitator;

  if (FACILITATOR_SELECTION.kind === "cdp") {
    // createFacilitatorConfig supplies the CDP base URL plus a JWT
    // createAuthHeaders hook; the keys are known present (validated above).
    const config = createFacilitatorConfig(
      process.env.CDP_API_KEY_ID,
      process.env.CDP_API_KEY_SECRET,
    );
    _facilitator = new HTTPFacilitatorClient(config);
  } else {
    _facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_SELECTION.url });
  }
  return _facilitator;
}

// ─── Price conversion ───────────────────────────────────────────────────────
//
// Single source of truth for x402 pricing: capabilities.price_cents (EUR) ×
// EUR_USD_RATE → USDC. Per DEC-20260308-1, EUR is the canonical platform
// currency; per DEC-20260502-A, x402 uses the same catalog price as the
// wallet path, converted at this single rate. See those decisions before
// reintroducing any per-channel discount.

/** Numeric USD value for a EUR-cent capability price (exact at 6 decimals). */
export function eurCentsToUsd(eurCents: number): number {
  return eurCentsToMicroUsd(eurCents) / 1_000_000;
}

/**
 * Convert EUR cents to USDC atomic units (6 decimals).
 * USDC is pegged to USD, so we convert EUR → USD → atomic. Identical integer
 * value to eurCentsToUsd × 1e6 by construction — advertised and settled
 * amounts cannot diverge.
 */
export function eurCentsToUsdcAtomic(eurCents: number): string {
  return eurCentsToMicroUsd(eurCents).toString();
}

export function eurCentsToUsdString(eurCents: number): string {
  // 6 decimals (micro-USD precision, matching the atomic amount exactly),
  // trailing zeros trimmed: 20c → "$0.216", 3c @1.085 → "$0.03255".
  const s = eurCentsToUsd(eurCents).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `$${s}`;
}

// ─── 402 Response builder ───────────────────────────────────────────────────

/**
 * Build an x402 Payment Required response for a capability.
 */
export function build402Response(capability: {
  slug: string;
  name: string;
  priceCents: number;
}): {
  status: 402;
  body: Record<string, unknown>;
} {
  const priceUsd = eurCentsToUsdString(capability.priceCents);

  return {
    status: 402,
    body: {
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: eurCentsToUsdcAtomic(capability.priceCents),
          resource: "/v1/do",
          description: `${capability.name}. Strale: the trust layer for AI agents.`,
          payTo: WALLET_ADDRESS,
          mimeType: "application/json",
          asset: USDC_ADDRESS,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
      error: `Payment required. ${capability.name} costs ${priceUsd} USDC per call.`,
    },
  };
}

// ─── Payment verification ───────────────────────────────────────────────────

export interface X402VerificationResult {
  valid: boolean;
  settlementId?: string;
  error?: string;
}

export interface X402PaymentRequirement {
  resource?: string;
  description?: string;
  outputSchema?: Record<string, unknown>;
}

/**
 * Verify AND settle an x402 payment header using the facilitator.
 *
 * This is the legacy one-shot flow — the on-chain transaction is broadcast
 * before the capability runs, so a validation/execution failure still charges
 * the caller. Kept for the /v1/do x402 path which hasn't yet been refactored.
 *
 * For new code (e.g. /x402/:slug), prefer `verifyX402PaymentOnly` +
 * `settleX402Payment` so the USDC is only moved after the capability produces
 * output (DEC-14: don't charge before execution succeeds).
 *
 * @param paymentHeader - Base64-encoded X-PAYMENT header from the request
 * @param priceCentsEur - EUR price of the capability (for fallback conversion)
 * @param priceUsdOverride - USD price the 402 response quoted to the client.
 *   MUST match what the client signed against. If provided, this wins over
 *   priceCentsEur. The x402 gateway-v2 passes this from cap.x402PriceUsd so the
 *   verification amount exactly matches what was in the 402 response's
 *   maxAmountRequired field.
 */
export async function verifyX402Payment(
  paymentHeader: string,
  priceCentsEur: number,
  priceUsdOverride?: number,
  requirementOverrides?: X402PaymentRequirement,
): Promise<X402VerificationResult> {
  const verifyOnly = await verifyX402PaymentOnly(
    paymentHeader, priceCentsEur, priceUsdOverride, requirementOverrides,
  );
  if (!verifyOnly.valid || !verifyOnly.verified) {
    return { valid: false, error: verifyOnly.error };
  }
  const settle = await settleX402Payment(verifyOnly.verified);
  return { valid: settle.valid, settlementId: settle.settlementId, error: settle.error };
}

/**
 * Opaque handle returned by a successful verify. Pass it to
 * `settleX402Payment` once execution has succeeded to move the USDC on-chain.
 * Not serializable across process boundaries — discard if unused (the
 * on-chain authorization expires via `maxTimeoutSeconds`).
 */
export interface X402VerifiedPayment {
  payload: unknown;
  requirements: unknown;
}

export interface X402VerifyOnlyResult {
  valid: boolean;
  /** Only present when `valid === true`. Hand to `settleX402Payment` to finalize. */
  verified?: X402VerifiedPayment;
  error?: string;
}

export interface X402SettlementResult {
  valid: boolean;
  settlementId?: string;
  error?: string;
}

/**
 * Verify an x402 payment header without broadcasting the transaction.
 *
 * Non-destructive — checks the signed authorization is valid and covers the
 * quoted price, but does NOT settle on-chain. Hand the returned `verified`
 * handle to `settleX402Payment` after execution succeeds.
 *
 * Rationale: matches DEC-14 ("don't charge before execution succeeds"). Input
 * validation errors and capability failures no longer charge the caller —
 * their signed authorization simply expires unused.
 */
export async function verifyX402PaymentOnly(
  paymentHeader: string,
  priceCentsEur: number,
  priceUsdOverride?: number,
  requirementOverrides?: X402PaymentRequirement,
): Promise<X402VerifyOnlyResult> {
  if (!isX402Configured()) {
    return { valid: false, error: "x402 not configured (no wallet address)" };
  }

  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const parsed = parsePaymentPayload(JSON.parse(decoded));
    if (!parsed.success) {
      return { valid: false, error: `Invalid payment payload: ${parsed.error.message}` };
    }
    const payload = parsed.data;

    const priceAtomic =
      priceUsdOverride !== undefined
        // round, not ceil: the override is an exact micro-USD multiple from
        // eurCentsToUsd; ceil turned float round-trip error into +1 atomic.
        ? Math.round(priceUsdOverride * 1_000_000).toString()
        : eurCentsToUsdcAtomic(priceCentsEur);
    const requirements: Record<string, unknown> = {
      scheme: "exact",
      network: NETWORK,
      maxAmountRequired: priceAtomic,
      resource: requirementOverrides?.resource ?? "/v1/do",
      description: requirementOverrides?.description ?? "Strale capability call",
      mimeType: "application/json",
      payTo: WALLET_ADDRESS,
      maxTimeoutSeconds: 300,
      asset: USDC_ADDRESS,
      extra: { name: "USD Coin", version: "2" },
    };
    if (requirementOverrides?.outputSchema) {
      requirements.outputSchema = requirementOverrides.outputSchema;
    }

    const facilitator = getFacilitator();
    const verifyResult = await facilitator.verify(payload as any, requirements as any);
    if (!verifyResult.isValid) {
      return { valid: false, error: verifyResult.invalidReason ?? "Payment invalid" };
    }

    return { valid: true, verified: { payload, requirements } };
  } catch (err) {
    logError("x402-verification-failed", err);
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Payment verification failed",
    };
  }
}

/**
 * Broadcast the settlement for a previously verified payment.
 *
 * Call only after the capability has successfully produced output. Errors here
 * are rare (verify already passed) but the facilitator can still reject if the
 * authorization has meanwhile been used or expired.
 */
export async function settleX402Payment(
  verified: X402VerifiedPayment,
): Promise<X402SettlementResult> {
  try {
    const facilitator = getFacilitator();
    const settleResult = await facilitator.settle(
      verified.payload as any,
      verified.requirements as any,
    );
    if (!settleResult.success) {
      return { valid: false, error: settleResult.errorReason ?? "Settlement failed" };
    }
    return { valid: true, settlementId: settleResult.transaction ?? "settled" };
  } catch (err) {
    logError("x402-settlement-failed", err);
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Settlement failed",
    };
  }
}

/**
 * Extract the payer address (USDC `From`) from a verified payment.
 * For the "exact" scheme this is payload.authorization.from — the wallet that
 * signed the TransferWithAuthorization. Returns null if the shape doesn't match.
 */
export function extractPayerAddress(verified: X402VerifiedPayment): string | null {
  const outer = verified?.payload as Record<string, unknown> | undefined;
  const inner = outer?.payload as Record<string, unknown> | undefined;
  const auth = inner?.authorization as Record<string, unknown> | undefined;
  const from = auth?.from;
  return typeof from === "string" && from.startsWith("0x") ? from : null;
}

/**
 * Extract the x402 payment header from a request.
 * Checks both X-PAYMENT (standard) and Payment (legacy) headers.
 */
export function extractPaymentHeader(headers: Headers): string | null {
  return headers.get("x-payment") ?? headers.get("payment") ?? null;
}

/**
 * Encode an x402 settlement response for the X-PAYMENT-RESPONSE header.
 * Clients inspect this to learn the on-chain tx hash of a settled payment,
 * even on executions that subsequently returned 4xx.
 */
export function encodePaymentResponseHeader(settlementId: string): string {
  const payload = { success: true, transaction: settlementId, network: NETWORK };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
