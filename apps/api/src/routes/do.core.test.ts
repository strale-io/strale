/**
 * Route-level regression tests for POST /v1/do — the core execution
 * endpoint (Phase 1 / T1.2 of the Codebase Quality Program).
 *
 * Scope: the authenticated, paid-capability sync path (executeSync).
 * do.spend-cap.test.ts already covers the in-tx spend-cap re-check at
 * the unit level (spendCapWouldExceed) — this file does not duplicate
 * that; every fixture user here has maxSpendPerHourCents: null so the
 * spend-cap branch is skipped entirely.
 *
 * Harness: mounts `doRoute` directly on a bare Hono app (not the full
 * app.ts). Only one response in the paths under test is actually a
 * try/catch product — the execution_failed branch, built from the
 * executor's thrown error. The rest (no_matching_capability,
 * insufficient_balance, spend_cap_exceeded, dry_run, the idempotency
 * replay) are ordinary route branches / early returns built the same
 * way regardless of which app the route is mounted on, so app.ts's
 * top-level onError is not load-bearing for what these tests assert;
 * mounting doRoute directly (instead of the whole app.ts route graph)
 * keeps the mock surface to what do.ts itself imports.
 *
 * DB mock fidelity:
 *   - Outer db.select() is a FIFO row queue (each test pushes exactly
 *     the rows each SELECT in the request path will consume, in call
 *     order) that also RECORDS, per call, the `table` passed to
 *     `.from()` and the real Drizzle condition object passed to
 *     `.where()` — `eq`/`and`/`isNull` are the real drizzle-orm
 *     functions, never mocked. `whereReferences()` below walks the
 *     condition's `queryChunks` (the shape do.spend-cap.test.ts's
 *     `findDateChunks` already walks) to answer structurally "does this
 *     where-clause reference table.column [= value | IS NULL]?" — so a
 *     mutation that drops a scoping predicate (e.g. the idempotency
 *     lookup losing its user-id scope, which would replay a DIFFERENT
 *     user's transaction) is caught instead of silently passing through
 *     a mock that answers every query with the same fixture regardless
 *     of what was asked.
 *   - db.transaction() invokes a hand-built mock tx object whose
 *     `select().from().where()` is deliberately NOT awaitable on its
 *     own — it exposes only `.for(mode)`, which is the only shape the
 *     exercised code path (the wallet-lock read) actually calls. This
 *     means a code change that drops `.for("update")` (the DEC-8
 *     double-spend lock) breaks at await-time (destructuring a
 *     non-iterable) rather than silently succeeding against a mock that
 *     is thenable either way. The table passed to `.from()` and the real
 *     Drizzle condition passed to `.where()` are ALSO recorded (on
 *     `tx.__selectCalls`, alongside the `.for()` mode) — not just the
 *     lock mode — so the happy-path and DEC-14 tests can assert the
 *     locked select actually targeted `wallets` with a where-clause
 *     scoped to the authenticated user's id, the same fidelity the outer
 *     db mock has. Recording only the mode (an earlier version of this
 *     file did) left a gap: mutating do.ts's wallet-lock condition from
 *     `eq(wallets.userId, user.id)` to `eq(wallets.id, user.id)` still
 *     returned the canned wallet row and every lock-path test passed.
 *   - db.insert() records every insert (table + values) for assertion
 *     (used for the failed_requests no_match logging path).
 *
 * Module boundaries mocked: ../lib/matching.js (matchCapability),
 * ../capabilities/index.js (getExecutor) — fully controlled per test.
 * ../capabilities/guarded-executor.js — assertGuardedAllow forced to
 * allow (real error classes kept via importOriginal so `instanceof`
 * checks in do.ts still work if ever exercised). ../lib/circuit-
 * breaker.js, quality-capture.js, event-triggers.js, piggyback-
 * monitor.js, quality-aggregation.js, x402-gateway.js, progressive-
 * unlock.js, milestones.js, activation-hook.js — all no-op stubs.
 * These are fire-and-forget telemetry/side-channel concerns in the
 * paths under test; real implementations touch DB tables (capability_
 * health, cost budgets, etc.) this harness does not model.
 *
 * Left real (pure, no DB, no env-gated throw beyond what test-env-
 * setup.ts already satisfies): lib/rate-limit.ts (in-memory; each test
 * uses a fresh random user id so rateLimitByKey's 10 req/sec bucket
 * never collides across tests), lib/middleware.ts (optionalAuth
 * Middleware — exercised for real against the mocked `users` row,
 * scoped-query-checked the same as everything else), lib/attribution.ts,
 * lib/audit-token.ts, lib/audit-helpers.ts, lib/sanitize.ts, lib/
 * provenance-builder.ts, lib/processing-location.ts, lib/trust-grade.ts,
 * lib/errors.ts.
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
import { users, wallets, transactions, walletTransactions, failedRequests } from "../db/schema.js";

// ─── Hoisted mutable mock state (referenced from vi.mock factories) ───────────

const mocks = vi.hoisted(() => ({
  outerSelectQueue: [] as unknown[][],
  recordedSelects: [] as Array<{ table: unknown; cond: unknown }>,
  outerInserts: [] as Array<{ table: unknown; vals: unknown }>,
  dbTransactionCalls: 0,
  // Set per-test before the request; consumed by db.transaction(cb).
  txRef: { current: null as unknown },
}));

vi.mock("../db/index.js", () => {
  function chainableFromQueue(table: unknown, cond: unknown) {
    mocks.recordedSelects.push({ table, cond });
    const rows = (mocks.outerSelectQueue.shift() as unknown[]) ?? [];
    const p = Promise.resolve(rows) as any;
    p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
    return p;
  }
  return {
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => ({ where: (cond: unknown) => chainableFromQueue(table, cond) }),
      }),
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

// ─── Drizzle condition introspection ───────────────────────────────────────
// Same technique as wallet.test.ts (kept file-local rather than shared, to
// match the house style of self-contained test files).

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
 * carry a direct reference to it, so the check is by identity.
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

/**
 * Builds the tx object handed to db.transaction(cb) inside executeSync.
 *
 * The wallet-lock select is deliberately shaped so `.where()` alone is
 * NOT awaitable — only `.for(mode)` resolves to rows. Production code
 * always calls `.for("update")` immediately after `.where()`; if that
 * call were ever dropped, `await tx.select()...where(...)` would await a
 * plain `{ for }` object (a no-op — non-Promise objects pass through
 * `await` unchanged) and the subsequent `const [wallet] = ...`
 * destructure would throw (plain objects aren't iterable), surfacing as
 * a 500 in the tests below. The `table`/`cond`/`mode` triple is recorded
 * on `__selectCalls` at the point `.for()` fires, so the happy-path/
 * DEC-14 tests can assert both that `.for("update")` fired exactly once
 * AND that the locked select actually targeted `wallets` with a
 * where-clause scoped to `wallets.userId = <the authenticated user>` —
 * independent of the crash-based signal above, which only catches a
 * *dropped* lock, not a *mistargeted* one.
 */
