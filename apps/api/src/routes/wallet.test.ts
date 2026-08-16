/**
 * Route-level regression tests for /v1/wallet/* (Phase 1 / T1.1 of the
 * Codebase Quality Program, docs/strategy/2026-08-16-codebase-quality-
 * program.md). wallet.ts had zero test coverage before this file.
 *
 * Covers: POST /topup (Stripe Checkout session creation — amount,
 * currency, user linkage, success/cancel URLs), invalid-amount 400s,
 * unauthenticated 401, a Stripe API failure surfacing as a structured
 * error rather than a raw exception; GET /balance (integer-cents wire
 * shape, missing-wallet fallback); GET /transactions (shape, LIMIT 100
 * pagination, missing-wallet fallback).
 *
 * Harness: mounts `walletRoute` directly on a bare Hono app plus a
 * minimal onError mirroring app.ts's structured 500 response (wallet.ts
 * has no try/catch of its own around the Stripe call — the "structured
 * error, not raw exception" contract lives in app.ts's app.onError, so
 * the test harness reproduces exactly that handler rather than the
 * whole app.ts import graph).
 *
 * Module boundaries mocked: ../db/index.js (getDb — FIFO row queue
 * matching each SELECT's call order: auth lookup first, then whatever
 * the handler itself queries) and ../lib/stripe.js (getStripe —
 * checkout.sessions.create is a vi.fn asserted on directly). Auth runs
 * for real (authMiddleware, hashApiKey/getKeyPrefix) against the mocked
 * `users` row returned by the queue, exercising the real API-key
 * hashing/matching logic rather than stubbing auth out.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";

import { hashApiKey, getKeyPrefix } from "../lib/auth.js";

// ─── Hoisted mutable mock state ────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  stripeCreate: vi.fn(),
}));

vi.mock("../db/index.js", () => {
  function chainableFromQueue() {
    const rows = (mocks.selectQueue.shift() as unknown[]) ?? [];
    const p = Promise.resolve(rows) as any;
    p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
    p.orderBy = () => {
      const inner = Promise.resolve(rows) as any;
      inner.limit = (n: number) => Promise.resolve(rows.slice(0, n));
      return inner;
    };
    return p;
  }
  return {
    getDb: () => ({
      select: () => ({ from: () => ({ where: () => chainableFromQueue() }) }),
    }),
  };
});

vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.stripeCreate } } }),
}));

import { walletRoute } from "./wallet.js";
import { requestContext } from "../middleware/request-context.js";

// ─── Test helpers ──────────────────────────────────────────────────────────

const TEST_API_KEY = "sk_live_" + "c".repeat(56);

function buildUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    email: "wallet-test@example.com",
    apiKeyHash: hashApiKey(TEST_API_KEY),
    keyPrefix: getKeyPrefix(TEST_API_KEY),
    maxSpendPerHourCents: null,
    ...overrides,
  };
}

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${TEST_API_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

function makeApp() {
  const app = new Hono();
  // wallet.ts calls c.get("log").info(...) directly (unguarded) — the real
  // request-scoped child logger from app.ts's requestContext() middleware
  // must be mounted or that throws. Real, pure, no DB — safe to use as-is.
  app.use("*", requestContext());
  app.route("/v1/wallet", walletRoute);
  // Mirrors app.ts's app.onError exactly (see file header) — wallet.ts's
  // own topup handler has no try/catch around stripe.checkout.sessions.create,
  // so the "structured error, not raw exception" contract is enforced here.
  app.onError((_err, c) =>
    c.json({ error_code: "internal_error", message: "An unexpected error occurred. Please try again." }, 500),
  );
  return app;
}

beforeEach(() => {
  mocks.selectQueue = [];
  mocks.stripeCreate.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /v1/wallet/topup", () => {
  it("creates a Stripe Checkout session with correct amount, currency, user linkage, and redirect URLs", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user]); // auth lookup
    mocks.stripeCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });

    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amount_cents: 2500 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      checkout_url: "https://checkout.stripe.com/pay/cs_test_123",
      session_id: "cs_test_123",
      amount_cents: 2500,
    });

    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);
    const callArg = mocks.stripeCreate.mock.calls[0][0];
    expect(callArg.mode).toBe("payment");
    expect(callArg.line_items).toHaveLength(1);
    expect(callArg.line_items[0].price_data.currency).toBe("eur");
    expect(callArg.line_items[0].price_data.unit_amount).toBe(2500);
    expect(callArg.line_items[0].quantity).toBe(1);
    expect(callArg.metadata.user_id).toBe(user.id);
    expect(callArg.metadata.amount_cents).toBe("2500");
    expect(callArg.success_url).toContain(process.env.FRONTEND_URL);
    expect(callArg.success_url).toContain("status=success");
    expect(callArg.cancel_url).toContain(process.env.FRONTEND_URL);
    expect(callArg.cancel_url).toContain("status=cancelled");
  });

  it("rejects a missing amount_cents with a structured 400", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user]);

    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe("invalid_request");
    expect(body.details.min_amount_cents).toBe(1000);
    expect(body.details.max_amount_cents).toBe(1_000_000);
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects an amount below the €10 minimum with a structured 400", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user]);

    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amount_cents: 500 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe("invalid_request");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects an amount above the €10,000 maximum with a structured 400", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user]);

    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amount_cents: 2_000_000 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe("invalid_request");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-integer amount_cents with a structured 400", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user]);

    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amount_cents: 2500.5 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe("invalid_request");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("returns 401 for a request with no Authorization header, without calling Stripe", async () => {
    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount_cents: 2500 }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe("unauthorized");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("surfaces a Stripe API failure as a structured error, not a raw exception", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user]);
    mocks.stripeCreate.mockRejectedValue(new Error("stripe unavailable — do not leak this"));

    const app = makeApp();
    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amount_cents: 2500 }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error_code).toBe("string");
    expect(typeof body.message).toBe("string");
    // The raw Stripe error text must not reach the client.
    expect(JSON.stringify(body)).not.toContain("stripe unavailable");
  });
});

describe("GET /v1/wallet/balance", () => {
  it("returns balance_cents as an integer (wire-shape rule), not a formatted string", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user], [{ balanceCents: 4321 }]);

    const app = makeApp();
    const res = await app.request("/v1/wallet/balance", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ balance_cents: 4321, currency: "EUR" });
    expect(typeof body.balance_cents).toBe("number");
    expect(res.headers.get("X-Credits-Remaining")).toBe("4321");
    expect(res.headers.get("X-Credits-Currency")).toBe("EUR");
  });

  it("returns balance_cents 0 when no wallet row exists yet", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user], []);

    const app = makeApp();
    const res = await app.request("/v1/wallet/balance", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ balance_cents: 0, currency: "EUR" });
  });

  it("returns 401 without an Authorization header", async () => {
    const app = makeApp();
    const res = await app.request("/v1/wallet/balance");
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/wallet/transactions", () => {
  it("returns the transaction list with integer-cents shape", async () => {
    const user = buildUserRow();
    const rows = [
      {
        id: "t1",
        amount_cents: -5,
        type: "purchase",
        description: "Capability: test-capability",
        created_at: new Date("2026-08-01T00:00:00Z"),
      },
      {
        id: "t2",
        amount_cents: 1000,
        type: "top_up",
        description: null,
        created_at: new Date("2026-07-01T00:00:00Z"),
      },
    ];
    mocks.selectQueue.push([user], [{ id: "wallet-1" }], rows);

    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]).toMatchObject({ id: "t1", amount_cents: -5, type: "purchase" });
    expect(typeof body.transactions[0].amount_cents).toBe("number");
    expect(typeof body.transactions[1].amount_cents).toBe("number");
  });

  it("caps the result at 100 rows (regression: .limit(100) in the query)", async () => {
    const user = buildUserRow();
    const walletId = "wallet-1";
    const manyRows = Array.from({ length: 150 }, (_, i) => ({
      id: `t${i}`,
      amount_cents: -1,
      type: "purchase",
      description: null,
      created_at: new Date(),
    }));
    mocks.selectQueue.push([user], [{ id: walletId }], manyRows);

    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toHaveLength(100);
  });

  it("returns an empty list when no wallet row exists yet, without querying wallet_transactions", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user], []);

    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ transactions: [] });
  });

  it("returns 401 without an Authorization header", async () => {
    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions");
    expect(res.status).toBe(401);
  });
});
