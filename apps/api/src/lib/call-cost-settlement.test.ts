/** Structural reachability supplements the behavioral persistence/bind tests. */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const route = (name: string) => readFileSync(new URL(`../routes/${name}.ts`, import.meta.url), "utf8");
it("API-key sync cost write is reached only after the wallet transaction commits", () => {
  const source = readFileSync(new URL("./do/dispatch.ts", import.meta.url), "utf8");
  const committed = source.indexOf("// The wallet transaction has committed.");
  expect(committed).toBeGreaterThan(0);
  expect(source.slice(committed)).toMatch(/await settleReceiptFor\(\(result/);
  expect(source.slice(source.indexOf("async function settleReceiptFor"), source.indexOf("// Build usage summary"))).toContain("persistCallCost(transactionId)");
});
it("x402 writes cost only after its transaction INSERT returns", () => {
  const source = route("x402-gateway-v2");
  const insert = source.indexOf("const [row] = args.claimId");
  const cost = source.indexOf("persistCallCost(insertedId)");
  expect(insert).toBeGreaterThan(0); expect(cost).toBeGreaterThan(insert);
  expect(source.slice(insert, cost)).toContain(".returning({ id: transactions.id })");
  expect(source.slice(insert, cost)).toContain("});");
});
it("solution cost persistence follows the phase-2 capture transaction, without await", () => {
  const source = route("solution-execute");
  const phase = source.slice(source.indexOf("// ── 7. Update transaction row"));
  expect(phase).toMatch(/await reservations.capture[\s\S]+?\}\);[\s\S]+?catch[\s\S]+?persistCallCost\(transactionId\)/);
  expect(phase).not.toMatch(/await persistCallCost/);
});

// Actual solution handler and x402 post-settlement boundary; /v1/do's paid
// HTTP harness covers its commit boundary in routes/do.core.test.ts.
import { Hono } from "hono";
import { beforeEach, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { withCallCost } from "./call-cost.js";
const state = vi.hoisted(() => ({
  events: [] as string[], failCost: false, commits: 0, balance: 1000, debit: 0,
  logError: vi.fn(), capture: vi.fn(), release: vi.fn(), receipt: vi.fn(),
  costQueries: [] as unknown[], settle: vi.fn(),
}));
const TXID = "33333333-3333-3333-3333-333333333333";
vi.mock("../db/index.js", async () => {
  const { capabilities, transactions } = await import("../db/schema.js");
  const tx = {
    execute: async () => [],
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: "wallet", balanceCents: state.balance }] }) }) }),
    insert: () => ({ values: () => {
      const result = { returning: async () => [{ id: "33333333-3333-3333-3333-333333333333" }] };
      return { ...result, onConflictDoNothing: () => result };
    } }),
    update: () => ({ set: () => ({ where: async () => { state.events.push("terminal-update"); } }) }),
  };
  return { getDb: () => ({
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const rows = table === transactions ? [] : table === capabilities ? [{
        id: "22222222-2222-2222-2222-222222222222", slug: "test-capability", name: "Test", description: "Test tool",
        priceCents: 5, isActive: true, visible: true, x402Enabled: true, marketplaceEligible: true, lifecycleState: "active",
        inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
        capabilityType: "deterministic", transparencyTag: "algorithmic", processesPersonalData: false,
      }] : [{ id: "solution", slug: "test-solution", priceCents: 50, isActive: true, transparencyTag: "algorithmic" }];
      return Object.assign(Promise.resolve(rows), { limit: async () => rows });
    } }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const result = await fn(tx);
      state.events.push(`commit-${++state.commits}`);
      return result;
    },
    insert: () => ({ values: () => {
      const result = { returning: async () => {
        state.events.push("x402-claim-commit");
        return [{ id: "33333333-3333-3333-3333-333333333333" }];
      } };
      return { ...result, onConflictDoNothing: () => result };
    } }),
    update: () => ({ set: () => ({ where: () => Object.assign(Promise.resolve([]), { returning: async () => {
      state.events.push("x402-finalize-commit"); return [{ id: "33333333-3333-3333-3333-333333333333" }];
    } }) }) }),
    execute: async (query: unknown) => {
      state.events.push("cost-write"); state.costQueries.push(query);
      if (state.failCost) throw new Error("cost write unavailable");
      return [];
    },
  }) };
});
vi.mock("./middleware.js", () => ({
  authMiddleware: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user", maxSpendPerHourCents: null });
    c.set("log", { info: vi.fn(), error: vi.fn() });
    await next();
  },
}));
vi.mock("./rate-limit.js", () => ({ rateLimitByIp: () => async (_c: unknown, next: () => Promise<void>) => next(), rateLimitByKey: () => async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../routes/do.js", () => ({ spendCapWouldExceed: vi.fn() }));
vi.mock("./api-keys.js", () => ({ keyCapError: vi.fn().mockResolvedValue(null) }));
vi.mock("./wallet-reservations.js", () => ({
  reserve: async () => { state.debit++; state.balance -= 50; state.events.push("debit"); return { id: "reservation", balanceAfter: state.balance }; },
  capture: state.capture, release: state.release,
}));
vi.mock("./solution-executor.js", () => ({
  executeSolution: async () => ({ steps: { "test-step": { answer: "done" } }, errors: [], step_count: 1, stepTimings: [] }),
  stepsThatRan: () => ["test-step"],
}));
vi.mock("./receipt/settle.js", () => ({ settleExecutionReceipt: state.receipt }));
vi.mock("./x402-settlement-intent.js", () => ({
  markRecordedBySettlement: vi.fn().mockResolvedValue(undefined),
  openIntent: async () => ({ id: "intent" }), markSettled: vi.fn(), markFailed: vi.fn(),
}));
vi.mock("./x402-gateway.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./x402-gateway.js")>(),
  isX402Configured: () => true, extractPaymentHeader: () => "signed-payment",
  verifyX402PaymentOnly: async () => ({ valid: true, verified: {} }),
  hashPaymentHeader: () => "payment-hash", extractPayerAddress: () => "0xpayer",
  settleX402Payment: state.settle,
}));
vi.mock("../capabilities/index.js", () => ({ getExecutor: () => async () => ({ output: { answer: "done" }, provenance: { source: "test" } }) }));
vi.mock("../capabilities/guarded-executor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../capabilities/guarded-executor.js")>(), assertGuardedAllow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./invocation-facts.js", () => ({ recordPaidInvocation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./log.js", () => ({ logError: state.logError, logWarn: vi.fn() }));
import { solutionExecuteRoute } from "../routes/solution-execute.js";
import { x402GatewayV2, __resetX402CacheForTests } from "../routes/x402-gateway-v2.js";

