import { describe, expect, it, vi, beforeEach } from "vitest";
import { APIError } from "@anthropic-ai/sdk";
import { MODELS } from "./models.js";
import { withCallCost, recordLlmUsage, recordVendorCost, snapshotCallCost, setCostDeadline, remainingCallMs, withExpectedLlmUsage } from "./call-cost.js";
const { sdkCreate, constructor, logInfo } = vi.hoisted(() => ({ sdkCreate: vi.fn(), constructor: vi.fn(), logInfo: vi.fn() }));
vi.mock("./log.js", () => ({ log: { info: logInfo }, logWarn: vi.fn(), logError: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => ({ ...await importOriginal<typeof import("@anthropic-ai/sdk")>(), default: function (opts: unknown) { constructor(opts); return { messages: { create: sdkCreate } }; } }));
import { createAnthropicClient } from "./anthropic-client.js";
import { executeWithTransientRetry } from "./retry.js";
beforeEach(() => { vi.clearAllMocks(); });
describe("usage and request isolation", () => {
  it("charges input/output and both cache TTLs once, without adding cache tokens to base input", () => withCallCost(() => {
    recordLlmUsage(MODELS.capability_default.id, { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50,
      cache_creation_input_tokens: 40, cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 30 } });
    expect(Number(snapshotCallCost().cost_cents)).toBeCloseTo((100 + 50 + 5 + 20 + 37.5) / 10000 / 2, 9);
    expect(snapshotCallCost().cost_breakdown.llm).toHaveLength(1);
  }, 2));
  it("keeps concurrent and parallel solution usage isolated by request, additive within one request", async () => {
    const results = await Promise.all([10, 20].map((tokens) => withCallCost(async () => {
      await Promise.all([1, 2].map(async () => { await Promise.resolve(); recordLlmUsage(MODELS.capability_default.id, { input_tokens: tokens, output_tokens: 0 }); }));
      return snapshotCallCost();
    }, 1)));
    expect(results.map((r) => Number(r.cost_cents))).toEqual([0.002, 0.004]);
  });
  it("preserves partial known costs but returns NULL for missing usage or unpriced vendors", () => withCallCost(() => {
    recordLlmUsage(MODELS.capability_default.id, { input_tokens: 100, output_tokens: 0 });
    recordVendorCost("dilisense", 1);
    expect(snapshotCallCost().cost_cents).toBeNull();
    expect(snapshotCallCost().cost_breakdown.known_cost_cents).toBe(0.01);
    expect(snapshotCallCost().cost_breakdown.unknowns).toContain("dilisense:allowance_or_plan_unit_price_unknown");
  }, 1));
  it("prices Serper Starter successful credits, preserves uncertainty on network errors and ignores zero-unit probes", () => withCallCost(() => {
    recordVendorCost("serper", 2, "success"); recordVendorCost("serper", 1, "failure"); recordVendorCost("dilisense", 0);
    expect(Number(snapshotCallCost().cost_cents)).toBe(0.2);
    recordVendorCost("serper", 1);
    expect(snapshotCallCost().cost_cents).toBeNull();
  }, 1));
  it("does not manufacture a zero without a context or usage", () => {
    expect(snapshotCallCost().cost_cents).toBeNull();
    withCallCost(() => { recordLlmUsage(MODELS.digest.id); expect(snapshotCallCost().cost_cents).toBeNull(); }, 1);
  });
  it("prices the search role's prompt-length tier and cache tokens", () => withCallCost(() => {
    recordLlmUsage(MODELS.search_rank.id, { input_tokens: 100_001, output_tokens: 1 });
    expect(Number(snapshotCallCost().cost_cents)).toBeCloseTo(5.0003);
  }, 1));
});
describe("factory timeout and sole retry layer", () => {
  const params = { model: MODELS.capability_default.id, max_tokens: 10, messages: [{ role: "user" as const, content: "test" }] };
  it("enforces SDK retries=0, takes remaining budget at call time, records usage before returning", async () => withCallCost(async () => {
    setCostDeadline(5000);
    sdkCreate.mockResolvedValue({ usage: { input_tokens: 10, output_tokens: 5 } });
    const client = createAnthropicClient({ apiKey: "test", maxRetries: 20 });
    await client.messages.create(params, { maxRetries: 30 });
    expect(constructor.mock.calls[0]![0]).toMatchObject({ maxRetries: 0 });
    expect(sdkCreate.mock.calls[0]![1]).toMatchObject({ maxRetries: 0 });
    expect(sdkCreate.mock.calls[0]![1].timeout).toBeLessThanOrEqual(5000);
    expect(Number(snapshotCallCost().cost_cents)).toBe(0.0035);
  }, 1));
  it("at most two HTTP attempts through the real executor retry policy, including unknown first-attempt cost", async () => withCallCost(async () => {
    sdkCreate.mockRejectedValueOnce(APIError.generate(503, { type: "error", error: { type: "overloaded_error" } }, "upstream", new Headers())).mockResolvedValueOnce({ usage: { input_tokens: 10, output_tokens: 0 } });
    await executeWithTransientRetry(async () => createAnthropicClient({ apiKey: "test" }).messages.create(params), {}, { slug: "test", capabilityType: "mixed" });
    expect(sdkCreate).toHaveBeenCalledTimes(2);
    expect(constructor.mock.calls.every((c) => c[0].maxRetries === 0)).toBe(true);
    expect(snapshotCallCost().cost_cents).toBeNull();
    expect(snapshotCallCost().cost_breakdown.unknowns).toContain("anthropic_failed_attempt_usage_unavailable");
  }, 1));
  it("records usage for digest/CLI calls outside HTTP context as an isolated cost event", async () => {
    sdkCreate.mockResolvedValue({ usage: { input_tokens: 10, output_tokens: 0 } });
    await createAnthropicClient({ apiKey: "test" }).messages.create(params);
    expect(logInfo).toHaveBeenCalledWith(expect.objectContaining({ label: "standalone-llm-cost", cost_cents: expect.any(String) }), "standalone-llm-cost");
    expect(snapshotCallCost().cost_cents).toBeNull();
  });
  it("records a standalone failed attempt as unknown and preserves its original error", async () => {
    const error = APIError.generate(503, { type: "error", error: { type: "overloaded_error" } }, "upstream", new Headers());
    sdkCreate.mockRejectedValue(error);
    await expect(createAnthropicClient({ apiKey: "test" }).messages.create(params)).rejects.toBe(error);
    expect(logInfo).toHaveBeenCalledWith(expect.objectContaining({ label: "standalone-llm-cost", cost_cents: null,
      cost_breakdown: expect.objectContaining({ unknowns: ["anthropic_failed_attempt_usage_unavailable"] }) }), "standalone-llm-cost");
  });
  it("refuses an exhausted budget before contacting the vendor", () => withCallCost(() => {
    setCostDeadline(-1);
    expect(() => remainingCallMs()).toThrow(/budget exhausted/);
    expect(() => createAnthropicClient({ apiKey: "test" })).toThrow(/budget exhausted/);
    expect(constructor).not.toHaveBeenCalled();
  }, 1));
});

it("snapshots in-flight SDK requests as unknown even before they settle", async () => withCallCost(async () => {
  let resolve!: (value: unknown) => void;
  sdkCreate.mockReturnValue(new Promise((r) => { resolve = r; }));
  const pending = createAnthropicClient({ apiKey: "test" }).messages.create({
    model: MODELS.capability_default.id, max_tokens: 10, messages: [{ role: "user", content: "test" }],
  });
  const snapshot = snapshotCallCost();
  expect(snapshot.cost_cents).toBeNull();
  expect(snapshot.cost_breakdown.unknowns).toContain("llm_in_flight_or_unmetered");
  resolve({ usage: { input_tokens: 10, output_tokens: 0 } });
  await pending;
  expect(Number(snapshotCallCost().cost_cents)).toBe(0.001);
  expect(snapshot.cost_cents).toBeNull();
}, 1));
it("marks an expected LLM capability with no recorded usage as unknown", async () => withCallCost(async () => {
  await withExpectedLlmUsage(async () => {
    expect(snapshotCallCost().cost_cents).toBeNull();
    expect(snapshotCallCost().cost_breakdown.unknowns).toContain("llm_in_flight_or_unmetered");
  });
  expect(snapshotCallCost().cost_cents).toBeNull();
}, 1));
it("parallel metered usage cannot mask another capability's missing usage", async () => withCallCost(async () => {
  await Promise.all([
    withExpectedLlmUsage(async () => { await Promise.resolve(); recordLlmUsage(MODELS.capability_default.id, { input_tokens: 10, output_tokens: 0 }); }),
    withExpectedLlmUsage(async () => { await new Promise(r => setTimeout(r, 0)); }),
  ]);
  expect(snapshotCallCost().cost_cents).toBeNull();
  expect(snapshotCallCost().cost_breakdown.unknowns).toContain("llm_in_flight_or_unmetered");
}, 1));
it("honours a per-call timeout when no constructor timeout was provided", async () => {
  sdkCreate.mockResolvedValue({ usage: { input_tokens: 1, output_tokens: 1 } });
  await createAnthropicClient({ apiKey: "test" }).messages.create({
    model: MODELS.capability_default.id, max_tokens: 1, messages: [{ role: "user", content: "test" }],
  }, { timeout: 60_000 });
  expect(sdkCreate.mock.lastCall?.[1].timeout).toBe(60_000);
});
