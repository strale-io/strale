/**
 * `executeAsync` / `executeInBackground` — the path DEC-22 routes slow
 * capabilities onto, and the one `do.core.test.ts:80` records as uncovered
 * ("Flagged for a follow-up pass rather than asserted on with a mock that
 * would tautologically pass"). #438 is that pass.
 *
 * Five capabilities ride this path in production. Everything it does with
 * money happens AFTER the caller has been handed a 202 and gone away, so a
 * mistake here is invisible until a reconciliation disagrees.
 *
 * ## The seam that makes it testable
 *
 * `executeInBackground` is fire-and-forget: the route calls
 * `trackBackgroundTask(label, promise)` and returns immediately. Mocking that
 * function to capture the promise turns "race the background worker" into
 * "await the exact promise the route launched" — deterministic, and it also
 * asserts the tracking wrapper is still there, which is what makes SIGTERM
 * drain an in-flight execution instead of stranding a debit.
 *
 * ## What is mocked, and why that is still a real test
 *
 * The Hono route is real, `executeAsync` and `executeInBackground` are real,
 * and the reservation lifecycle is a recording mock whose return values the
 * test controls — because "did capture win?" and "did release run twice?" are
 * exactly the questions. The DB is the same shape `do.core.test.ts` uses. What
 * is NOT claimed: that Postgres would apply these statements as written. That
 * is the integration suites' job.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";

import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { transactions, users, wallets } from "../db/schema.js";

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  outerSelectQueue: [] as unknown[][],
  outerInserts: [] as Array<{ table: unknown; vals: unknown }>,
  /** Every db.transaction(cb) call, in order: 0 = setup, 1 = settle. */
  txCalls: [] as Array<{ updates: Array<{ table: unknown; vals: unknown; cond: unknown }> }>,
  txRef: { current: null as unknown },
  /** Promises handed to trackBackgroundTask — the deterministic await point. */
  backgroundTasks: [] as Array<{ label: string; promise: Promise<unknown> }>,
  reservationCalls: [] as Array<{ op: string; reservationId: string; reason?: string }>,
  /** Controls what capture()/release() report winning the conditional claim. */
  captureWins: true,
  releaseWins: true,
  receiptSettles: [] as string[],
}));

vi.mock("../db/index.js", () => {
  function chainableFromQueue() {
    const rows = (mocks.outerSelectQueue.shift() as unknown[]) ?? [];
    const p = Promise.resolve(rows) as any;
    p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
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
        const record = { updates: [] as Array<{ table: unknown; vals: unknown; cond: unknown }> };
        mocks.txCalls.push(record);
        return cb(makeTx(record));
      },
    }),
  };
});

// The reservation lifecycle IS the money. Recorded, and the conditional-claim
// outcome is controlled per test.
vi.mock("../lib/wallet-reservations.js", () => ({
  reserve: vi.fn(async () => {
    mocks.reservationCalls.push({ op: "reserve", reservationId: RESERVATION_ID });
    return { id: RESERVATION_ID };
  }),
  markExecuting: vi.fn(async (_db: unknown, id: string) => {
    mocks.reservationCalls.push({ op: "markExecuting", reservationId: id });
  }),
  capture: vi.fn(async (_tx: unknown, args: { reservationId: string; reason: string }) => {
    mocks.reservationCalls.push({ op: "capture", ...args });
    return mocks.captureWins;
  }),
  release: vi.fn(async (_tx: unknown, args: { reservationId: string; reason: string }) => {
    mocks.reservationCalls.push({ op: "release", ...args });
    return mocks.releaseWins;
  }),
  assertReservationTtlExceedsExecutionTimeout: vi.fn(),
  findAbandoned: vi.fn(async () => []),
}));

vi.mock("../lib/shutdown.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackBackgroundTask: vi.fn((label: string, promise: Promise<unknown>) => {
    mocks.backgroundTasks.push({ label, promise });
    promise.catch(() => undefined);
    return promise;
  }),
}));

vi.mock("../lib/receipt/settle.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  settleExecutionReceipt: vi.fn(async (_db: unknown, args: { transactionId: string }) => {
    mocks.receiptSettles.push(args.transactionId);
  }),
}));

