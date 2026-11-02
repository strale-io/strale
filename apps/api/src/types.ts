import type { users } from "./db/schema.js";
import type { ClientMeta } from "./lib/attribution.js";
import type { buildFreeTierUsage } from "./lib/free-tier-allowance.js";
import type { X402VerifiedPayment } from "./lib/x402-gateway.js";
import type pino from "pino";

// Row type from Drizzle schema
export type User = typeof users.$inferSelect;

// Hono environment — available via c.get("user") after auth middleware
export type AppEnv = {
  Variables: {
    user: User;
    /** null for the unchanged primary key. */
    apiKeyId: string | null;
    apiVersion: string;
    /** Request-local values populated by /v1/do and the free-tier limiter. */
    clientMeta?: ClientMeta | null;
    requestContext?: {
      referer: string | null;
      origin: string | null;
      userAgent: string | null;
      ipHash: string | null;
      acceptLanguage: string | null;
      fingerprintHash: string | null;
      mcpClient: string | null;
    };
    x402_verified?: X402VerifiedPayment;
    x402_payment_hash?: string;
    x402_paid?: boolean;
    freeTierUsage?: ReturnType<typeof buildFreeTierUsage>;
    // F-0-014: request-scoped child logger with request_id + user_id.
    // Attached by the request-id middleware in app.ts. Always present.
    log: pino.Logger;
  };
};
