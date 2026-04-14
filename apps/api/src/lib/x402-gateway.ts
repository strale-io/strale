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

/**
 * Convert EUR cents to USDC atomic units (6 decimals).
 * USDC is pegged to USD, so we convert EUR → USD → atomic.
 */
export function eurCentsToUsdcAtomic(eurCents: number): string {
  const usd = (eurCents / 100) * EUR_USD_RATE;
  return Math.ceil(usd * 1_000_000).toString();
}

export function eurCentsToUsdString(eurCents: number): string {
  const usd = (eurCents / 100) * EUR_USD_RATE;
  return `$${usd.toFixed(4)}`;
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
          extra: { name: "USDC", version: "2" },
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

/**
 * Verify an x402 payment header using the facilitator.
 */
export async function verifyX402Payment(
  paymentHeader: string,
  priceCentsEur: number,
): Promise<X402VerificationResult> {
  if (!isX402Configured()) {
    return { valid: false, error: "x402 not configured (no wallet address)" };
  }

  try {
    // Decode the base64-encoded X-PAYMENT header into a PaymentPayload
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const parsed = parsePaymentPayload(JSON.parse(decoded));
    if (!parsed.success) {
      return { valid: false, error: `Invalid payment payload: ${parsed.error.message}` };
    }
    const payload = parsed.data;

    const priceAtomic = eurCentsToUsdcAtomic(priceCentsEur);
    const requirements = {
      scheme: "exact" as const,
      network: NETWORK,
      maxAmountRequired: priceAtomic,
      resource: "/v1/do",
      description: "Strale capability call",
      mimeType: "application/json",
      payTo: WALLET_ADDRESS,
      maxTimeoutSeconds: 300,
      asset: USDC_ADDRESS,
      extra: { name: "USDC", version: "2" },
    };

    const facilitator = getFacilitator();

    // Verify first (non-destructive check), then settle (broadcasts the tx)
    const verifyResult = await facilitator.verify(payload as any, requirements as any);
    if (!verifyResult.isValid) {
      return { valid: false, error: verifyResult.invalidReason ?? "Payment invalid" };
    }

    const settleResult = await facilitator.settle(payload as any, requirements as any);
    if (!settleResult.success) {
      return { valid: false, error: settleResult.errorReason ?? "Settlement failed" };
    }

    return {
      valid: true,
      settlementId: settleResult.transaction ?? "settled",
    };
  } catch (err) {
    console.error("[x402] Payment verification failed:", err instanceof Error ? err.message : err);
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Payment verification failed",
    };
  }
}

/**
 * Extract the x402 payment header from a request.
 * Checks both X-PAYMENT (standard) and Payment (legacy) headers.
 */
export function extractPaymentHeader(headers: Headers): string | null {
  return headers.get("x-payment") ?? headers.get("payment") ?? null;
}