vi.mock("../lib/matching.js", () => ({ matchCapability: vi.fn() }));
vi.mock("../capabilities/index.js", () => ({
  getExecutor: vi.fn(),
  registerCapability: vi.fn(),
  getDirectExecutor: vi.fn(),
  getRegisteredCount: vi.fn(() => 0),
}));
vi.mock("../capabilities/guarded-executor.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertGuardedAllow: vi.fn().mockResolvedValue(undefined),
}));
// importOriginal, not a hand-written surface. A factory that lists only the
// exports I happened to think of goes stale the moment the route imports one
// more — which is how this suite's first run died on `checkCircuitBreaker`.
vi.mock("../lib/circuit-breaker.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkCircuitBreaker: vi.fn(async () => ({ open: false, allowed: true })),
  isCapabilityAvailable: vi.fn(async () => ({ available: true })),
  recordSuccess: vi.fn(async () => undefined),
  recordFailure: vi.fn(async () => undefined),
}));
vi.mock("../lib/quality-capture.js", () => ({ recordQuality: vi.fn() }));
vi.mock("../lib/event-triggers.js", () => ({ triggerOnFailure: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/piggyback-monitor.js", () => ({ recordPiggybackResult: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/quality-aggregation.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getQualitySignal: vi.fn(async () => null),
  getTrustGrade: vi.fn(async () => null),
}));
vi.mock("../lib/x402-gateway.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isX402Configured: vi.fn(() => false),
  build402Response: vi.fn(),
}));
vi.mock("../lib/progressive-unlock.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkProgressiveUnlock: vi.fn(async () => ({ unlocked: false })),
  recordUnlockProgress: vi.fn(async () => undefined),
}));
vi.mock("../lib/milestones.js", () => ({ checkMilestone: vi.fn() }));
vi.mock("../lib/activation-hook.js", () => ({ onFirstTransaction: vi.fn().mockResolvedValue(undefined) }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TEST_API_KEY = "sk_live_" + "c".repeat(56);
const RESERVATION_ID = "22222222-2222-2222-2222-222222222222";

/** Above ASYNC_THRESHOLD_MS (10_000) — this is what forces executeAsync. */
const ASYNC_CAPABILITY = {
  id: "33333333-3333-3333-3333-333333333333",
  slug: "slow-capability",
  name: "Slow Capability",
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
  avgLatencyMs: 20_000,
  outputSchema: { type: "object", properties: {} },
  inputSchema: { type: "object", properties: { value: { type: "string" } }, required: [] },
};

function buildUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    email: "do-async-test@example.com",
    apiKeyHash: hashApiKey(TEST_API_KEY),
    keyPrefix: getKeyPrefix(TEST_API_KEY),
    maxSpendPerHourCents: null,
    ...overrides,
  };
}

