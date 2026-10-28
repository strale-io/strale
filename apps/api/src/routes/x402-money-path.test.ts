import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ rows: [] as any[], events: [] as string[], executor: vi.fn(), settle: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), failRecord: false, intents: [] as any[], capabilityType: "deterministic", failBegin: false, solution: vi.fn(), schema: undefined as unknown }));
vi.mock("../db/index.js", async () => {
  const { capabilities, solutions, transactions, x402OrphanSettlements } = await import("../db/schema.js");
  const compile = (q: any) => {
    const query = new PgDialect().sqlToQuery(q);
    expect(query.params.some(p => p instanceof Date || Buffer.isBuffer(p))).toBe(false);
    return query;
  };
  const match = (row: any, q: any) => {
    const { sql, params } = compile(q);
    let n = 0;
    for (const m of sql.matchAll(/"transactions"\."(\w+)" = \$(\d+)/g)) {
      const prop = m[1]!.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      if (row[prop] !== params[Number(m[2]) - 1]) return false;
      n++;
    }
    expect(n).toBeGreaterThan(0);
    return true;
  };
  const db = {
    transaction: async (fn: any) => fn(db),
    delete: () => ({ where: async (q: any) => { state.rows = state.rows.filter(r => !match(r, q)); } }),
    select: () => ({ from: (table: unknown) => ({ where: (q: any) => {
      const rows = table === transactions ? state.rows.filter(r => match(r, q)).map(r => ({ ...r, settlementId: r.x402SettlementId })) : table === solutions ? [{
        id: "44444444-4444-4444-4444-444444444444", slug: "test-solution", name: "Test solution", description: "Test solution",
        priceCents: 5, isActive: true, x402Enabled: true,
        inputSchema: state.schema ?? { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      }] : [{
        id: "22222222-2222-2222-2222-222222222222", slug: "test-capability", name: "Test", description: "Test tool",
        priceCents: 5, isActive: true, visible: true, x402Enabled: true, marketplaceEligible: true, lifecycleState: "active",
        inputSchema: state.schema ?? { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
        capabilityType: state.capabilityType, transparencyTag: "algorithmic", processesPersonalData: false,
      }];
      return Object.assign(Promise.resolve(rows), { limit: async () => rows, for: async () => rows });
    } }) }),
    insert: (table: unknown) => ({ values: (values: any) => {
      const run = async (ignoreConflict: boolean) => {
        if (table === x402OrphanSettlements) { state.events.push("orphan"); return []; }
        expect(table).toBe(transactions);
        if (values.x402PaymentHash && state.rows.some(r => r.x402PaymentHash === values.x402PaymentHash)) {
          if (ignoreConflict) return [];
          throw Object.assign(new Error("unique payment hash"), { code: "23505" });
        }
        const row = { id: `tx-${state.events.length}`, createdAt: Date.now(), ...values };
        state.rows.push(row); state.events.push(values.status === "executing" ? "claim" : "record");
        return [{ id: row.id }];
      };
      return { then: (resolve: any, reject: any) => run(false).then(resolve, reject), returning: () => run(false),
        onConflictDoNothing: () => ({ returning: () => run(true) }) };
    } }),
    update: () => ({ set: (values: any) => ({ where: (q: any) => {
      const run = async () => {
        if (state.failBegin && values.x402ExecutionAttempts?.count > 0) throw new Error("claim counter unavailable");
        if (state.failRecord && values.status === "completed") throw new Error("record unavailable");
        const matched = state.rows.filter(r => match(r, q));
        matched.forEach(r => Object.assign(r, values));
        if (values.status === "completed") state.events.push("record");
        return matched.map(r => ({ id: r.id }));
      };
      return { then: (resolve: any, reject: any) => run().then(resolve, reject), returning: run };
    } }) }),
    execute: async (query: any) => {
      const { sql, params } = compile(query);
      if (sql.includes("AS attempts")) return [{ attempts: state.rows.filter(r => r.x402ExecutionAttempts?.paymentHash === params[0]).reduce((sum, r) => sum + r.x402ExecutionAttempts.count, 0) }];
      if (sql.includes("FOR UPDATE SKIP LOCKED")) {
        expect(sql).toContain("interval '10 minutes'");
        expect(sql).toContain("x402_settlement_id IS NULL");
        expect(sql).toContain("NOT EXISTS");
        return state.rows.filter(r => r.status === "executing" && r.x402PaymentHash && !r.x402SettlementId && r.createdAt < Date.now() - 600_000 && !state.intents.some(i => i.paymentHash === r.x402PaymentHash))
          .slice(0, Number(params[0])).map(r => ({ id: r.id, x402_payment_hash: r.x402PaymentHash, x402_execution_attempts: r.x402ExecutionAttempts }));
      }
      if (sql.includes("FROM x402_settlement_intents")) return state.intents.filter(i => i.paymentHash === params[0]);
      return [];
    },
  };
  return { getDb: () => db };
});
vi.mock("../lib/rate-limit.js", () => ({ rateLimitByIp: () => async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../lib/receipt/settle.js", () => ({ settleExecutionReceipt: vi.fn() }));
vi.mock("../lib/x402-settlement-intent.js", () => ({
  openIntent: async () => { state.events.push("intent"); return { id: "intent" }; },
  markSettled: vi.fn(), markFailed: vi.fn(), markRecordedBySettlement: vi.fn(),
}));
vi.mock("../lib/x402-gateway.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/x402-gateway.js")>(),
  isX402Configured: () => true, extractPaymentHeader: () => "signed-payment",
  verifyX402PaymentOnly: async () => { state.events.push("verify"); return { valid: true, verified: {} }; },
  hashPaymentHeader: () => "same-payment-hash", extractPayerAddress: () => null,
  settleX402Payment: state.settle,
}));
vi.mock("../lib/solution-executor.js", () => ({ executeSolution: state.solution, stepsThatRan: () => ["test-capability"] }));
vi.mock("../capabilities/index.js", () => ({ getExecutor: () => state.executor }));
vi.mock("../capabilities/guarded-executor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../capabilities/guarded-executor.js")>(), assertGuardedAllow: vi.fn(),
}));
vi.mock("../lib/invocation-facts.js", () => ({ recordPaidInvocation: vi.fn() }));
vi.mock("../lib/log.js", () => ({ logError: state.logError, logWarn: state.logWarn }));
import { x402GatewayV2, __resetX402CacheForTests } from "./x402-gateway-v2.js";
import { markFailed } from "../lib/x402-settlement-intent.js";
const call = (inputs: any = { value: "test" }) => new Hono().route("/x402", x402GatewayV2).request("/x402/v2/test-capability", {
  method: "POST", headers: { "content-type": "application/json", "X-Payment": "signed-payment" }, body: JSON.stringify(inputs),
});
const output = { output: { answer: "done" }, provenance: { source: "test" } };
beforeEach(() => {
  state.schema = undefined;
  vi.clearAllMocks(); state.rows = []; state.events = []; state.intents = []; state.failRecord = false; state.failBegin = false; state.capabilityType = "deterministic"; __resetX402CacheForTests();
  state.executor.mockImplementation(async () => { state.events.push("execute"); return output; });
  state.settle.mockImplementation(async () => { state.events.push("settle"); return { valid: true, settlementId: "settled-payment" }; });
});
describe("H4 x402 atomic payment claim", () => {
  it("two concurrent identical payments execute once, then replay the same finalized row", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(r => { finish = r; });
    state.executor.mockImplementation(async () => { state.events.push("execute"); await gate; return output; });
    const first = call();
    try {
      await vi.waitFor(() => expect(state.executor).toHaveBeenCalledTimes(1));
      const duplicate = await Promise.race([call(), new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("duplicate executed instead of losing claim")), 250))]);
      expect(duplicate.status).toBe(502);
      expect(await duplicate.json()).toMatchObject({ error: "A request with this payment is already in progress or has failed", _meta: { replayed: true } });
    } finally { finish(); }
    expect((await first).status).toBe(200);
    expect(state.executor).toHaveBeenCalledTimes(1); expect(state.settle).toHaveBeenCalledTimes(1);
    expect(state.rows).toHaveLength(1); expect(state.rows[0].status).toBe("completed");
    expect(state.events.indexOf("claim")).toBeLessThan(state.events.indexOf("execute"));
    expect(state.events.indexOf("intent")).toBeLessThan(state.events.indexOf("settle"));
    expect(state.events.indexOf("settle")).toBeLessThan(state.events.indexOf("record"));
    const replay = await call(); expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ answer: "done", _meta: { replayed: true } });
    expect(state.executor).toHaveBeenCalledTimes(1);
  });
  it("releases a failed execution claim so the same payment can retry successfully", async () => {
    state.executor.mockRejectedValueOnce(new Error("execution failed"));
    expect((await call()).status).toBe(400);
    expect(state.settle).not.toHaveBeenCalled();
    expect(state.rows[0]).toMatchObject({ status: "failed", x402PaymentHash: null });
    expect((await call()).status).toBe(200);
    expect(state.executor).toHaveBeenCalledTimes(2); expect(state.settle).toHaveBeenCalledTimes(1);
    expect(state.rows.filter(r => r.x402PaymentHash)).toHaveLength(1);
  });
  it("releases on input rejection, before execution or settlement", async () => {
    expect((await call({})).status).toBe(400);
    expect(state.rows).toHaveLength(0);
    expect(state.executor).not.toHaveBeenCalled(); expect(state.settle).not.toHaveBeenCalled();
    expect((await call()).status).toBe(200);
  });
  it("retains an ambiguous settlement claim and its durable intent", async () => {
    state.settle.mockResolvedValueOnce({ valid: false, settlementUnknown: true, error: "transport lost" });
    expect((await call()).status).toBe(402);
    expect(state.rows[0].x402PaymentHash).toBe("same-payment-hash");
    expect(markFailed).not.toHaveBeenCalled();
    expect((await call()).status).toBe(502); expect(state.executor).toHaveBeenCalledTimes(1);
  });
  it("keeps orphan capture and logs a post-settlement record failure", async () => {
    state.failRecord = true;
    expect((await call()).status).toBe(200);
    expect(state.events).toContain("orphan");
    expect(state.logError).toHaveBeenCalled();
    expect(state.rows[0].x402PaymentHash).toBe("same-payment-hash");
  });
});

