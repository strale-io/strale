/**
 * Route-level regression tests for /v1/wallet/* (Phase 1 / T1.1 of the
 * Codebase Quality Program). wallet.ts had zero test coverage before this
 * file.
 *
 * Covers: POST /topup (Stripe Checkout session creation — amount,
 * currency, user linkage, exact success/cancel URLs), invalid-amount
 * 400s, unauthenticated 401, a Stripe API failure surfacing through
 * app.ts's real onError handler as a structured error rather than a raw
 * exception; GET /balance (integer-cents wire shape, missing-wallet
 * fallback, query scoped to the authenticated user); GET /transactions
 * (shape, LIMIT-100 result-size cap, missing-wallet fallback that
 * verifiably skips the wallet_transactions query, query scoped to the
 * authenticated user).
 *
 * Harness: most tests mount `walletRoute` directly on a bare Hono app
 * (plus the real `requestContext()` middleware — wallet.ts calls
 * `c.get("log").info(...)` unguarded, so the request-scoped child logger
 * must exist). One test (the Stripe-failure structured-error case) loads
 * the real `app` from app.ts instead, per external review: wallet.ts has
 * no try/catch of its own around the Stripe call, so "structured error,
 * not raw exception" is a claim about app.ts's app.onError (app.ts:114),
 * not about wallet.ts — pinning it against a hand-copied onError would
 * silently stop catching a drift between the two. `./mcp.js` is mocked
 * for that one import because it pulls in the `strale-mcp/tools`
 * workspace package (same pattern as transactions.test.ts /
 * internal-auth.test.ts); nothing in this file exercises `/mcp`.
 *
 * DB mock fidelity: ../db/index.js's getDb() is a FIFO row queue keyed to
 * call order (auth lookup first, then whatever the handler itself
 * queries), but it also RECORDS, per select call, the `table` passed to
 * `.from()` and the real Drizzle condition object passed to `.where()`
 * (not a stub — `eq`/`and`/`isNull` are the real drizzle-orm functions).
 * `whereReferences()` below walks the condition's `queryChunks` (the same
 * shape do.spend-cap.test.ts's `findDateChunks` walks) to answer
 * structurally "does this where-clause reference table.column [= value |
 * IS NULL]?" — so a mutation that drops a scoping predicate (e.g. a
 * lookup that stops filtering by the authenticated user's id) is caught
 * by an assertion instead of silently passing through a mock that
 * ignores the condition entirely and answers every query with the same
 * canned fixture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";

import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { users, wallets, walletTransactions } from "../db/schema.js";

// ─── Hoisted mutable mock state ────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  recordedSelects: [] as Array<{ table: unknown; cond: unknown }>,
  stripeCreate: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => {
          mocks.recordedSelects.push({ table, cond });
          const rows = (mocks.selectQueue.shift() as unknown[]) ?? [];
          const p = Promise.resolve(rows) as any;
          p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
          p.orderBy = () => {
            const inner = Promise.resolve(rows) as any;
            inner.limit = (n: number) => Promise.resolve(rows.slice(0, n));
            return inner;
          };
          return p;
        },
      }),
    }),
  }),
}));

vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.stripeCreate } } }),
}));

// Only needed for the one test that loads the real app.ts (MAJOR 1 fix
// below) — app.ts imports mcp.js, which pulls in the strale-mcp/tools
// workspace package. Same stub as transactions.test.ts / internal-auth.
// test.ts. No test in this file exercises /mcp.
vi.mock("./mcp.js", () => {
  const { Hono: HonoCtor } = require("hono");
  return { mcpRoute: new HonoCtor() };
});

import { walletRoute } from "./wallet.js";
import { requestContext } from "../middleware/request-context.js";

// ─── Drizzle condition introspection ───────────────────────────────────────
// `eq`/`and`/`isNull` used by wallet.ts (and by any test data built here)
// are the real drizzle-orm functions — never mocked — so the `cond` object
// captured above is a genuine Drizzle SQL condition tree, not a string.

function sqlChunksOf(node: unknown): unknown[] | null {
  if (!node || typeof node !== "object") return null;
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
  return Array.isArray(chunks) ? chunks : null;
}

function isColumnChunk(c: unknown): c is { name: string; table: unknown } {
  return (
    !!c &&
    typeof c === "object" &&
    typeof (c as any).name === "string" &&
    "table" in (c as any) &&
    (c as any).table !== undefined
  );
}

function isParamChunk(c: unknown): c is { value: unknown } {
  return !!c && typeof c === "object" && (c as any).constructor?.name === "Param";
}

function isStringChunk(c: unknown): c is { value: string[] } {
  return !!c && typeof c === "object" && (c as any).constructor?.name === "StringChunk";
}

/**
 * True if the Drizzle condition tree `cond` contains `table.columnName = value`
 * (pass `{ eq: value }`) or `table.columnName IS NULL` (pass `"is_null"`).
 * `table` must be the actual imported schema table object — Column chunks
 * carry a direct reference to it, so the check is by identity, exactly how
 * Drizzle itself resolves columns.
 */
