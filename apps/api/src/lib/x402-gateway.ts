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
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
const EUR_USD_RATE = parseFloat(process.env.EUR_USD_RATE ?? "1.08");

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

// ─── Facilitator client (lazy init) ─────────────────────────────────────────

// Base mainnet requires Coinbase's CDP facilitator (JWT-auth, paid).
// Base Sepolia (and other testnets) work with the free x402.org facilitator.
// Selection is network-based: any "base" network with CDP keys → CDP; else → X402_FACILITATOR_URL.
let _facilitator: HTTPFacilitatorClient | null = null;

function getFacilitator(): HTTPFacilitatorClient {
  if (_facilitator) return _facilitator;

  const cdpKeyId = process.env.CDP_API_KEY_ID;
  const cdpKeySecret = process.env.CDP_API_KEY_SECRET;
  const isMainnet = NETWORK === "base" || NETWORK === "eip155:8453";

  if (isMainnet && cdpKeyId && cdpKeySecret) {
    // Use CDP facilitator for Base mainnet
    const config = createFacilitatorConfig(cdpKeyId, cdpKeySecret);
    _facilitator = new HTTPFacilitatorClient(config);
  } else {
    // Testnet or missing CDP keys → free x402.org facilitator
    _facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
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

/** Numeric USD value for a EUR-cent capability price. */
export function eurCentsToUsd(eurCents: number): number {
  return (eurCents / 100) * EUR_USD_RATE;
}

/**
 * Convert EUR cents to USDC atomic units (6 decimals).
 * USDC is pegged to USD, so we convert EUR → USD → atomic.
 */
export function eurCentsToUsdcAtomic(eurCents: number): string {
  return Math.ceil(eurCentsToUsd(eurCents) * 1_000_000).toString();
}

export function eurCentsToUsdString(eurCents: number): string {
  return `$${eurCentsToUsd(eurCents).toFixed(4)}`;
}

// ─── 402 Response builder ───────────────────────────────────────────────────

/**
 * Build an x402 Payment Required response for a capability.
 */
export function build402Response(capability: {
  slug: string;
  name: string;
  priceCents: number;
  matrixSqs?: string | null;
}): {
  status: 402;
  body: Record<string, unknown>;
} {
  const sqs = capability.matrixSqs ? parseFloat(String(capability.matrixSqs)) : null;
  const sqsStr = sqs != null && sqs > 0 ? ` SQS: ${Math.round(sqs)}/100.` : "";
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
          description: `${capability.name}.${sqsStr} Strale: the trust layer for AI agents.`,
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
        ? Math.ceil(priceUsdOverride * 1_000_000).toString()
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
