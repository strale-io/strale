import { expect, it, vi } from "vitest";
import { recordPiggybackResult, GuaranteedFieldWindow, GUARANTEED_WINDOW_MS, RELIABILITY_CACHE_TTL_MS } from "./piggyback-monitor.js";
import { sendAlert } from "./alerting.js";
import { testSuites, testResults } from "../db/schema.js";
const mock = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), reads: vi.fn(), reliability: { "nested.value": "guaranteed" } }));
vi.mock("../db/index.js", () => ({ getDb: () => ({
  select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => { if (table === testSuites) return [{ id: "suite" }]; mock.reads(); return [{ reliability: mock.reliability, category: "compliance" }]; } }) }) }),
  insert: (table: unknown) => ({ values: async (row: unknown) => { mock.insert(table, row); } }),
  update: (table: unknown) => ({ set: (row: unknown) => ({ where: async () => { mock.update(table, row); } }) }),
}) }));
vi.mock("./alerting.js", () => ({ sendAlert: vi.fn().mockResolvedValue(true) }));
it("alerts only after 20 calls, strictly above 10% per field, once per window", () => {
  const window = new GuaranteedFieldWindow();
  for (let i = 0; i < 19; i++) expect(window.observe("tool", i < 2 ? ["a"] : [], 0)).toBeNull();
  expect(window.observe("tool", [], 0)).toBeNull(); // 2/20 = 10%, no breach
  expect(window.observe("tool", ["a", "b"], 0)).toMatchObject({ calls: 21, fields: { a: 3 } });
  expect(window.observe("tool", ["a"], 0)).toBeNull();
  expect(window.observe("tool", ["a"], GUARANTEED_WINDOW_MS)).toBeNull();
});
it("keeps denominators per tool and fields independent", () => {
  const window = new GuaranteedFieldWindow();
  for (let i = 0; i < 19; i++) { window.observe("a", ["nested.value"], 0); window.observe("b", [], 0); }
  expect(window.observe("a", [], 0)).toMatchObject({ calls: 20, fields: { "nested.value": 19 } });
  expect(window.observe("b", ["x"], 0)).toBeNull();
});
it("retries failed delivery after a minute, at most three times per window", () => {
  const window = new GuaranteedFieldWindow();
  for (let i = 0; i < 19; i++) window.observe("tool", ["a"], 0);
  expect(window.observe("tool", ["a"], 0)).not.toBeNull();
  window.deliveryFailed("tool", 0);
  expect(window.observe("tool", ["a"], 59_999)).toBeNull();
  expect(window.observe("tool", ["a"], 60_000)).not.toBeNull();
  window.deliveryFailed("tool", 60_000);
  expect(window.observe("tool", ["a"], 120_000)).not.toBeNull();
  window.deliveryFailed("tool", 120_000);
  expect(window.observe("tool", ["a"], 180_000)).toBeNull();
});

it("real recording reads reliability, persists per-field misses and alerts without changing public claims", async () => {
  mock.insert.mockClear(); mock.update.mockClear(); vi.mocked(sendAlert).mockClear();
  for (let i = 0; i < 20; i++) await recordPiggybackResult("test-traffic-tool", { nested: {} }, { type: "object" }, 12);
  expect(mock.insert).toHaveBeenCalledTimes(20);
  expect(mock.insert).toHaveBeenCalledWith(testResults, expect.objectContaining({ capabilitySlug: "test-traffic-tool", passed: true, failureReason: "Guaranteed fields missing: nested.value" }));
  expect(sendAlert).toHaveBeenCalledOnce();
  expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("Petter decides") }));
  expect(mock.update).toHaveBeenCalledTimes(20);
});

it("preserves schema failures while recording guaranteed misses on the same row", async () => {
  mock.insert.mockClear();
  await recordPiggybackResult("schema-invalid", {}, { type: "object", required: ["required"] }, 10);
  expect(mock.insert).toHaveBeenCalledWith(testResults, expect.objectContaining({ passed: false,
    failureReason: "Output does not match output_schema; Guaranteed fields missing: nested.value" }));
});
it("caches reliability per slug and refreshes after the short TTL", async () => {
  vi.useFakeTimers();
  try {
    mock.reads.mockClear();
    await recordPiggybackResult("cache-tool", { nested: { value: 1 } }, {}, 10);
    await recordPiggybackResult("cache-tool", { nested: {} }, {}, 10);
    expect(mock.reads).toHaveBeenCalledTimes(1);
    await recordPiggybackResult("other-cache-tool", {}, {}, 10);
    expect(mock.reads).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(RELIABILITY_CACHE_TTL_MS);
    await recordPiggybackResult("cache-tool", {}, {}, 10);
    expect(mock.reads).toHaveBeenCalledTimes(3);
  } finally { vi.useRealTimers(); }
});
