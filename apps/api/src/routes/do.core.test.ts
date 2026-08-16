/**
 * Route-level regression tests for POST /v1/do — the core execution
 * endpoint (Phase 1 / T1.2 of the Codebase Quality Program,
 * docs/strategy/2026-08-16-codebase-quality-program.md).
 *
 * Scope: the authenticated, paid-capability sync path (executeSync).
 * do.spend-cap.test.ts already covers the in-tx spend-cap re-check at
 * the unit level (spendCapWouldExceed) — this file does not duplicate
 * that; every fixture user here has maxSpendPerHourCents: null so the
 * spend-cap branch is skipped entirely.
 *
 * Harness: mounts `doRoute` directly on a bare Hono app (not the full
 * app.ts) — do.ts's own try/catch blocks build every structured error
 * response the tests below assert on (apiError(...)), so app.ts's
 * top-level onError is not in the path being tested. This also avoids
 * pulling in the rest of app.ts's route graph (mcp.js, admin routes,
 * etc.), keeping the mock surface to what do.ts itself imports.
 *
 * Module boundaries mocked (matching the "mock at module boundaries"
 * convention used by transactions.test.ts / internal-auth.test.ts):
 *   - ../db/index.js — getDb(). Outer db.select() is a FIFO queue (each
 *     test pushes exactly the rows each SELECT in the request path will
 *     consume, in call order); db.transaction() invokes a hand-built
 *     mock tx object; db.insert() records every insert for assertion
 *     (used for the failed_requests no_match logging path).
 *   - ../lib/matching.js (matchCapability) — fully controlled per test.
 *   - ../capabilities/index.js (getExecutor) — fully controlled per test.
 *   - ../capabilities/guarded-executor.js — assertGuardedAllow forced to
 *     allow (real error classes kept via importOriginal so `instanceof`
 *     checks in do.ts still work if ever exercised).
 *   - ../lib/circuit-breaker.js, quality-capture.js, event-triggers.js,
 *     piggyback-monitor.js, quality-aggregation.js, x402-gateway.js,
 *     progressive-unlock.js, milestones.js, activation-hook.js — all
 *     no-op stubs. These are fire-and-forget telemetry/side-channel
 *     concerns in the paths under test; real implementations touch DB
 *     tables (capability_health, cost budgets, etc.) this harness does
 *     not model.
 *
 * Left real (pure, no DB, no env-gated throw beyond what
 * test-env-setup.ts already satisfies): lib/rate-limit.ts (in-memory;
 * each test uses a fresh random user id so rateLimitByKey's 10 req/sec
 * bucket never collides across tests), lib/middleware.ts
 * (optionalAuthMiddleware — exercised for real against the mocked
 * `users` row), lib/attribution.ts, lib/audit-token.ts,
 * lib/audit-helpers.ts, lib/sanitize.ts, lib/provenance-builder.ts,
 * lib/processing-location.ts, lib/trust-grade.ts, lib/errors.ts.
 *
 * Uncovered paths (documented per the task's instruction not to fake
 * coverage): executeAsync / executeInBackground (async execution,
 * DEC-22 — avgLatencyMs > 10s), the x402 unauthenticated payment path,
 * free-tier (unauthenticated and authenticated-free-tier) execution,
 * the postgres 25P03/55P03 timeout-code catch branch, and the
 * low-balance/zero-balance conversion-email fire-and-forget branch.
 * Each depends on either a second DB-shaped mock surface (async
 * background-worker semantics) or triggers not exercised by the core
 * paths this task scoped in. Flagged for a follow-up pass rather than
 * asserted on with a mock that would tautologically pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";

import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { wallets, transactions, walletTransactions } from "../db/schema.js";

// ─── Hoisted mutable mock state (referenced from vi.mock factories) ───────────

const mocks = vi.hoisted(() => ({
  outerSelectQueue: [] as unknown[][],
  outerInserts: [] as Array<{ table: unknown; vals: unknown }>,
  dbTransactionCalls: 0,
  // Set per-test before the request; consumed by db.transaction(cb).
  txRef: { current: null as unknown },
}));

vi.mock("../db/index.js", () => {
  function chainableFromQueue() {
    const rows = (mocks.outerSelectQueue.shift() as unknown[]) ?? [];
    const p = Promise.resolve(rows) as Promise<unknown[]> & {
      limit?: (n: number) => Promise<unknown[]>;
    };
    (p as any).limit = (n: number) => Promise.resolve(rows.slice(0, n));
    return p;
  }
  return {
    getDb: () => ({
      select: () => ({ from: () => ({ where: () => chainableFromQueue() }) }),
      insert: (table: unknown) => ({
        values: (vals: unknown) => {
          mocks.outerInserts.push({ table, vals });
          return Promise.resolve([]);
        },
      }),
      execute: async () => [],
      transaction: async (cb: (tx: unknown) => unknown) => {
        mocks.dbTransactionCalls++;
        return cb(mocks.txRef.current);
      },
    }),
  };
});

vi.mock("../lib/matching.js", () => ({ matchCapability: vi.fn() }));

vi.mock("../capabilities/index.js", () => ({
  getExecutor: vi.fn(),
  registerCapability: vi.fn(),
  getDirectExecutor: vi.fn(),
  getRegisteredCount: vi.fn(() => 0),
}));

vi.mock("../capabilities/guarded-executor.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, assertGuardedAllow: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../lib/circuit-breaker.js", () => ({
  checkCircuitBreaker: vi.fn().mockResolvedValue({ allowed: true }),
  recordSuccess: vi.fn().mockResolvedValue(undefined),
  recordFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/quality-capture.js", () => ({ recordQuality: vi.fn() }));
vi.mock("../lib/event-triggers.js", () => ({ triggerOnFailure: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/piggyback-monitor.js", () => ({ recordPiggybackResult: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/quality-aggregation.js", () => ({
  getCapabilityQuality: vi.fn().mockResolvedValue({ p95ResponseTimeMs: null }),
}));
vi.mock("../lib/x402-gateway.js", () => ({
  isX402Configured: vi.fn(() => false),
  build402Response: vi.fn(),
  verifyX402PaymentOnly: vi.fn(),
  settleX402Payment: vi.fn(),
  extractPaymentHeader: vi.fn(() => null),
}));
vi.mock("../lib/progressive-unlock.js", () => ({
  recordUnlock: vi.fn(() => []),
  isUnlocked: vi.fn(() => false),
  getUnlockedSlugs: vi.fn(() => []),
}));
vi.mock("../lib/milestones.js", () => ({ checkMilestone: vi.fn() }));
vi.mock("../lib/activation-hook.js", () => ({ onFirstTransaction: vi.fn().mockResolvedValue(undefined) }));

// ─── Test helpers ──────────────────────────────────────────────────────────

const TEST_API_KEY = "sk_live_" + "b".repeat(56);

function buildUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    email: "do-core-test@example.com",
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

function chainablePromise(rows: unknown[]) {
  const p = Promise.resolve(rows) as any;
  p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  p.for = () => Promise.resolve(rows);
  p.orderBy = () => chainablePromise(rows);
  return p;
}

/** Builds the tx object handed to db.transaction(cb) inside executeSync. */
function buildMockTx(opts: { walletRow: Record<string, unknown> | null; transactionId: string }) {
  const insertCalls: Array<{ table: unknown; vals: unknown }> = [];
  const updateCalls: Array<{ table: unknown; vals: unknown }> = [];
  return {
    __insertCalls: insertCalls,
    __updateCalls: updateCalls,
    execute: vi.fn(async () => []),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => chainablePromise(opts.walletRow ? [opts.walletRow] : [])),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: unknown) => {
        insertCalls.push({ table, vals });
        const p = Promise.resolve([]) as any;
        p.returning = () => Promise.resolve([{ id: opts.transactionId }]);
        return p;
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((vals: unknown) => ({
        where: vi.fn(() => {
          updateCalls.push({ table, vals });
          return Promise.resolve([]);
        }),
      })),
    })),
  };
}