it("Round 2 caps failed executions at two per payment hash", async () => {
  state.executor.mockRejectedValue(new Error("execution failed"));
  expect((await call()).status).toBe(400);
  expect((await call()).status).toBe(400);
  const third = await call();
  expect(third.status).toBe(502);
  expect(await third.json()).toMatchObject({ _meta: { replayed: true } });
  expect(state.executor).toHaveBeenCalledTimes(2);
  expect(state.rows).toHaveLength(2);
  expect(state.rows.map(r => r.x402ExecutionAttempts)).toEqual([
    { paymentHash: "same-payment-hash", count: 1 }, { paymentHash: "same-payment-hash", count: 1 },
  ]);
});

it("Round 2 includes transient retries in the two-execution budget", async () => {
  state.capabilityType = "live";
  state.executor.mockRejectedValue(new Error("HTTP 503"));
  expect((await call()).status).toBe(400);
  expect((await call()).status).toBe(502);
  expect(state.executor).toHaveBeenCalledTimes(2);
});

it("Round 2 janitor releases only stale pre-intent unsettled claims and fences late owners", async () => {
  const { getDb } = await import("../db/index.js");
  const { releaseStaleX402Claims, openClaimedX402Intent } = await import("../lib/x402-payment-claims.js");
  const stale = Date.now() - 600_001;
  state.rows.push(
    { id: "stale", status: "executing", x402PaymentHash: "stale", createdAt: stale, x402ExecutionAttempts: { paymentHash: "stale", count: 1 } },
    { id: "empty", status: "executing", x402PaymentHash: "empty", createdAt: stale },
    { id: "intent", status: "executing", x402PaymentHash: "intent", createdAt: stale },
    { id: "settled", status: "executing", x402PaymentHash: "settled", createdAt: stale, x402SettlementId: "settlement" },
    { id: "fresh", status: "executing", x402PaymentHash: "fresh", createdAt: Date.now() },
  );
  state.intents.push({ id: "intent-id", paymentHash: "intent" });
  expect(await getDb().transaction(tx => releaseStaleX402Claims(tx, 25))).toBe(2);
  expect(state.rows.find(r => r.id === "empty")).toBeUndefined();
  expect(state.rows.find(r => r.id === "stale")).toMatchObject({ status: "failed", x402PaymentHash: null });
  for (const id of ["intent", "settled", "fresh"]) expect(state.rows.find(r => r.id === id)?.x402PaymentHash).toBe(id);
  await expect(openClaimedX402Intent("stale", { paymentHash: "stale", slug: "test-capability", priceCents: 5 })).rejects.toThrow("no longer owned");
});