beforeEach(() => {
  state.events = []; state.failCost = false; state.commits = 0; state.balance = 1000;
  state.debit = 0; state.costQueries = [];
  vi.clearAllMocks();
  __resetX402CacheForTests();
  state.settle.mockImplementation(async () => { state.events.push("payment-settled"); return { valid: true, settlementId: "settled-payment" }; });
  state.capture.mockImplementation(async () => { state.events.push("capture"); return true; });
  state.receipt.mockImplementation(async () => { state.events.push("receipt"); });
});
it.each([false, true])("solutions: cost failure=%s preserves the response and captured debit", async (fail) => {
  state.failCost = fail;
  const app = new Hono().route("/v1/solutions", solutionExecuteRoute);
  const response = await withCallCost(() => app.request("/v1/solutions/test-solution/execute", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputs: { value: "test" } }),
  }), 1);
  expect(response.status).toBe(200);
  expect((await response.json()).result).toMatchObject({ transaction_id: TXID, status: "completed", price_cents: 50, wallet_balance_cents: 950 });
  await vi.waitFor(() => expect(state.events).toContain("cost-write"));
  expect(state.events.indexOf("cost-write")).toBeGreaterThan(state.events.indexOf("commit-2"));
  expect(state.events.indexOf("commit-2")).toBeGreaterThan(state.events.indexOf("capture"));
  expect(state.debit).toBe(1); expect(state.balance).toBe(950);
  expect(state.capture).toHaveBeenCalledTimes(1); expect(state.release).not.toHaveBeenCalled();
  expect(state.receipt).toHaveBeenCalledTimes(1);
  await assertCostWrite(fail);
});
it.each([false, true])("x402 v2: cost failure=%s preserves the settled transaction id", async (fail) => {
  state.failCost = fail;
  const app = new Hono().route("/x402", x402GatewayV2);
  const response = await withCallCost(() => app.request("/x402/v2/test-capability", {
    method: "POST", headers: { "content-type": "application/json", "X-Payment": "signed-payment" },
    body: JSON.stringify({ value: "test" }),
  }), 1);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ answer: "done", _meta: { payment: { method: "x402", settlement_id: "settled-payment" } } });
  expect(state.settle).toHaveBeenCalledTimes(1);
  expect(state.events.indexOf("x402-finalize-commit")).toBeGreaterThan(state.events.indexOf("payment-settled"));
  await vi.waitFor(() => expect(state.events).toContain("cost-write"));
  expect(state.events.indexOf("cost-write")).toBeGreaterThan(state.events.indexOf("x402-finalize-commit"));
  expect(state.receipt).toHaveBeenCalledTimes(1); expect(state.release).not.toHaveBeenCalled();
  await assertCostWrite(fail);
});
async function assertCostWrite(fail: boolean) {
  if (fail) await vi.waitFor(() => expect(state.logError).toHaveBeenCalledWith("transaction-cost-write-failed", expect.any(Error), { transaction_id: TXID }));
  expect(state.costQueries).toHaveLength(1);
  const query = new PgDialect().sqlToQuery(state.costQueries[0] as any);
  expect(query.params[2]).toBe(TXID);
  expect(query.params.every(p => p === null || ["string", "number", "boolean"].includes(typeof p))).toBe(true);
}
