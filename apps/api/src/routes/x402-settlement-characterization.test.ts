import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
// Pin wire-visible configuration before modules read it. Golden settlement
// behavior must not depend on the reviewer's deploy identity or region.
vi.hoisted(() => {
  vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", undefined);
  vi.stubEnv("RAILWAY_REPLICA_REGION", undefined);
  vi.stubEnv("STRALE_PROCESSING_REGION", undefined);
  vi.stubEnv("X402_NETWORK", "base-sepolia");
  vi.stubEnv("X402_WALLET_ADDRESS", "");
  vi.stubEnv("API_BASE_URL", "https://api.strale.io");
});
afterAll(() => vi.unstubAllEnvs());
const state = vi.hoisted(() => ({ rows: [] as any[], events: [] as string[], executor: vi.fn(), settle: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), failRecord: false, intents: [] as any[], capabilityType: "deterministic", failBegin: false, solution: vi.fn(), schema: undefined as unknown, failIntent: false, failMark: false, failRecorded: false, failOrphan: false, orphanRows: [] as any[] }));
vi.mock("../db/index.js", async () => {
  const { capabilities, solutions, transactions, x402OrphanSettlements, x402SettlementIntents } = await import("../db/schema.js");
  const compile = (q: any) => {
    const query = new PgDialect().sqlToQuery(q);
    expect(query.params.some(p => p instanceof Date || Buffer.isBuffer(p))).toBe(false);
    return query;
  };
  const match = (row: any, q: any) => {
    const { sql, params } = compile(q);
    let n = 0;
    for (const m of sql.matchAll(/"(?:transactions|x402_settlement_intents)"\."(\w+)" = \$(\d+)/g)) {
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
      const rows = table === x402SettlementIntents ? state.intents.filter(r => match(r, q)) : table === transactions ? state.rows.filter(r => match(r, q)).map(r => ({ ...r, settlementId: r.x402SettlementId })) : table === solutions ? [{
        id: "44444444-4444-4444-4444-444444444444", slug: "test-solution", name: "Test solution", description: "Test solution",
        priceCents: 5, isActive: true, x402Enabled: true,
        inputSchema: state.schema ?? { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      }] : [{
        id: "22222222-2222-2222-2222-222222222222", slug: "test-capability", name: "Test", description: "Test tool",
        priceCents: 5, isFreeTier: false, isActive: true, visible: true, x402Enabled: true, marketplaceEligible: true, lifecycleState: "active",
        inputSchema: state.schema ?? { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
        capabilityType: state.capabilityType, transparencyTag: "algorithmic", processesPersonalData: false,
      }];
      return Object.assign(Promise.resolve(rows), { limit: async () => rows, for: async () => rows });
    } }) }),
    insert: (table: unknown) => ({ values: (values: any) => {
      const run = async (ignoreConflict: boolean) => {
        if (table === x402OrphanSettlements) {
          if (state.failOrphan) throw new Error("orphan unavailable");
          state.events.push("orphan"); state.orphanRows.push(values); return [];
        }
        if (table === x402SettlementIntents) {
          if (state.failIntent) throw new Error("intent unavailable");
          const prior = state.intents.find(i => i.paymentHash === values.paymentHash);
          if (prior) return [prior];
          const row = { id: "intent", settlementId: null, ...values };
          state.intents.push(row); state.events.push("intent"); return [row];
        }
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
        onConflictDoNothing: () => ({ returning: () => run(true) }), onConflictDoUpdate: () => ({ returning: () => run(false) }) };
    } }),
    update: (table: unknown) => ({ set: (values: any) => ({ where: (q: any) => {
      const run = async () => {
        if (state.failBegin && values.x402ExecutionAttempts?.count > 0) throw new Error("claim counter unavailable");
        if (state.failRecord && values.status === "completed") throw new Error("record unavailable");
        if (table === x402SettlementIntents && state.failMark && values.state === "settled") throw new Error("mark unavailable");
        if (table === x402SettlementIntents && state.failRecorded && values.state === "recorded") throw new Error("recorded unavailable");
        const matched = (table === x402SettlementIntents ? state.intents : state.rows).filter(r => match(r, q));
        if (values.state) state.events.push(values.state);
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
vi.mock("../lib/receipt/settle.js", () => ({ settleExecutionReceipt: vi.fn() }));
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
vi.mock("../lib/invocation-facts.js", () => ({ recordPaidInvocation: vi.fn(), recordAnonymousInvocation: vi.fn().mockResolvedValue(undefined), computeServedFree: (paid: unknown) => !paid }));
vi.mock("../lib/log.js", () => ({ logError: state.logError, logWarn: state.logWarn, log: { debug: vi.fn() } }));
import { x402GatewayV2, __resetX402CacheForTests } from "./x402-gateway-v2.js";
import { doRoute } from "./do.js";
import { recordAnonymousInvocation } from "../lib/invocation-facts.js";
vi.mock("../lib/matching.js", () => ({ matchCapability: async () => ({ capability: {
  id: "22222222-2222-2222-2222-222222222222", slug: "test-capability", name: "Test", priceCents: 5,
  isFreeTier: false, capabilityType: state.capabilityType, transparencyTag: "algorithmic", processesPersonalData: false,
  inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
} }) }));
vi.mock("../lib/circuit-breaker.js", () => ({ checkCircuitBreaker: async () => ({ allowed: true }), recordSuccess: vi.fn(), recordFailure: vi.fn() }));
vi.mock("../lib/quality-capture.js", () => ({ recordQuality: vi.fn() }));
vi.mock("../lib/event-triggers.js", () => ({ triggerOnFailure: vi.fn() }));
vi.mock("../lib/piggyback-monitor.js", () => ({ recordPiggybackResult: vi.fn() }));
vi.mock("../lib/progressive-unlock.js", () => ({ isUnlocked: () => false, recordUnlock: () => [], getUnlockedSlugs: () => [] }));
vi.mock("../lib/audit-token.js", () => ({ getShareableUrl: () => ({ url: "https://example.test/audit", expiresAt: "2026-10-29T00:00:00.000Z" }) }));
vi.mock("../lib/rate-limit.js", () => ({ consumeIpRate: () => null, rateLimitByIp: () => async (_c: unknown, next: () => Promise<void>) => next(), rateLimitByKey: () => async (_c: unknown, next: () => Promise<void>) => next() }));
const call = (inputs: any = { value: "test" }) => new Hono().route("/x402", x402GatewayV2).request("/x402/v2/test-capability", {
  method: "POST", headers: { "content-type": "application/json", "X-Payment": "signed-payment" }, body: JSON.stringify(inputs),
});
const output = { output: { answer: "done" }, provenance: { source: "test" } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
  state.failIntent = false; state.failMark = false; state.failRecorded = false; state.failOrphan = false; state.orphanRows = [];
  state.schema = undefined;
  vi.clearAllMocks(); state.rows = []; state.events = []; state.intents = []; state.failRecord = false; state.failBegin = false; state.capabilityType = "deterministic"; __resetX402CacheForTests();
  state.solution.mockImplementation(async () => { state.events.push("execute"); return { steps: { "test-capability": output.output }, errors: [], step_count: 1, latency_ms: 7 }; });
  state.executor.mockImplementation(async () => { state.events.push("execute"); return output; });
  state.settle.mockImplementation(async () => { state.events.push("settle"); return { valid: true, settlementId: "settled-payment" }; });
});

afterEach(() => { vi.useRealTimers(); });
const routes = ["do", "capability", "solution"] as const;
function request(route: typeof routes[number]) {
  if (route === "capability") return call();
  if (route === "solution") return new Hono().route("/x402", x402GatewayV2).request("/x402/v2/solutions/test-solution", {
    method: "POST", headers: { "content-type": "application/json", "X-Payment": "signed-payment" }, body: JSON.stringify({ value: "test" }),
  });
  return new Hono().route("/v1", doRoute).request("/v1/do", {
    method: "POST", headers: { "content-type": "application/json", "X-Payment": "signed-payment" },
    body: JSON.stringify({ capability_slug: "test-capability", max_price_cents: 5, inputs: { value: "test" } }),
  });
}
async function observed(response: Response) {
  return { status: response.status, headers: Object.fromEntries(response.headers),
    body: await response.text(), rows: state.rows, intents: state.intents, orphans: state.orphanRows,
    events: state.events, logs: state.logError.mock.calls.map(([name]) => name) };
}
// Route-level golden characterization; H4b updates only the /v1/do rail. Real intent/claim code,
// real Drizzle predicates and scalar raw-SQL binds; only the DB and vendors are simulated.
// Snapshots include the full response, headers, writes, event order and log names.
describe.each(routes)("H7b %s settlement characterization", route => {
  it("success: intent commits before the irreversible call, then records", async () => {
    const response = await request(route);
    expect(response.status).toBe(200);
    expect(state.events.indexOf("intent")).toBeGreaterThan(state.events.indexOf("execute"));
    expect(state.events.indexOf("settle")).toBeGreaterThan(state.events.indexOf("intent"));
    expect(state.intents[0].state).toBe("recorded");
    expect(await observed(response)).toMatchSnapshot();
  });
  it("confirmed decline: no settlement id or wallet charge, documented error", async () => {
    state.settle.mockImplementation(async () => { state.events.push("settle"); return { valid: false, error: "declined" }; });
    const response = await request(route);
    expect(response.status).toBe(402);
    expect(state.rows.every(r => !r.x402SettlementId && r.priceCents === 0)).toBe(true);
    expect(state.intents[0].state).toBe("failed");
    expect(await observed(response)).toMatchSnapshot();
  });
  it("intent write failure prevents any settlement", async () => {
    state.failIntent = true;
    const response = await request(route);
    expect(response.status).toBe(500);
    expect(state.settle).not.toHaveBeenCalled();
    expect(await observed(response)).toMatchSnapshot();
  });
  it("post-settlement transaction write failure preserves current orphan policy", async () => {
    state.failRecord = true;
    const response = await request(route);
    expect(response.status).toBe(200);
    expect(state.orphanRows).toHaveLength(1);
    expect(await observed(response)).toMatchSnapshot();
  });
  it("intent settlement write failure captures the orphan and surfaces its log", async () => {
    state.failMark = true;
    const response = await request(route);
    expect(response.status).toBe(200);
    expect(state.orphanRows).toHaveLength(1);
    expect(state.logError.mock.calls.map(([name]) => name)).toContain("x402-intent-mark-settled-failed");
    expect(await observed(response)).toMatchSnapshot();
  });
  it("mark-recorded failure preserves the caller's current response and log policy", async () => {
    state.failRecorded = true;
    const response = await request(route);
    expect(response.status).toBe(200);
    expect(await observed(response)).toMatchSnapshot();
  });
  it("same payment replay preserves execution count and response", async () => {
    expect((await request(route)).status).toBe(200);
    const response = await request(route);
    expect(response.status).toBe(200);
    expect(route === "solution" ? state.solution : state.executor).toHaveBeenCalledTimes(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
    expect(await observed(response)).toMatchSnapshot();
  });
  it("ambiguous settlement preserves current intent state and retry policy", async () => {
    state.settle.mockResolvedValue({ valid: false, settlementUnknown: true, error: "transport lost" });
    const response = await request(route);
    expect(response.status).toBe(402);
    expect(state.intents[0].state).toBe("settling");
    expect(await observed(response)).toMatchSnapshot();
  });
  it("a thrown facilitator call preserves the claim and intent policy", async () => {
    state.settle.mockRejectedValue(new Error("transport threw"));
    const response = await request(route);
    expect(response.status).toBe(500);
    expect(state.intents[0].state).toBe("settling");
    expect(await observed(response)).toMatchSnapshot();
  });
  it("valid result without settlement id keeps legacy response and writes", async () => {
    state.settle.mockResolvedValue({ valid: true });
    const response = await request(route);
    expect(response.status).toBe(200);
    expect(state.intents[0].state).toBe("failed");
    expect(await observed(response)).toMatchSnapshot();
  });
  it("failed execution never opens an intent or settles", async () => {
    state.executor.mockRejectedValue(new Error("execution failed"));
    state.solution.mockResolvedValue({ steps: {}, errors: [], step_count: 0, latency_ms: 7 });
    const response = await request(route);
    expect(response.status).toBe(route === "do" ? 500 : route === "solution" ? 502 : 400);
    expect(state.intents).toHaveLength(0); expect(state.settle).not.toHaveBeenCalled();
    expect(await observed(response)).toMatchSnapshot();
  });
});

// DEC-20260504-A: these assertions are also run against scratch origin/main
// production modules. Every H4b regression below must fail there.
describe("H4b /v1/do x402 parity regressions", () => {
  it("returns an unpaid 503 when execution admission fails", async () => {
    state.failBegin = true;
    const response = await request("do");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error_code: "execution_failed", message: "Execution could not start. No payment was taken.", details: { retryable: true, next_step: "Retry with exponential backoff." } });
    expect(state.executor).not.toHaveBeenCalled();
    expect(state.settle).not.toHaveBeenCalled();
  });

  it("does not record an invocation fact when execution admission fails", async () => {
    state.failBegin = true;
    await request("do");
    expect(recordAnonymousInvocation).not.toHaveBeenCalled();
  });
  it("replays a completed hash with the cached result, no second execution or settlement", async () => {
    const first = await (await request("do")).json();
    const replay = await request("do");
    expect(replay.status).toBe(200);
    const body = await replay.json();
    expect(body.result).toEqual(first.result);
    expect(body.meta.audit).toEqual(first.meta.audit);
    expect(body.meta.replayed).toBe(true);
    expect(state.executor).toHaveBeenCalledTimes(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
    expect(state.rows).toHaveLength(1);
  });
  it("redacts legacy stored audit error text on completed replay", async () => {
    state.rows.push({ id: "prior", status: "completed", x402PaymentHash: "same-payment-hash",
      priceCents: 5, output: output.output, provenance: output.provenance, latencyMs: 7,
      auditTrail: { execution: { error: "getaddrinfo ENOTFOUND internal.example.test" } },
    });
    const response = await request("do");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.audit).toEqual({ execution: { error: "Service temporarily unreachable" } });
    expect(state.rows[0].auditTrail.execution.error).toContain("internal.example.test");
    expect(state.executor).not.toHaveBeenCalled();
    expect(state.settle).not.toHaveBeenCalled();
  });
  it("refuses concurrent use with the gateway's 502 and retry guidance", async () => {
    let finish!: (value: typeof output) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    state.executor.mockImplementation(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const first = request("do");
    await started;
    // Resolve any accidental second executor immediately so a broken guard
    // fails assertions instead of timing out.
    state.executor.mockResolvedValue(output);
    const second = await request("do");
    finish(output);
    expect((await first).status).toBe(200);
    expect(second.status).toBe(502);
    expect(await second.json()).toMatchObject({ error_code: "payment_failed", details: { retryable: false } });
    expect(state.executor).toHaveBeenCalledTimes(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
  });
  it("refuses a stored failed hash without executing or settling", async () => {
    state.rows.push({ id: "prior", status: "failed", x402PaymentHash: "same-payment-hash" });
    expect((await request("do")).status).toBe(502);
    expect(state.executor).not.toHaveBeenCalled();
    expect(state.settle).not.toHaveBeenCalled();
  });
  it("releases failed execution claims but refuses a third execution for the hash", async () => {
    state.executor.mockRejectedValue(new Error("execution failed"));
    expect((await request("do")).status).toBe(500);
    expect((await request("do")).status).toBe(500);
    expect((await request("do")).status).toBe(502);
    expect(state.executor).toHaveBeenCalledTimes(2);
    expect(state.settle).not.toHaveBeenCalled();
    expect(state.rows.map(r => r.x402ExecutionAttempts.count)).toEqual([1, 1]);
    expect(state.rows.every(r => r.x402PaymentHash === null)).toBe(true);
  });
  it("counts transient retries in the same two-execution budget", async () => {
    state.capabilityType = "external_api";
    state.executor.mockRejectedValue(new Error("HTTP 503"));
    const first = request("do");
    await vi.advanceTimersByTimeAsync(1500);
    expect((await first).status).toBe(500);
    const second = request("do");
    await vi.advanceTimersByTimeAsync(1500);
    expect((await second).status).toBe(502);
    expect(state.executor).toHaveBeenCalledTimes(2);
    expect(state.rows[0].x402ExecutionAttempts.count).toBe(2);
  });
  it("retains unknown settlement intent and claim for reconciliation", async () => {
    state.settle.mockResolvedValue({ valid: false, settlementUnknown: true, error: "transport lost" });
    expect((await request("do")).status).toBe(402);
    expect(state.intents[0].state).toBe("settling");
    expect(state.rows[0]).toMatchObject({ status: "executing", x402PaymentHash: "same-payment-hash" });
    expect((await request("do")).status).toBe(502);
    expect(state.executor).toHaveBeenCalledTimes(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
  });
  it("retains a thrown facilitator call's claim and never counts it against health", async () => {
    state.settle.mockRejectedValue(new Error("transport threw"));
    expect((await request("do")).status).toBe(500);
    expect(state.rows[0]).toMatchObject({ status: "executing", x402PaymentHash: "same-payment-hash" });
    expect(state.intents[0].state).toBe("settling");
    expect((await request("do")).status).toBe(502);
    const { recordFailure } = await import("../lib/circuit-breaker.js");
    expect(recordFailure).not.toHaveBeenCalled();
  });
  it("captures terminal-write failure after settlement and returns the paid result", async () => {
    state.failRecord = true;
    const response = await request("do");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ free_tier: false, result: { output: output.output, price_cents: 5 } });
    expect(state.orphanRows).toHaveLength(1);
    expect(state.orphanRows[0]).toMatchObject({ settlementId: "settled-payment", priceCents: 5 });
    expect(state.logError.mock.calls.map(([name]) => name)).toEqual([
      "x402-transaction-recording-failed", "x402-orphan-settlement-recorded",
    ]);
    expect(state.rows[0].status).toBe("executing");
    const { recordFailure } = await import("../lib/circuit-breaker.js");
    expect(recordFailure).not.toHaveBeenCalled();
  });
  it("logs double storage failure and still returns success with the durable intent", async () => {
    state.failRecord = true; state.failOrphan = true;
    expect((await request("do")).status).toBe(200);
    expect(state.intents[0].state).toBe("settled");
    expect(state.logError.mock.calls.map(([name]) => name)).toContain("x402-orphan-settlement-write-also-failed");
  });
  it("keeps the completed transaction on mark-recorded failure and logs it", async () => {
    state.failRecorded = true;
    expect((await request("do")).status).toBe(200);
    expect(state.rows[0]).toMatchObject({ status: "completed", priceCents: 5 });
    expect(state.logError.mock.calls.map(([name]) => name)).toContain("x402-intent-mark-recorded-failed");
    const { recordFailure } = await import("../lib/circuit-breaker.js");
    expect(recordFailure).not.toHaveBeenCalled();
  });
  it("returns and stores the catalogue price as paid, without upgrade text", async () => {
    const response = await request("do");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ free_tier: false, result: { price_cents: 5 } });
    expect(body).not.toHaveProperty("upgrade");
    expect(body).not.toHaveProperty("unlocked");
    expect(state.rows[0]).toMatchObject({ priceCents: 5, paymentMethod: "x402", isFreeTier: false, receiptRail: "v1_do", complianceHashState: "pending" });
  });
  it("makes /v1/do claims visible to the existing stale janitor and fences late settlement", async () => {
    let finish!: (value: typeof output) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    state.executor.mockImplementation(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const pending = request("do");
    await started;
    vi.setSystemTime(Date.now() + 660_000);
    const { getDb } = await import("../db/index.js");
    const { releaseStaleX402Claims } = await import("../lib/x402-payment-claims.js");
    const released = await releaseStaleX402Claims(getDb(), 10);
    finish(output);
    const response = await pending;
    expect(released).toBe(1);
    expect(response.status).toBe(500);
    expect(state.settle).not.toHaveBeenCalled();
  });
});
