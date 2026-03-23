import { Hono } from "hono";
import { cors } from "hono/cors";
import { getExecutor } from "../capabilities/index.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

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
  priceUsd: string; // e.g. "$0.05"
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

// ─── Apply @x402/hono payment middleware ──────────────────────────────────────

if (WALLET) {
  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(NETWORK, new ExactEvmScheme());

  // Build routes config from ENDPOINTS
  const routes: Record<string, any> = {};
  for (const [path, config] of Object.entries(ENDPOINTS)) {
    routes[`GET /${path}`] = {
      accepts: {
        scheme: "exact",
        price: config.priceUsd,
        network: NETWORK,
        payTo: WALLET,
      },
      description: config.description,
      resource: `${BASE_URL}/x402/${path}`,
    };
  }

  // Debug: log actual path seen by middleware
  x402Route.use("*", async (c, next) => {
    console.log(`[x402-debug] path=${c.req.path} method=${c.req.method} routePath=${c.req.routePath}`);
    await next();
  });
  x402Route.use("*", paymentMiddleware(routes, resourceServer, undefined, undefined, false));

  console.log(`[x402] Payment middleware active — wallet: ${WALLET.slice(0, 8)}...${WALLET.slice(-4)}, network: ${NETWORK}, facilitator: ${FACILITATOR_URL}`);
} else {
  console.warn("[x402] X402_WALLET_ADDRESS not configured — x402 routes use stub verification");
}

// ─── Route handlers (execute capability after payment verified) ───────────────

for (const [path, config] of Object.entries(ENDPOINTS)) {
  x402Route.get(`/${path}`, async (c) => {
    // If @x402 middleware is active, payment is already verified at this point.
    // If wallet isn't configured (stub mode), return stub 402 for dev/testing.
    if (!WALLET && !c.req.header("x-payment")) {
      return c.json(
        {
          error: "Payment required",
          message: "x402 payment gateway is in stub mode. Set X402_WALLET_ADDRESS to enable real payments.",
          x402: true,
          endpoint: `${BASE_URL}/x402/${path}`,
          price: config.priceUsd,
        },
        402,
      );
    }

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
