import { Hono } from "hono";
import { cors } from "hono/cors";
import { getExecutor } from "../capabilities/index.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";

// ─── x402 payment gateway ─────────────────────────────────────────────────────
// Exposes selected Strale capabilities as x402-compatible paid API endpoints.
// Ref: https://x402.org — Coinbase open payment protocol (HTTP 402 + USDC/Base)
//
// Uses the official @x402/hono middleware with the Coinbase CDP facilitator
// for real on-chain USDC payment verification on Base.

const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";
const WALLET = process.env.X402_WALLET_ADDRESS;
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://facilitator.x402.org";
const NETWORK = (process.env.X402_NETWORK ?? "eip155:8453") as `${string}:${string}`;

interface EndpointConfig {
  slug: string;
  description: string;
  priceUsd: string;
  mapInput: (query: Record<string, string>) => Record<string, unknown>;
}

const ENDPOINTS: Record<string, EndpointConfig> = {
  "iban-validate": {
    slug: "iban-validate",
    description: "Validate IBAN numbers — structure check, checksum, bank code extraction. 75+ countries.",
    priceUsd: "$0.02",
    mapInput: (q) => ({ iban: q.iban ?? "" }),
  },
  "vat-format-validate": {
    slug: "vat-format-validate",
    description: "Validate EU VAT number format against country-specific rules. 30+ countries.",
    priceUsd: "$0.02",
    mapInput: (q) => ({ vat_number: q.vat_number ?? "" }),
  },
  "paid-api-preflight": {
    slug: "paid-api-preflight",
    description: "Pre-flight trust check for paid API endpoints — detects x402/L402/MPP protocol, validates headers.",
    priceUsd: "$0.03",
    mapInput: (q) => ({ url: q.url ?? "" }),
  },
  "ssl-check": {
    slug: "ssl-check",
    description: "Check SSL/TLS certificate validity, expiry, chain, and configuration for any domain.",
    priceUsd: "$0.05",
    mapInput: (q) => ({ domain: q.domain ?? "" }),
  },
  "sanctions-check": {
    slug: "sanctions-check",
    description: "Screen names against global sanctions lists (OFAC, EU, UN). Powered by OpenSanctions.",
    priceUsd: "$0.10",
    mapInput: (q) => ({ name: q.name ?? "", ...(q.country ? { country: q.country } : {}) }),
  },
};

export { ENDPOINTS, WALLET, FACILITATOR_URL, NETWORK, BASE_URL };

export const x402Route = new Hono();

// x402 endpoints get permissive CORS
x402Route.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Payment", "X-Payment-Response"],
    exposeHeaders: ["Payment-Required", "X-Payment-Response"],
  }),
);

// Route handlers — execute capability after payment verified by middleware in app.ts
for (const [path, config] of Object.entries(ENDPOINTS)) {
  x402Route.get(`/${path}`, async (c) => {
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