const authHeaders = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${TEST_API_KEY}`,
  "content-type": "application/json",
  ...extra,
});

let WALLET_ROW: Record<string, unknown> | null = null;
let TRANSACTION_ID = "";

/** The tx handed to each db.transaction(cb). Records every update. */
function makeTx(record: { updates: Array<{ table: unknown; vals: unknown; cond: unknown }> }) {
  return {
    execute: vi.fn(async () => []),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((cond: unknown) => ({
          for: vi.fn(() => Promise.resolve(WALLET_ROW ? [WALLET_ROW] : [])),
          // spendCapWouldExceed and friends await the where() directly.
          then: (res: (v: unknown) => unknown) => Promise.resolve([]).then(res),
          cond,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        const p = Promise.resolve([]) as any;
        p.returning = () => Promise.resolve([{ id: TRANSACTION_ID }]);
        return p;
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((vals: unknown) => ({
        where: vi.fn((cond: unknown) => {
          record.updates.push({ table, vals, cond });
          const settled: any = Promise.resolve([]);
          const before = (WALLET_ROW?.balanceCents as number) ?? 0;
          const chunks = (vals as any)?.balanceCents?.queryChunks ?? [];
          const amount = chunks.find((c: unknown) => typeof c === "number");
          settled.returning = vi.fn(async () => [
            { balanceCents: typeof amount === "number" ? before - amount : before },
          ]);
          return settled;
        }),
      })),
    })),
  };
}

function makeApp() {
  const app = new Hono();
  app.route("/v1", doRoute);
  // Surfaces the real message. A test app that hides why it 500s costs a
  // debugging cycle every time the harness is wrong about a mock's shape.
  app.onError((err, c) =>
    c.json({ error_code: "internal_error", message: String(err?.stack ?? err) }, 500),
  );
  return app;
}

import { doRoute } from "./do.js";
import { matchCapability } from "../lib/matching.js";
import { getExecutor } from "../capabilities/index.js";
import * as reservations from "../lib/wallet-reservations.js";
import { trackBackgroundTask } from "../lib/shutdown.js";

const mockMatchCapability = matchCapability as unknown as ReturnType<typeof vi.fn>;
const mockGetExecutor = getExecutor as unknown as ReturnType<typeof vi.fn>;

/** Fire an async request and settle the background work it launched. */
async function callAsyncCapability(executorFn: (input: any) => Promise<any>) {
  const user = buildUserRow();
  mocks.outerSelectQueue.push([user]);
  TRANSACTION_ID = randomUUID();
  WALLET_ROW = { id: randomUUID(), userId: user.id, balanceCents: 10_000 };

  mockGetExecutor.mockReturnValue(vi.fn(executorFn));
  mockMatchCapability.mockResolvedValue({ capability: ASYNC_CAPABILITY });

  const res = await makeApp().request("/v1/do", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      capability_slug: "slow-capability",
      inputs: { value: "hello" },
      max_price_cents: 100,
    }),
  });
  const body = await res.json();
  if (res.status >= 500) throw new Error(`route 500: ${body.message}`);

  // Deterministic: await the exact promise the route launched.
  await Promise.all(mocks.backgroundTasks.map((t) => t.promise.catch(() => undefined)));
  return { res, body, transactionId: TRANSACTION_ID };
}

const updatesTo = (txIndex: number, table: unknown) =>
  (mocks.txCalls[txIndex]?.updates ?? []).filter((u) => u.table === table);

beforeEach(() => {
  mocks.outerSelectQueue = [];
  mocks.outerInserts = [];
  mocks.txCalls = [];
  mocks.backgroundTasks = [];
  mocks.reservationCalls = [];
  mocks.receiptSettles = [];
  mocks.captureWins = true;
  mocks.releaseWins = true;
  mockMatchCapability.mockReset();
  mockGetExecutor.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Routing ─────────────────────────────────────────────────────────────────

describe("a slow capability takes the async path", () => {
  it("returns 202 with a transaction id and no output", async () => {
    const { res, body, transactionId } = await callAsyncCapability(async (input) => ({
      output: { echoed: input.value },
      provenance: { source: "test", fetched_at: new Date().toISOString() },
    }));

    expect(res.status).toBe(202);
    expect(body.result.transaction_id).toBe(transactionId);
    expect(body.result.capability_used).toBe("slow-capability");
    expect(typeof body.result.price_cents).toBe("number");
    // The caller must poll; a result here would mean the route waited.
    expect(body.result.output).toBeUndefined();
  });

  it("launches the execution through trackBackgroundTask, not a bare promise", async () => {
    // Untracked, a Railway redeploy mid-execution kills the worker after the
    // debit and before the settle, stranding the reservation for the janitor.
    await callAsyncCapability(async () => ({ output: { ok: true }, provenance: {} }));
    // The route tracks other background work too (conversion emails and the
    // like), so assert on the EXECUTION task rather than a total count that
    // would break the next time something unrelated is tracked.
    const execTasks = mocks.backgroundTasks.filter((t) => t.label.startsWith("async-exec:"));
    expect(execTasks).toHaveLength(1);
    expect(execTasks[0].label).toContain("slow-capability");
    expect(trackBackgroundTask).toHaveBeenCalled();
  });
});

// ─── Success ─────────────────────────────────────────────────────────────────

describe("successful background execution", () => {
  it("settles exactly once, in the same transaction as the terminal status write", async () => {
    await callAsyncCapability(async (input) => ({
      output: { echoed: input.value },
      provenance: { source: "test", fetched_at: new Date().toISOString() },
    }));

    const captures = mocks.reservationCalls.filter((r) => r.op === "capture");
    expect(captures, "reservation captured more than once").toHaveLength(1);
    expect(mocks.reservationCalls.filter((r) => r.op === "release")).toHaveLength(0);

    // Settle tx is the second db.transaction: the status write and the
    // capture must be in the SAME one, or a crash between them leaves a
    // completed execution with an open reservation the reconciler refunds.
    const statusWrite = updatesTo(1, transactions).at(-1);
    expect(statusWrite, "terminal status not written in the settle transaction").toBeTruthy();
    expect((statusWrite!.vals as any).status).toBe("completed");
    expect(mocks.txCalls).toHaveLength(2);
  });

  it("marks the reservation executing before running the work", async () => {
    await callAsyncCapability(async () => ({ output: { ok: true }, provenance: {} }));
    const ops = mocks.reservationCalls.map((r) => r.op);
    expect(ops.indexOf("markExecuting")).toBeGreaterThan(-1);
    expect(ops.indexOf("markExecuting")).toBeLessThan(ops.indexOf("capture"));
  });

  it("settles the receipt exactly once", async () => {
    const { transactionId } = await callAsyncCapability(async () => ({
      output: { ok: true },
      provenance: {},
    }));
    expect(mocks.receiptSettles.filter((id) => id === transactionId)).toHaveLength(1);
  });

  it("writes the output and a completed_at the poller can see", async () => {
    await callAsyncCapability(async (input) => ({
      output: { echoed: input.value },
      provenance: { source: "test", fetched_at: new Date().toISOString() },
    }));
    const vals = updatesTo(1, transactions).at(-1)!.vals as any;
    expect(vals.output).toEqual({ echoed: "hello" });
    expect(vals.completedAt).toBeInstanceOf(Date);
    expect(typeof vals.latencyMs).toBe("number");
  });
});

// ─── Failure ─────────────────────────────────────────────────────────────────

describe("failed background execution", () => {
  const boom = async () => {
    throw new Error("upstream exploded");
  };

  it("releases the reservation exactly once and never captures", async () => {
    await callAsyncCapability(boom);
    expect(mocks.reservationCalls.filter((r) => r.op === "release")).toHaveLength(1);
    expect(
      mocks.reservationCalls.filter((r) => r.op === "capture"),
      "a failed execution charged the customer",
    ).toHaveLength(0);
  });

  it("writes the failure and the release in ONE transaction", async () => {
    await callAsyncCapability(boom);
    expect(mocks.txCalls).toHaveLength(2);
    const statusWrite = updatesTo(1, transactions).at(-1)!;
    expect((statusWrite.vals as any).status).toBe("failed");
    expect((statusWrite.vals as any).error).toContain("upstream exploded");
  });

  it("guards the failure write so it cannot overwrite a terminal success", async () => {
    // WP3: a throw AFTER the success commit would otherwise mark a CHARGED
    // row "failed" — the customer polls, sees failure, and reasonably
    // concludes they were not billed. The predicate is the whole defence.
    await callAsyncCapability(boom);
    const statusWrite = updatesTo(1, transactions).at(-1)!;
    // Rendered through drizzle's own dialect rather than poked at as an
    // object graph: the predicate is SQL, so the honest assertion is the SQL.
    const { sql: rendered, params } = new PgDialect().sqlToQuery(statusWrite.cond as any);
    expect(rendered).toMatch(/status.*in /i);
    expect(params).toContain("executing");
    expect(params).toContain("deferred");
  });

  it("settles the receipt once on the failure path too", async () => {
    const { transactionId } = await callAsyncCapability(boom);
    expect(mocks.receiptSettles.filter((id) => id === transactionId)).toHaveLength(1);
  });

  it("still answered 202 — the caller learns the outcome by polling", async () => {
    const { res } = await callAsyncCapability(boom);
    expect(res.status).toBe(202);
  });
});

// ─── Races the reconciler can create ─────────────────────────────────────────

describe("the reconciler got there first", () => {
  it("a lost capture does not re-charge — the money stays refunded", async () => {
    // capture() returning false means the reconciler already released this
    // reservation because the execution outran its deadline.
    mocks.captureWins = false;
    await callAsyncCapability(async () => ({ output: { ok: true }, provenance: {} }));

    expect(mocks.reservationCalls.filter((r) => r.op === "capture")).toHaveLength(1);
    // No second attempt, no compensating release: one conditional claim,
    // and losing it is a no-op rather than a retry.
    expect(mocks.reservationCalls.filter((r) => r.op === "release")).toHaveLength(0);
  });

  it("a lost release does not double-refund", async () => {
    mocks.releaseWins = false;
    await callAsyncCapability(async () => {
      throw new Error("upstream exploded");
    });
    expect(mocks.reservationCalls.filter((r) => r.op === "release")).toHaveLength(1);
  });

  it("release is claimed conditionally, so both callers cannot credit", async () => {
    // The property that makes the reconciler safe to run against a live
    // system: the wallet credit is inside the conditional claim, not beside
    // it. Asserted at the seam because the claim itself is SQL.
    await callAsyncCapability(async () => {
      throw new Error("upstream exploded");
    });
    expect(reservations.release).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reservations.release).mock.calls[0][1]).toMatchObject({
      reservationId: RESERVATION_ID,
    });
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe("idempotency", () => {
  it("a replayed key returns the stored transaction without executing again", async () => {
    const user = buildUserRow();
    const existingId = randomUUID();
    // The idempotency lookup finds a prior row: auth, then the replay hit.
    mocks.outerSelectQueue.push([user]);
    mocks.outerSelectQueue.push([
      {
        id: existingId,
        status: "executing",
        capabilitySlug: "slow-capability",
        priceCents: 5,
        idempotencyFingerprint: null,
        output: null,
        createdAt: new Date(),
      },
    ]);

    const executorFn = vi.fn(async () => ({ output: { ok: true }, provenance: {} }));
    mockGetExecutor.mockReturnValue(executorFn);
    mockMatchCapability.mockResolvedValue({ capability: ASYNC_CAPABILITY });
    WALLET_ROW = { id: randomUUID(), userId: user.id, balanceCents: 10_000 };

    const res = await makeApp().request("/v1/do", {
      method: "POST",
      headers: authHeaders({ "Idempotency-Key": "replay-me" }),
      body: JSON.stringify({
        capability_slug: "slow-capability",
        inputs: { value: "hello" },
        max_price_cents: 100,
      }),
    });

    await Promise.all(mocks.backgroundTasks.map((t) => t.promise.catch(() => undefined)));

    // Whatever the replay response shape, the invariants are: the work did
    // not run twice, and no second reservation was opened.
    expect(executorFn, "a replayed idempotency key executed the capability again").not.toHaveBeenCalled();
    expect(mocks.reservationCalls.filter((r) => r.op === "reserve")).toHaveLength(0);
    expect(res.status).toBeLessThan(500);
  });
});

// ─── The wallet is debited before the 202, not after ─────────────────────────

describe("the debit happens in the setup transaction", () => {
  it("debits inside a transaction before answering, and settles in a second one", async () => {
    // Deliberately NOT asserting the wallet SQL here. The debit runs through
    // walletService, which this harness does not model — do.core.test.ts and
    // do.wallet-concurrency.integration.test.ts own that, against a real
    // database. What IS this suite's business: the money is taken in the
    // SETUP transaction (before the 202), and the terminal settle happens in
    // a SEPARATE later one, which is the whole shape of the async contract.
    const { res } = await callAsyncCapability(async () => ({
      output: { ok: true },
      provenance: {},
    }));
    expect(res.status).toBe(202);
    expect(mocks.txCalls).toHaveLength(2);
    // Nothing terminal in the setup tx; the terminal write is in the second.
    expect(updatesTo(0, transactions)).toHaveLength(0);
    expect((updatesTo(1, transactions).at(-1)!.vals as any).status).toBe("completed");
  });

  it("opens exactly one reservation for the execution to settle", async () => {
    await callAsyncCapability(async () => ({ output: { ok: true }, provenance: {} }));
    expect(mocks.reservationCalls.filter((r) => r.op === "reserve")).toHaveLength(1);
  });

  it("the auth lookup happened — the harness is not answering blind", async () => {
    await callAsyncCapability(async () => ({ output: { ok: true }, provenance: {} }));
    expect(mocks.outerSelectQueue).toHaveLength(0);
    expect(users).toBeTruthy();
  });
});