function buildMockTx(opts: { walletRow: Record<string, unknown> | null; transactionId: string }) {
  const insertCalls: Array<{ table: unknown; vals: unknown }> = [];
  const updateCalls: Array<{ table: unknown; vals: unknown }> = [];
  // MAJOR (residual): previously only `.for(mode)` was recorded — the
  // table passed to `.from()` and the condition passed to `.where()` were
  // both discarded, so a mutation on do.ts ~1668 that swapped
  // eq(wallets.userId, user.id) for eq(wallets.id, user.id) still handed
  // back the canned wallet row and every lock-path test passed. Recorded
  // exactly like the outer db mock now: table + cond + mode, all captured
  // at the point `.for()` actually fires (the only call shape the
  // exercised code path uses — see the file-header note on the FOR-UPDATE
  // gating this select provides).
  const selectCalls: Array<{ table: unknown; cond: unknown; mode: string }> = [];
  return {
    __insertCalls: insertCalls,
    __updateCalls: updateCalls,
    __selectCalls: selectCalls,
    execute: vi.fn(async () => []),
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((cond: unknown) => ({
          for: vi.fn((mode: string) => {
            selectCalls.push({ table, cond, mode });
            return Promise.resolve(opts.walletRow ? [opts.walletRow] : []);
          }),
        })),
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
          // WP2: the wallet debit is now a conditional UPDATE ... RETURNING,
          // so the result has to be awaitable AND expose .returning(). An
          // empty returning() would read as "the balance predicate did not
          // hold", which the service treats as insufficient funds — so the
          // mock hands back one row.
          //
          // The row echoes the seeded balance rather than simulating the
          // arithmetic: this test asserts the SQL shape, the lock, and the
          // ledger pairing. What the balance actually settles to is asserted
          // against a real database in the wallet-service and concurrency
          // integration suites.
          // Settle the arithmetic the database would do, by reading the
          // bound amount out of the SQL delta. The route returns this value
          // as wallet_balance_cents, so echoing the pre-debit balance would
          // make the response assertion vacuous.
          const before = (opts.walletRow?.balanceCents as number) ?? 0;
          const chunks = (vals as any)?.balanceCents?.queryChunks ?? [];
          const amount = chunks.find((c: unknown) => typeof c === "number");
          const settled: any = Promise.resolve([]);
          settled.returning = vi.fn(async () => [
            { balanceCents: typeof amount === "number" ? before - amount : before },
          ]);
          return settled;
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
      visible: true,
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
import { isX402Configured, build402Response } from "../lib/x402-gateway.js";
import { resetFreeTierCache } from "../lib/free-tier.js";
import { getExecutor } from "../capabilities/index.js";

const mockMatchCapability = matchCapability as unknown as ReturnType<typeof vi.fn>;
const mockGetExecutor = getExecutor as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.outerSelectQueue = [];
  mocks.recordedSelects = [];
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

    // MAJOR 2/3: the auth lookup itself is scoped by key_prefix — not
    // "the mock answers with whichever user row it's holding".
    const authSelect = mocks.recordedSelects[0];
    expect(authSelect.table).toBe(users);
    expect(whereReferences(authSelect.cond, users, "key_prefix", { eq: getKeyPrefix(TEST_API_KEY) })).toBe(true);

    const tx = mocks.txRef.current as ReturnType<typeof buildMockTx>;
    // MAJOR 4 (DEC-8), residual fix: the wallet row was read under FOR
    // UPDATE, exactly once, AND the lock targeted the `wallets` table
    // scoped to THIS user's id — not just "some FOR UPDATE call happened".
    expect(tx.__selectCalls).toHaveLength(1);
    expect(tx.__selectCalls[0].mode).toBe("update");
    expect(tx.__selectCalls[0].table).toBe(wallets);
    expect(whereReferences(tx.__selectCalls[0].cond, wallets, "user_id", { eq: user.id })).toBe(true);
    // Wallet debited by exactly the capability price.
    //
    // WP2 changed the shape here deliberately: the debit is now an in-database
    // delta (`balance_cents + -5`) rather than an absolute value computed in
    // JavaScript. A read-modify-write is only correct while holding the row
    // lock, and the one site that did it without a lock — the solutions refund
    // — is exactly where the money bug was. So the assertion checks the delta
    // rather than a precomputed total; the resulting balance is asserted
    // against a real database in do.wallet-concurrency.integration.test.ts.
    const walletUpdate = tx.__updateCalls.find((c) => c.table === wallets);
    expect(walletUpdate).toBeTruthy();
    const balanceExpr = (walletUpdate!.vals as any).balanceCents;
    // A SQL expression, not a precomputed number — that is the point of the
    // change. queryChunks is drizzle's parameter list for the template.
    expect(Array.isArray(balanceExpr?.queryChunks)).toBe(true);
    // Bound values appear in queryChunks as raw primitives, and the operator
    // as a string chunk. Assert both: the amount alone would not distinguish a
    // debit from a credit.
    const params = balanceExpr.queryChunks.filter(
      (chunk: unknown) => typeof chunk === "number",
    );
    expect(params).toContain(CAPABILITY_FIXTURE.priceCents);
    const operators = balanceExpr.queryChunks
      .filter((chunk: any) => Array.isArray(chunk?.value))
      .map((chunk: any) => chunk.value.join(""))
      .join("");
    expect(operators).toContain("-");
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
    // MINOR 6: the insert actually targets failed_requests, not just "some
    // insert with the right-looking values".
    expect(mocks.outerInserts[0].table).toBe(failedRequests);
    expect((mocks.outerInserts[0].vals as any).failureType).toBe("no_match");
    expect((mocks.outerInserts[0].vals as any).userId).toBe(user.id);

    expect(mocks.dbTransactionCalls).toBe(0);
  });
});