it("Round 2 deletes a claim when execution admission fails before the executor", async () => {
  state.failBegin = true;
  expect((await call()).status).toBe(503);
  expect(state.rows).toHaveLength(0);
  expect(state.executor).not.toHaveBeenCalled();
  expect(state.settle).not.toHaveBeenCalled();
  expect(state.logError).toHaveBeenCalledWith("x402-execution-admission-failed", expect.any(Error), expect.anything());
});

it("Round 2 deletes the claim on a guarded-allow 503 before execution", async () => {
  const { assertGuardedAllow, CapabilityNotClassifiedError } = await import("../capabilities/guarded-executor.js");
  vi.mocked(assertGuardedAllow).mockRejectedValueOnce(new CapabilityNotClassifiedError("test-capability", { kind: "customer_paid", userId: null, transactionId: null }));
  expect((await call()).status).toBe(503);
  expect(state.rows).toHaveLength(0);
  expect(state.executor).not.toHaveBeenCalled();
});


it.each(["enforce", "report"])("H6 %s schema validation happens before the payment claim", async mode => {
  vi.stubEnv("INPUT_VALIDATION_MODE", mode);
  try {
    const res = await call({ value: 81726354 });
    expect(res.status).toBe(mode === "enforce" ? 400 : 200);
    if (mode === "enforce") {
      expect(await res.json()).toMatchObject({ error_code: "invalid_input", details: { fix: expect.any(String), paths: ["/value"] } });
      expect(state.events).not.toContain("claim");
      expect(state.rows).toEqual([]);
      expect(state.executor).not.toHaveBeenCalled();
      expect(state.settle).not.toHaveBeenCalled();
    } else {
      expect(state.executor).toHaveBeenCalledWith({ value: 81726354 });
      expect(state.events).toContain("claim");
    }
    expect(state.logWarn).toHaveBeenCalledWith("input-schema-mismatch", expect.any(String), { slug: "test-capability", rail: "x402", paths: ["/value"] });
    expect(JSON.stringify(state.logWarn.mock.calls)).not.toContain("81726354");
  } finally { vi.unstubAllEnvs(); }
});


