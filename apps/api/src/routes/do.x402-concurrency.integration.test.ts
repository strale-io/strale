/** Real Postgres claim admission through /v1/do; only vendor work is simulated. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { useTestDatabase } from "../test-support/integration-db.js";
import { capabilities, transactions, x402SettlementIntents } from "../db/schema.js";

const state = vi.hoisted(() => ({ executor: vi.fn(), settle: vi.fn() }));
// Keep verification/settlement off-chain. Claims, intent transitions, unique
// constraints and transactions use the real application database connection.
vi.mock("../lib/x402-gateway.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/x402-gateway.js")>(),
  isX402Configured: () => true,
  verifyX402PaymentOnly: async () => ({ valid: true, verified: {} }),
  extractPayerAddress: () => null,
  settleX402Payment: state.settle,
}));
vi.mock("../capabilities/index.js", () => ({ getExecutor: () => state.executor }));
vi.mock("../capabilities/guarded-executor.js", async importOriginal => ({
  ...await importOriginal<typeof import("../capabilities/guarded-executor.js")>(), assertGuardedAllow: vi.fn(),
}));
// Ancillary background writes are outside this concurrency invariant.
vi.mock("../lib/circuit-breaker.js", () => ({ checkCircuitBreaker: async () => ({ allowed: true }), recordSuccess: vi.fn(), recordFailure: vi.fn() }));
vi.mock("../lib/invocation-facts.js", () => ({ recordAnonymousInvocation: vi.fn().mockResolvedValue(undefined), computeServedFree: (paid: unknown) => !paid }));
vi.mock("../lib/quality-capture.js", () => ({ recordQuality: vi.fn() }));
vi.mock("../lib/piggyback-monitor.js", () => ({ recordPiggybackResult: vi.fn() }));
vi.mock("../lib/event-triggers.js", () => ({ triggerOnFailure: vi.fn() }));
vi.mock("../lib/receipt/settle.js", () => ({ settleExecutionReceipt: vi.fn() }));
vi.mock("../lib/audit-token.js", () => ({ getShareableUrl: () => ({ url: "https://example.test/audit", expiresAt: "2026-10-29T00:00:00.000Z" }) }));

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;
describeMaybe("/v1/do x402 concurrent payment hash against Postgres", () => {
  let getDb: typeof import("../db/index.js").getDb;
  let closeDbPool: typeof import("../db/index.js").closeDbPool;
  let app: Hono;
  let paymentHash: string;
  const capabilityId = randomUUID();
  const slug = `h4b-x402-${randomUUID().slice(0, 8)}`;
  const payment = `test-signed-${randomUUID()}`;
  const settlementId = `test-settlement-${randomUUID()}`;
  beforeAll(async () => {
    ({ getDb, closeDbPool } = await import("../db/index.js"));
    const { hashPaymentHeader } = await import("../lib/x402-gateway.js");
    paymentHash = hashPaymentHeader(payment);
    await getDb().insert(capabilities).values({
      id: capabilityId, slug, name: "H4b concurrency probe", description: "Test-only concurrent x402 admission probe.",
      category: "developer-tools", priceCents: 5, isActive: true, visible: true,
      x402Enabled: true, isFreeTier: false, lifecycleState: "active", capabilityType: "deterministic",
      transparencyTag: "algorithmic", avgLatencyMs: 50,
      inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      outputSchema: { type: "object", properties: { answer: { type: "string" } } },
    });
    const { doRoute } = await import("./do.js");
    app = new Hono().route("/v1", doRoute);
    state.settle.mockResolvedValue({ valid: true, settlementId });
  });
  afterAll(async () => {
    if (!getDb) return;
    await getDb().delete(x402SettlementIntents).where(eq(x402SettlementIntents.paymentHash, paymentHash));
    await getDb().delete(transactions).where(eq(transactions.capabilityId, capabilityId));
    await getDb().delete(capabilities).where(eq(capabilities.id, capabilityId));
    await closeDbPool();
  });
  const call = () => app.request("/v1/do", {
    method: "POST", headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": payment },
    body: JSON.stringify({ capability_slug: slug, inputs: { value: "test" }, max_price_cents: 5 }),
  });
  it("allows exactly one execution and settlement while the same hash is in flight", async () => {
    let finish!: () => void;
    let entered!: () => void;
    const running = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const result = { output: { answer: "done" }, provenance: { source: "h4b-test" } };
    state.executor.mockImplementation(async () => { entered(); await gate; return result; });
    const first = call();
    // Also wait for the request to finish: a route rejection must fail the test
    // immediately instead of hanging forever waiting for an executor it missed.
    await Promise.race([running, first.then(response => { throw new Error(`First request ended before execution: ${response.status}`); })]);
    state.executor.mockResolvedValue(result);
    let second: Response;
    try { second = await call(); } finally { finish(); }
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
    expect(second!.status).toBe(502);
    expect(state.executor).toHaveBeenCalledTimes(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
    const rows = await getDb().select().from(transactions).where(eq(transactions.x402PaymentHash, paymentHash));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "completed", priceCents: 5, paymentMethod: "x402", isFreeTier: false,
      x402SettlementId: settlementId, x402ExecutionAttempts: { paymentHash, count: 1 } });
    const intents = await getDb().select().from(x402SettlementIntents).where(eq(x402SettlementIntents.paymentHash, paymentHash));
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ state: "recorded", transactionId: rows[0]!.id });
    expect((await call()).status).toBe(200);
    expect(state.executor).toHaveBeenCalledTimes(1);
    expect(state.settle).toHaveBeenCalledTimes(1);
  }, 30_000);
});
