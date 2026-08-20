/**
 * WP0 §3 (CR-12) — /webhooks body cap, and the 413-as-500 bug it exposed.
 *
 * The Stripe webhook handler buffers the whole request body via
 * `c.req.text()` before the signature check can reject it, and /webhooks sat
 * outside the /v1, /a2a and /mcp bodyLimit scopes, so an unauthenticated
 * caller could push an arbitrarily large body straight into memory.
 *
 * Two discriminating properties:
 *   1. Oversized bodies to /webhooks are rejected. Pre-fix there was no cap on
 *      this path at all, so the request reached the handler.
 *   2. The rejection surfaces as 413, not 500. `app.onError` previously
 *      rewrote every thrown error — including Hono's HTTPException — into
 *      `500 internal_error`, so even the pre-existing /v1 cap mislabelled
 *      oversized payloads as server faults. Verified by probe before the fix:
 *      413 → 500; after: 413.
 *
 * The small-body case guards the regression that would actually cost money:
 * bodyLimit must BOUND the stream without consuming it, or raw-body signature
 * verification breaks and every real top-up silently fails.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
        innerJoin: () => ({
          where: () => ({ orderBy: () => Promise.resolve([]) }),
        }),
      }),
    }),
  }),
}));

// app.ts imports the MCP route at module load; vitest cannot resolve the
// workspace package without a prior build (same stub as health-deep.test.ts).
vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

beforeAll(() => {
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test_placeholder";
  // Required so the handler proceeds past getStripe() to the body read —
  // without it the route throws before bodyLimit's stream check can matter.
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_placeholder";
});

async function loadApp() {
  const { app } = await import("./../app.js");
  return app;
}

const OVERSIZED = "x".repeat(1024 * 1024); // 1 MB, over the 512 KB cap

function webhookRequest(body: string, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=deadbeef",
      ...extraHeaders,
    },
    body,
  });
}

describe("POST /webhooks/stripe body cap", () => {
  it("rejects an oversized body with 413 when Content-Length is declared", async () => {
    const app = await loadApp();
    const res = await app.request(
      webhookRequest(OVERSIZED, { "Content-Length": String(OVERSIZED.length) }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects an oversized body with 413 when Content-Length is absent", async () => {
    // Chunked/streamed senders declare no length; bodyLimit must still abort
    // while counting the stream rather than buffering the whole payload.
    const app = await loadApp();
    const res = await app.request(webhookRequest(OVERSIZED));
    expect(res.status).toBe(413);
  });

  it("still delivers a normal-sized raw body to signature verification", async () => {
    const app = await loadApp();
    const res = await app.request(
      webhookRequest(
        JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
      ),
    );
    // The forged signature must fail verification (400) — NOT 413, and not a
    // 500 from an empty or consumed body. Reaching the signature check proves
    // the raw body survived the bodyLimit middleware intact.
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid signature");
  });
});