function whereReferences(cond: unknown, table: unknown, columnName: string, match: { eq: unknown } | "is_null"): boolean {
  const chunks = sqlChunksOf(cond);
  if (!chunks) return false;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (isColumnChunk(c) && c.table === table && c.name === columnName) {
      if (match === "is_null") {
        const next = chunks[i + 1];
        if (isStringChunk(next) && next.value.join("").toLowerCase().includes("is null")) return true;
      } else {
        // MEDIUM (residual): verify the chunk BETWEEN the column and the
        // param is actually the equality operator, not just that a column
        // ref and a matching param happen to be two slots apart. Without
        // this, eq(col, v) → ne(col, v) is invisible: ne() emits the exact
        // same [Column, StringChunk(" <> "), Param] shape at these indices,
        // just with " <> " instead of " = " — an eq→ne swap leaves the
        // column ref and the param VALUE both unchanged, only the operator
        // text differs.
        const opChunk = chunks[i + 1];
        const paramChunk = chunks[i + 2];
        const opText = isStringChunk(opChunk) ? opChunk.value.join("") : "";
        const isEqualityOperator = opText.includes("=") && !opText.includes("<>") && !opText.includes("!=");
        if (isEqualityOperator && isParamChunk(paramChunk) && paramChunk.value === match.eq) return true;
      }
    }
  }
  for (const c of chunks) {
    if (whereReferences(c, table, columnName, match)) return true;
  }
  return false;
}

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
  return app;
}

async function loadRealApp() {
  const { app } = await import("../app.js");
  return app;
}

beforeEach(() => {
  mocks.selectQueue = [];
  mocks.recordedSelects = [];
  mocks.stripeCreate.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /v1/wallet/topup", () => {
  it("creates a Stripe Checkout session with correct amount, currency, user linkage, and exact redirect URLs", async () => {
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
    // Pin the FULL URL (including the literal {CHECKOUT_SESSION_ID}
    // Stripe template token), not a substring — a substring match would
    // survive a mutation that mangles the query string around a matching
    // fragment.
    expect(callArg.success_url).toBe(
      `${process.env.FRONTEND_URL}/topup?status=success&session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(callArg.cancel_url).toBe(`${process.env.FRONTEND_URL}/topup?status=cancelled`);
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
});

describe("POST /v1/wallet/topup — via the real app.ts pipeline (MAJOR 1)", () => {
  it("a Stripe API failure surfaces via app.ts's real onError as a structured error, not a raw exception", async () => {
    const user = buildUserRow();
    mocks.stripeCreate.mockRejectedValue(new Error("stripe unavailable — do not leak this"));

    // Import the real app BEFORE queueing the auth row. Importing app.ts runs
    // module-load side effects — refreshUpstreamMapping() in
    // lib/upstream-health-gate.ts issues its own db.select() calls — which draw
    // from this same FIFO queue. Queueing first let those startup selects
    // consume the row intended for the auth lookup, so auth saw no user and
    // returned 401 instead of reaching the handler. Whether that race was lost
    // depended on module-import ordering, which any change to app.ts's import
    // graph can perturb. Draining first makes the test independent of it.
    const app = await loadRealApp();
    await new Promise((resolve) => setTimeout(resolve, 25));
    mocks.selectQueue.length = 0;
    mocks.selectQueue.push([user]);

    const res = await app.request("/v1/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amount_cents: 2500 }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    // Pins app.ts's actual app.onError contract (app.ts:114), not a
    // hand-copied stand-in — this is the production handler, reached via
    // the real app.ts route graph.
    expect(body.error_code).toBe("internal_error");
    expect(body.message).toBe("An unexpected error occurred. Please try again.");
    expect(JSON.stringify(body)).not.toContain("stripe unavailable");
  });
});

describe("GET /v1/wallet/balance", () => {
  it("returns balance_cents as an integer (wire-shape rule), scoped to the authenticated user", async () => {
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

    // MAJOR 2/3: the auth lookup itself is scoped by key_prefix, and the
    // balance lookup is a real Drizzle where-clause query against
    // `wallets`, scoped to THIS user's id — not just "some row from a
    // fixture the mock hands back regardless of the query".
    const authSelect = mocks.recordedSelects[0];
    expect(authSelect.table).toBe(users);
    expect(whereReferences(authSelect.cond, users, "key_prefix", { eq: getKeyPrefix(TEST_API_KEY) })).toBe(true);

    const balanceSelect = mocks.recordedSelects[1];
    expect(balanceSelect.table).toBe(wallets);
    expect(whereReferences(balanceSelect.cond, wallets, "user_id", { eq: user.id })).toBe(true);
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
  it("returns the transaction list with integer-cents shape, scoped to the authenticated user's wallet", async () => {
    const user = buildUserRow();
    const walletId = randomUUID();
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
    mocks.selectQueue.push([user], [{ id: walletId }], rows);

    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]).toMatchObject({ id: "t1", amount_cents: -5, type: "purchase" });
    expect(typeof body.transactions[0].amount_cents).toBe("number");
    expect(typeof body.transactions[1].amount_cents).toBe("number");

    // MAJOR 2/3: the wallet-id lookup is scoped to this user; the
    // transaction-list lookup is scoped to that specific wallet id —
    // not "any wallet_transactions row the mock happens to be holding".
    const walletLookup = mocks.recordedSelects[1];
    expect(walletLookup.table).toBe(wallets);
    expect(whereReferences(walletLookup.cond, wallets, "user_id", { eq: user.id })).toBe(true);

    const txListLookup = mocks.recordedSelects[2];
    expect(txListLookup.table).toBe(walletTransactions);
    expect(whereReferences(txListLookup.cond, walletTransactions, "wallet_id", { eq: walletId })).toBe(true);
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

  it("returns an empty list when no wallet row exists yet, and does not issue a second query for wallet_transactions", async () => {
    const user = buildUserRow();
    mocks.selectQueue.push([user], []);

    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ transactions: [] });

    // Exactly 2 selects: the auth lookup and the wallet-id lookup. If the
    // handler still queried wallet_transactions after finding no wallet,
    // a 3rd entry would show up here.
    expect(mocks.recordedSelects).toHaveLength(2);
    expect(mocks.recordedSelects.some((s) => s.table === walletTransactions)).toBe(false);
  });

  it("returns 401 without an Authorization header", async () => {
    const app = makeApp();
    const res = await app.request("/v1/wallet/transactions");
    expect(res.status).toBe(401);
  });
});