const CAPABILITY_FIXTURE = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "test-capability",
  name: "Test Capability",
  priceCents: 5,
  isActive: true,
  isFreeTier: false,
  lifecycleState: "active",
  capabilityType: "deterministic",
  transparencyTag: "algorithmic",
  dataSource: "Test Source",
  dataClassification: null,
  freshnessCategory: "live-fetch",
  dataUpdateCycleDays: null,
  datasetLastUpdated: null,
  processesPersonalData: false,
  personalDataCategories: [],
  avgLatencyMs: 200, // well under ASYNC_THRESHOLD_MS (10_000) — forces executeSync
  outputSchema: { type: "object", properties: {} },
  inputSchema: { type: "object", properties: { value: { type: "string" } }, required: [] },
};

async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0));
}

function makeApp() {
  const app = new Hono();
  app.route("/v1", doRoute);
  app.onError((_err, c) =>
    c.json({ error_code: "internal_error", message: "An unexpected error occurred. Please try again." }, 500),
  );
  return app;
}

// Imports after the mocks/helpers above so vi.mock hoisting applies cleanly.
import { doRoute } from "./do.js";
import { matchCapability } from "../lib/matching.js";
import { getExecutor } from "../capabilities/index.js";

const mockMatchCapability = matchCapability as unknown as ReturnType<typeof vi.fn>;
const mockGetExecutor = getExecutor as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.outerSelectQueue = [];
  mocks.outerInserts = [];
  mocks.dbTransactionCalls = 0;
  mocks.txRef.current = null;
  mockMatchCapability.mockReset();
  mockGetExecutor.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /v1/do — happy path (authenticated, paid capability, sync)", () => {
  it("debits the wallet, executes the capability, and returns {result:{output,...}} with wallet_balance_cents", async () => {
    const user = buildUserRow();
    const startingBalance = 10_000; // €100.00 — well above LOW_BALANCE_THRESHOLD after debit
    mocks.outerSelectQueue.push([user]); // optionalAuthMiddleware lookup

    const executorFn = vi.fn(async (input: Record<string, unknown>) => ({
      output: { echoed: input.value, ok: true },
      provenance: { source: "test-source", fetched_at: new Date().toISOString() },
    }));
    mockGetExecutor.mockReturnValue(executorFn);
    mockMatchCapability.mockResolvedValue({ capability: CAPABILITY_FIXTURE });

    const walletId = randomUUID();
    const txnId = randomUUID();
    mocks.txRef.current = buildMockTx({
      walletRow: { id: walletId, userId: user.id, balanceCents: startingBalance },
      transactionId: txnId,
    });

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        capability_slug: "test-capability",
        inputs: { value: "hello" },
        max_price_cents: 100,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.result).toBeDefined();
    expect(body.result.status).toBe("completed");
    expect(body.result.capability_used).toBe("test-capability");
    expect(body.result.price_cents).toBe(CAPABILITY_FIXTURE.priceCents);
    expect(body.result.wallet_balance_cents).toBe(startingBalance - CAPABILITY_FIXTURE.priceCents);
    expect(body.result.output).toEqual({ echoed: "hello", ok: true });
    expect(body.meta.audit).toBeTruthy();
    // Money is integer cents, not a formatted string (wire-shape rule).
    expect(typeof body.result.wallet_balance_cents).toBe("number");
    expect(typeof body.result.price_cents).toBe("number");

    expect(executorFn).toHaveBeenCalledTimes(1);
    expect(executorFn).toHaveBeenCalledWith({ value: "hello" });

    const tx = mocks.txRef.current as ReturnType<typeof buildMockTx>;
    // Wallet debited by exactly the capability price.
    const walletUpdate = tx.__updateCalls.find((c) => c.table === wallets);
    expect(walletUpdate).toBeTruthy();
    expect((walletUpdate!.vals as any).balanceCents).toBe(startingBalance - CAPABILITY_FIXTURE.priceCents);
    // Wallet transaction ledger entry logged.
    const walletTxInsert = tx.__insertCalls.find((c) => c.table === walletTransactions);
    expect(walletTxInsert).toBeTruthy();
    expect((walletTxInsert!.vals as any).amountCents).toBe(-CAPABILITY_FIXTURE.priceCents);
    // Transaction row marked completed.
    const txnUpdate = tx.__updateCalls.find((c) => c.table === transactions);
    expect((txnUpdate!.vals as any).status).toBe("completed");
  });
});