describe("POST /v1/do — insufficient balance", () => {
  it("returns 402 insufficient_balance without ever invoking the executor, creating a transaction record, or debiting", async () => {
    const user = buildUserRow();
    mocks.outerSelectQueue.push([user]);
    mockMatchCapability.mockResolvedValue({ capability: CAPABILITY_FIXTURE }); // price 5 cents
    // MAJOR 5: capture the spy so we can assert it. Codex's scenario: the
    // executor running before the balance check gives away a free external
    // call even though the customer gets a 402.
    const executorSpy = vi.fn(async () => ({ output: {}, provenance: { source: "x", fetched_at: "now" } }));
    mockGetExecutor.mockReturnValue(executorSpy);

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

    expect(executorSpy).not.toHaveBeenCalled();

    const tx = mocks.txRef.current as ReturnType<typeof buildMockTx>;
    // The lock is still taken to read the balance, and targets THIS
    // user's wallet row — not just "a FOR UPDATE call happened".
    expect(tx.__selectCalls).toHaveLength(1);
    expect(tx.__selectCalls[0].mode).toBe("update");
    expect(tx.__selectCalls[0].table).toBe(wallets);
    expect(whereReferences(tx.__selectCalls[0].cond, wallets, "user_id", { eq: user.id })).toBe(true);
    expect(tx.__insertCalls.length).toBe(0); // no transaction row created
    expect(tx.__updateCalls.length).toBe(0); // no debit
  });
});