it.each(["enforce", "report"])("H6 %s solution schema validation precedes claim", async mode => {
  vi.stubEnv("INPUT_VALIDATION_MODE", mode);
  state.solution.mockResolvedValue(null); // Executed, but has no configured steps; no settlement.
  try {
    const res = await new Hono().route("/x402", x402GatewayV2).request("/x402/v2/solutions/test-solution", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Payment": "signed-solution-payment" },
      body: JSON.stringify({ value: 81726354 }),
    });
    expect(res.status).toBe(mode === "enforce" ? 400 : 503);
    if (mode === "enforce") {
      expect(await res.json()).toMatchObject({ error_code: "invalid_input", details: { fix: expect.any(String) } });
      expect(state.events).not.toContain("claim"); expect(state.solution).not.toHaveBeenCalled();
    } else {
      expect(state.solution).toHaveBeenCalledWith(expect.any(String), { value: 81726354 }, { userId: null });
      expect(state.events).toContain("claim");
    }
    expect(state.logWarn).toHaveBeenCalledWith("input-schema-mismatch", expect.any(String), { slug: "test-solution", rail: "x402", paths: ["/value"] });
    expect(JSON.stringify(state.logWarn.mock.calls)).not.toContain("81726354");
  } finally { vi.unstubAllEnvs(); }
});

it.each(["capability", "solution"])("Round 2 malformed %s schema returns 503 before x402 claim", async kind => {
  state.schema = { type: "foo" };
  vi.stubEnv("INPUT_VALIDATION_MODE", "enforce");
  try {
    const res = kind === "capability" ? await call() : await new Hono().route("/x402", x402GatewayV2).request("/x402/v2/solutions/test-solution", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Payment": "signed-solution-payment" }, body: JSON.stringify({ value: "ok" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error_code: "capability_unavailable", details: { fix: expect.any(String) } });
    expect(state.events).not.toContain("claim");
    expect(state.executor).not.toHaveBeenCalled();
    expect(state.solution).not.toHaveBeenCalled();
    expect(state.settle).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});