describe("POST /v1/do — no matching capability", () => {
  it("returns a structured no_matching_capability error and logs to failed_requests", async () => {
    const user = buildUserRow();
    mocks.outerSelectQueue.push([user]);
    mockMatchCapability.mockResolvedValue(null);

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        task: "do something nobody offers",
        max_price_cents: 100,
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error_code).toBe("no_matching_capability");
    expect(typeof body.message).toBe("string");
    expect(body.details).toMatchObject({ task: "do something nobody offers", max_price_cents: 100 });
    // Pin the documented failure shape: no top-level `error` key.
    expect(body.error).toBeUndefined();

    await flushMicrotasks();
    expect(mocks.outerInserts.length).toBe(1);
    expect((mocks.outerInserts[0].vals as any).failureType).toBe("no_match");
    expect((mocks.outerInserts[0].vals as any).userId).toBe(user.id);

    expect(mocks.dbTransactionCalls).toBe(0);
  });
});

describe("POST /v1/do — insufficient balance", () => {
  it("returns 402 insufficient_balance without creating a transaction record or debiting", async () => {
    const user = buildUserRow();
    mocks.outerSelectQueue.push([user]);
    mockMatchCapability.mockResolvedValue({ capability: CAPABILITY_FIXTURE }); // price 5 cents
    mockGetExecutor.mockReturnValue(vi.fn());

    mocks.txRef.current = buildMockTx({
      walletRow: { id: randomUUID(), userId: user.id, balanceCents: 2 }, // less than priceCents (5)
      transactionId: randomUUID(),
    });

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        capability_slug: "test-capability",
        inputs: { value: "x" },
        max_price_cents: 100,
      }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error_code).toBe("insufficient_balance");
    expect(body.details.wallet_balance_cents).toBe(2);
    expect(body.details.required_cents).toBe(CAPABILITY_FIXTURE.priceCents);
    expect(body.error).toBeUndefined();

    const tx = mocks.txRef.current as ReturnType<typeof buildMockTx>;
    expect(tx.__insertCalls.length).toBe(0); // no transaction row created
    expect(tx.__updateCalls.length).toBe(0); // no debit
  });
});