describe("POST /v1/do — idempotency replay", () => {
  it("returns the stored result for a repeated Idempotency-Key without re-executing or re-matching, scoped to the requesting user", async () => {
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

    // MAJOR 2/3: the idempotency lookup's where-clause must scope by BOTH
    // the idempotency key AND the requesting user's id, AND exclude
    // soft-deleted rows. Codex's scenario: a lookup that drops the
    // user-id scope would replay a DIFFERENT user's transaction for
    // anyone who guesses/reuses their Idempotency-Key value.
    const idempotencySelect = mocks.recordedSelects[1];
    expect(idempotencySelect.table).toBe(transactions);
    expect(whereReferences(idempotencySelect.cond, transactions, "idempotency_key", { eq: "replay-key-1" })).toBe(true);
    expect(whereReferences(idempotencySelect.cond, transactions, "user_id", { eq: user.id })).toBe(true);
    expect(whereReferences(idempotencySelect.cond, transactions, "deleted_at", "is_null")).toBe(true);
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

    const balanceSelect = mocks.recordedSelects[1];
    expect(balanceSelect.table).toBe(wallets);
    expect(whereReferences(balanceSelect.cond, wallets, "user_id", { eq: user.id })).toBe(true);
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

    // DEC-8: the wallet was still read under FOR UPDATE before anything
    // else happened, scoped to THIS user's wallet row.
    const tx = mocks.txRef.current as ReturnType<typeof buildMockTx>;
    expect(tx.__selectCalls).toHaveLength(1);
    expect(tx.__selectCalls[0].mode).toBe("update");
    expect(tx.__selectCalls[0].table).toBe(wallets);
    expect(whereReferences(tx.__selectCalls[0].cond, wallets, "user_id", { eq: user.id })).toBe(true);

    // DEC-14: lock → execute → deduct on success. Execution failed, so no
    // debit and no wallet_transactions ledger entry.
    const walletUpdate = tx.__updateCalls.find((c) => c.table === wallets);
    expect(walletUpdate).toBeUndefined();
    const walletTxInsert = tx.__insertCalls.find((c) => c.table === walletTransactions);
    expect(walletTxInsert).toBeUndefined();
    // The transaction row is still marked failed for the audit trail.
    const txnUpdate = tx.__updateCalls.find((c) => c.table === transactions);
    expect((txnUpdate!.vals as any).status).toBe("failed");
  });
});

