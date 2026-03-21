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

import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

// ─── Configuration ──────────────────────────────────────────────────────────

const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS ?? "";
const NETWORK = process.env.X402_NETWORK ?? "eip155:84532"; // Default: Base Sepolia
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
const EUR_USD_RATE = parseFloat(process.env.EUR_USD_RATE ?? "1.08");

// USDC contract addresses
const USDC_CONTRACTS: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // Base mainnet
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Base Sepolia
};

const USDC_ADDRESS = USDC_CONTRACTS[NETWORK] ?? USDC_CONTRACTS["eip155:84532"];

/** Whether x402 is configured (wallet address set). */
export function isX402Configured(): boolean {
  return WALLET_ADDRESS.length > 0;
}

// ─── Resource server (lazy init) ────────────────────────────────────────────

let _resourceServer: InstanceType<typeof x402ResourceServer> | null = null;

function getResourceServer(): InstanceType<typeof x402ResourceServer> {
  if (!_resourceServer) {
    const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
    _resourceServer = new x402ResourceServer(facilitator)
      .register(NETWORK as `${string}:${string}`, new ExactEvmScheme());
  }
  return _resourceServer;
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
    const resourceServer = getResourceServer();
    const priceAtomic = eurCentsToUsdcAtomic(priceCentsEur);

    // The resource server's settle method verifies the payment with the facilitator
    // and returns settlement details
    const result = await (resourceServer as any).settle(paymentHeader, {
      payTo: WALLET_ADDRESS,
      maxAmountRequired: priceAtomic,
      asset: USDC_ADDRESS,
      network: NETWORK,
      scheme: "exact",
      resource: "/v1/do",
      maxTimeoutSeconds: 300,
      extra: { name: "USDC", version: "2" },
    });

    return {
      valid: true,
      settlementId: result?.txHash ?? result?.transactionHash ?? "settled",
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
