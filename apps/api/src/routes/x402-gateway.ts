import { Hono } from "hono";
import { cors } from "hono/cors";
import { getExecutor } from "../capabilities/index.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";

// ─── x402 payment gateway ─────────────────────────────────────────────────────
// Exposes selected Strale capabilities as x402-compatible paid API endpoints.
// Ref: https://x402.org — Coinbase open payment protocol (HTTP 402 + USDC/Base)
//
// The route handler:
// 1. No X-Payment header → returns 402 with payment requirements
// 2. X-Payment header present + wallet configured → verifies via facilitator
// 3. X-Payment header present + no wallet → stub mode (accepts any payment)
// 4. After verified → executes capability and returns result

const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";
export const WALLET = process.env.X402_WALLET_ADDRESS;
export const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://facilitator.x402.org";
export const NETWORK = (process.env.X402_NETWORK ?? "eip155:8453") as `${string}:${string}`;
export const BASE_URL_EXPORT = BASE_URL;

// USDC contract on Base mainnet (6 decimals)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

interface EndpointConfig {
  slug: string;
  description: string;
  priceUsd: string;
  maxAmountRequired: string; // USDC atomic units (6 decimals)
  mapInput: (query: Record<string, string>) => Record<string, unknown>;
}

export const ENDPOINTS: Record<string, EndpointConfig> = {
  "iban-validate": {
    slug: "iban-validate",
    description: "Validate IBAN numbers — structure check, checksum, bank code extraction. 75+ countries.",
    priceUsd: "$0.02",
    maxAmountRequired: "20000",
    mapInput: (q) => ({ iban: q.iban ?? "" }),
  },
  "vat-format-validate": {
    slug: "vat-format-validate",
    description: "Validate EU VAT number format against country-specific rules. 30+ countries.",
    priceUsd: "$0.02",
    maxAmountRequired: "20000",
    mapInput: (q) => ({ vat_number: q.vat_number ?? "" }),
  },
  "paid-api-preflight": {
    slug: "paid-api-preflight",
    description: "Pre-flight trust check for paid API endpoints — detects x402/L402/MPP protocol, validates headers.",
    priceUsd: "$0.03",
    maxAmountRequired: "30000",
    mapInput: (q) => ({ url: q.url ?? "" }),
  },
  "ssl-check": {
    slug: "ssl-check",
    description: "Check SSL/TLS certificate validity, expiry, chain, and configuration for any domain.",
    priceUsd: "$0.05",
    maxAmountRequired: "50000",
    mapInput: (q) => ({ domain: q.domain ?? "" }),
  },
  "sanctions-check": {
    slug: "sanctions-check",
    description: "Screen names against global sanctions lists (OFAC, EU, UN). Powered by OpenSanctions.",
    priceUsd: "$0.10",
    maxAmountRequired: "100000",
    mapInput: (q) => ({ name: q.name ?? "", ...(q.country ? { country: q.country } : {}) }),
  },
};

// Build the x402 PAYMENT-REQUIRED header payload
function buildPaymentRequired(path: string, config: EndpointConfig): string {
  const resource = `${BASE_URL}/x402${path}`;
  const payload = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: config.maxAmountRequired,
        resource,
        description: config.description,
        mimeType: "application/json",
        payTo: WALLET ?? "0x0000000000000000000000000000000000000001",
        maxTimeoutSeconds: 300,
        asset: USDC_BASE,
      },
    ],
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

// Verify payment via the Coinbase CDP facilitator
async function verifyPayment(paymentHeader: string, config: EndpointConfig): Promise<{ valid: boolean; error?: string }> {
  if (!WALLET) {
    // Stub mode — accept any payment header
    return { valid: true };
  }

  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: paymentHeader,
        paymentRequirements: {
          scheme: "exact",
          network: NETWORK,
          maxAmountRequired: config.maxAmountRequired,
          resource: `${BASE_URL}/x402/${config.slug}`,
          payTo: WALLET,
          asset: USDC_BASE,
          maxTimeoutSeconds: 300,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { valid: false, error: `Facilitator returned ${response.status}: ${text.slice(0, 200)}` };
    }

    const result = await response.json() as { isValid?: boolean; valid?: boolean };
    return { valid: result.isValid ?? result.valid ?? false };
  } catch (err) {
    return { valid: false, error: `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export const x402Route = new Hono();

// Permissive CORS for x402 clients
x402Route.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Payment", "X-Payment-Response"],
    exposeHeaders: ["Payment-Required", "X-Payment-Response"],
  }),
);

// Register one handler per capability
for (const [path, config] of Object.entries(ENDPOINTS)) {
  x402Route.get(`/${path}`, async (c) => {
    const paymentHeader = c.req.header("x-payment");

    if (!paymentHeader) {
      // Return 402 with both v1 header (base64) and v2 body (paymentRequirements)
      const resource = `${BASE_URL}/x402/${path}`;
      const requirement = {
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: config.maxAmountRequired,
        resource,
        description: config.description,
        mimeType: "application/json",
        payTo: WALLET ?? "0x0000000000000000000000000000000000000001",
        maxTimeoutSeconds: 300,
        asset: USDC_BASE,
      };
      // v1: base64 header
      const v1Payload = Buffer.from(JSON.stringify({ x402Version: 1, accepts: [requirement] })).toString("base64");
      c.header("Payment-Required", v1Payload);
      // v2: JSON body with paymentRequirements array
      return c.json(
        {
          x402Version: 1,
          paymentRequirements: [requirement],
          // Simplified fields for human/agent readability
          error: "Payment required",
          accepts: [{ network: NETWORK, asset: "USDC", amount: config.priceUsd }],
        },
        402,
      );
    }

    // Verify payment via facilitator
    const verification = await verifyPayment(paymentHeader, config);
    if (!verification.valid) {
      return c.json(
        {
          error: "Payment verification failed",
          detail: verification.error ?? "The payment could not be verified by the facilitator.",
        },
        402,
      );
    }

    // Payment verified — execute the capability
    const query = c.req.query() as Record<string, string>;
    const executor = getExecutor(config.slug);

    if (!executor) {
      return c.json({ error: "Capability unavailable" }, 503);
    }

    try {
      const input = config.mapInput(query);
      const result = await executor(input);
      return c.json(result.output);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      return c.json({ error: sanitizeFailureReason(message) }, 400);
    }
  });
}