describe("POST /v1/do — idempotency replay", () => {
  it("returns the stored result for a repeated Idempotency-Key without re-executing or re-matching", async () => {
    const user = buildUserRow();
    const existingTxn = {
      id: randomUUID(),
      status: "completed",
      priceCents: CAPABILITY_FIXTURE.priceCents,
      latencyMs: 42,
      output: { echoed: "original", ok: true },
      provenance: { source: "test-source", fetched_at: "2026-08-01T00:00:00Z" },
      auditTrail: { transaction_id: "stored-audit" },
    };
    mocks.outerSelectQueue.push([user]); // auth
    mocks.outerSelectQueue.push([existingTxn]); // idempotency lookup
    mocks.outerSelectQueue.push([{ balanceCents: 9_995 }]); // balance for response

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "replay-key-1" }),
      body: JSON.stringify({
        capability_slug: "test-capability",
        inputs: { value: "hello-again" },
        max_price_cents: 100,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transaction_id).toBe(existingTxn.id);
    expect(body.status).toBe("completed");
    expect(body.price_cents).toBe(existingTxn.priceCents);
    expect(body.output).toEqual(existingTxn.output);
    expect(body.wallet_balance_cents).toBe(9_995);
    expect(body.meta.idempotency_replay).toBe(true);
    expect(body.meta.audit).toEqual(existingTxn.auditTrail);

    // No re-execution: matching/execution never ran, no new charge attempted.
    expect(mockMatchCapability).not.toHaveBeenCalled();
    expect(mockGetExecutor).not.toHaveBeenCalled();
    expect(mocks.dbTransactionCalls).toBe(0);
  });
});

describe("POST /v1/do — dry_run", () => {
  it("reports what would execute without charging or invoking the executor", async () => {
    const user = buildUserRow();
    mocks.outerSelectQueue.push([user]); // auth
    mockMatchCapability.mockResolvedValue({ capability: CAPABILITY_FIXTURE });
    const executorFn = vi.fn();
    mockGetExecutor.mockReturnValue(executorFn);
    mocks.outerSelectQueue.push([{ balanceCents: 10_000 }]); // dry-run balance fetch

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        capability_slug: "test-capability",
        inputs: { value: "x" },
        max_price_cents: 100,
        dry_run: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      dry_run: true,
      would_execute: "test-capability",
      price_cents: CAPABILITY_FIXTURE.priceCents,
      wallet_balance_cents: 10_000,
      wallet_sufficient: true,
    });

    expect(executorFn).not.toHaveBeenCalled();
    expect(mocks.dbTransactionCalls).toBe(0);
  });
});

describe("POST /v1/do — execution failure shape + DEC-14 ordering", () => {
  it("returns execution_failed with details.error (no top-level error key) and leaves the wallet untouched", async () => {
    const user = buildUserRow();
    mocks.outerSelectQueue.push([user]);
    mockMatchCapability.mockResolvedValue({ capability: CAPABILITY_FIXTURE });
    const executorFn = vi.fn(async () => {
      throw new Error("mock executor rejected the request");
    });
    mockGetExecutor.mockReturnValue(executorFn);

    const startingBalance = 10_000;
    mocks.txRef.current = buildMockTx({
      walletRow: { id: randomUUID(), userId: user.id, balanceCents: startingBalance },
      transactionId: randomUUID(),
    });

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        capability_slug: "test-capability",
        inputs: { value: "x" },
        max_price_cents: 100,
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();

    // Pin the exact documented shape (MEMORY.md: three false alarms on
    // 2026-08-14 traced to assuming a top-level `error` key on failure).
    expect(body.error_code).toBe("execution_failed");
    expect(typeof body.message).toBe("string");
    expect(body.error).toBeUndefined();
    expect(body.details.error).toBe("mock executor rejected the request");
    expect(body.details.wallet_balance_cents).toBe(startingBalance);

    // DEC-14: lock → execute → deduct on success. Execution failed, so no
    // debit and no wallet_transactions ledger entry.
    const tx = mocks.txRef.current as ReturnType<typeof buildMockTx>;
    const walletUpdate = tx.__updateCalls.find((c) => c.table === wallets);
    expect(walletUpdate).toBeUndefined();
    const walletTxInsert = tx.__insertCalls.find((c) => c.table === walletTransactions);
    expect(walletTxInsert).toBeUndefined();
    // The transaction row is still marked failed for the audit trail.
    const txnUpdate = tx.__updateCalls.find((c) => c.table === transactions);
    expect((txnUpdate!.vals as any).status).toBe("failed");
  });
});