// ─── Anonymous caller, paid capability, no slug named ────────────────────────
//
// The gap these close: `/v1/do`'s early auth gate is entered only when the
// request NAMES a capability slug. `task` is the documented way in, so an
// anonymous caller who described what they wanted matched a paid capability
// and then fell through every anonymous branch into executeSync with `user`
// undefined — where the wallet read threw and app.ts answered HTTP 500.
//
// Both tests below fail against the un-fixed route (500, and the executor is
// reached) and pass against it. The 402 case is the one that matters
// commercially: x402 IS configured in production, so an arriving agent should
// be quoted a price, not handed an error.

describe("POST /v1/do — anonymous, task-based, paid capability", () => {
  it("quotes a price over x402 instead of 500-ing, and never reaches the executor or the wallet", async () => {
    resetFreeTierCache();
    const payable = {
      ...CAPABILITY_FIXTURE,
      x402Enabled: true,
      marketplaceEligible: true,
    };
    mockMatchCapability.mockResolvedValue({ capability: payable });
    const executorSpy = vi.fn(async () => ({ output: {}, provenance: { source: "x", fetched_at: "now" } }));
    mockGetExecutor.mockReturnValue(executorSpy);

    vi.mocked(isX402Configured).mockReturnValue(true);
    vi.mocked(build402Response).mockReturnValue({
      body: { x402Version: 1, error: "Payment required. Test Capability costs $0.005 USDC per call." },
    } as any);

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      // No Authorization header. This is the arriving-agent shape.
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "do the paid thing", inputs: { value: "x" }, max_price_cents: 100 }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.x402Version).toBe(1);
    // The quote is for the capability that actually matched, at its price —
    // not a generic 402 that tells the caller nothing.
    expect(vi.mocked(build402Response)).toHaveBeenCalledWith({
      slug: payable.slug,
      name: payable.name,
      priceCents: payable.priceCents,
    });

    expect(executorSpy).not.toHaveBeenCalled();
    expect(mocks.dbTransactionCalls).toBe(0);
  });

  it("falls back to a 401 that names the free capabilities when the x402 rail is not configured", async () => {
    resetFreeTierCache();
    mockMatchCapability.mockResolvedValue({ capability: CAPABILITY_FIXTURE });
    const executorSpy = vi.fn(async () => ({ output: {}, provenance: { source: "x", fetched_at: "now" } }));
    mockGetExecutor.mockReturnValue(executorSpy);

    vi.mocked(isX402Configured).mockReturnValue(false);
    // The free-tier advertisement is read from the database through
    // isServableCapability — never from a literal here, which is the defect
    // lib/free-tier.ts exists to prevent.
    mocks.outerSelectQueue.push([
      { slug: "dns-lookup", priceCents: 0, description: "d", isActive: true, visible: true, lifecycleState: "active" },
      { slug: "email-validate", priceCents: 0, description: "e", isActive: true, visible: true, lifecycleState: "active" },
    ]);

    const app = makeApp();
    const res = await app.request("/v1/do", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "do the paid thing", inputs: { value: "x" }, max_price_cents: 100 }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe("unauthorized");
    expect(body.free_capabilities).toEqual(["dns-lookup", "email-validate"]);
    expect(body.hint).toContain("2 capabilities are free");
    expect(body.self_signup.url).toBe("https://api.strale.io/v1/signup");

    expect(executorSpy).not.toHaveBeenCalled();
    expect(mocks.dbTransactionCalls).toBe(0);
  });
});
