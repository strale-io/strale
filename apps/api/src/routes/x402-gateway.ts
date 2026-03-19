import { Hono } from "hono";
import { cors } from "hono/cors";
import { getExecutor } from "../capabilities/index.js";

// ─── x402 payment gateway ─────────────────────────────────────────────────────
// Exposes selected Strale capabilities as x402-compatible paid API endpoints.
// Ref: https://x402.org — Coinbase open payment protocol (HTTP 402 + USDC/Base)
//
// Phase 1: Returns valid 402 responses for directory listing (402index.io).
//   Payment verification deferred — any X-PAYMENT header grants access.
// Phase 2 (future): Add @x402/hono middleware with real facilitator + wallet.

// USDC contract on Base mainnet (6 decimals: 50000 = $0.05)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";
const WALLET = process.env.X402_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001";

interface EndpointConfig {
  slug: string;
  description: string;
  maxAmountRequired: string; // USDC atomic units (6 decimals)
  mapInput: (query: Record<string, string>) => Record<string, unknown>;
}

const ENDPOINTS: Record<string, EndpointConfig> = {
  "iban-validate": {
    slug: "iban-validate",
    description: "Validate IBAN numbers — structure check, checksum, bank code extraction. 75+ countries.",
    maxAmountRequired: "50000", // $0.05
    mapInput: (q) => ({ iban: q.iban ?? "" }),
  },
  "vat-format-validate": {
    slug: "vat-format-validate",
    description: "Validate EU VAT number format against country-specific rules. 30+ countries.",
    maxAmountRequired: "50000", // $0.05
    mapInput: (q) => ({ vat_number: q.vat_number ?? "" }),
  },
  "paid-api-preflight": {
    slug: "paid-api-preflight",
    description: "Pre-flight trust check for paid API endpoints — detects x402/L402/MPP protocol, validates headers.",
    maxAmountRequired: "20000", // $0.02
    mapInput: (q) => ({ url: q.url ?? "" }),
  },
  "ssl-check": {
    slug: "ssl-check",
    description: "Check SSL/TLS certificate validity, expiry, chain, and configuration for any domain.",
    maxAmountRequired: "50000", // $0.05
    mapInput: (q) => ({ domain: q.domain ?? "" }),
  },
  "sanctions-check": {
    slug: "sanctions-check",
    description: "Screen names against global sanctions lists (OFAC, EU, UN). Powered by OpenSanctions.",
    maxAmountRequired: "100000", // $0.10
    mapInput: (q) => ({ name: q.name ?? "", ...(q.country ? { country: q.country } : {}) }),
  },
};

// Build the x402 PAYMENT-REQUIRED header payload for an endpoint
function buildPaymentRequired(path: string, config: EndpointConfig): string {
  const resource = `${BASE_URL}/x402${path}`;
  const payload = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base-mainnet",
        maxAmountRequired: config.maxAmountRequired,
        resource,
        description: config.description,
        mimeType: "application/json",
        payTo: WALLET,
        maxTimeoutSeconds: 300,
        asset: USDC_BASE,
      },
    ],
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export const x402Route = new Hono();

// x402 endpoints get permissive CORS — agents and x402 clients call from any origin
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
    const hasPayment = !!c.req.header("x-payment");

    if (!hasPayment) {
      // Return 402 with PAYMENT-REQUIRED header — this is what 402 Index health-checks
      const paymentHeader = buildPaymentRequired(`/${path}`, config);
      c.header("Payment-Required", paymentHeader);
      c.header("Content-Type", "application/json");
      return c.json(
        {
          error: "Payment required",
          x402Version: 1,
          accepts: [
            {
              network: "base-mainnet",
              asset: "USDC",
              amount: `$${(parseInt(config.maxAmountRequired) / 1_000_000).toFixed(2)}`,
            },
          ],
        },
        402,
      );
    }

    // X-PAYMENT header present — execute the capability
    // Phase 1: skip verification (any header grants access)
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
      return c.json({ error: message }, 400);
    }
  });
}
