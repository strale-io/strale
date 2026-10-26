import { beforeEach, expect, it, vi } from "vitest";
import { boundDatabase, getDb } from "../db/index.js";
import { alertOnce } from "./alert-once.js";
import { sendAlert } from "./alerting.js";
import { recordInvocation } from "./invocation-facts.js";
import { outcomeFromOutput } from "./execution-outcome.js";
import { assertGuardedAllow, __resetCostMetaCacheForTests } from "../capabilities/guarded-executor.js";
vi.mock("../db/index.js", async (original) => ({
  ...await original<typeof import("../db/index.js")>(), getDb: vi.fn(),
}));
vi.mock("./alerting.js", () => ({ sendAlert: vi.fn().mockResolvedValue(true) }));
vi.mock("../capabilities/index.js", () => ({ getExecutor: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); __resetCostMetaCacheForTests(); });
const alert = { subject: "Sample budget", body: "Sample", severity: "warning" } as const;
it.each([false, true])("abort during alert cooldown cannot fail open or record an alert (query rejects: %s)", async (fails) => {
  const controller = new AbortController();
  const execute = vi.fn(async () => {
    controller.abort();
    if (fails) throw new Error("lookup failed");
    return [];
  });
  vi.mocked(getDb).mockReturnValue({ execute } as any);
  await expect(alertOnce("sample", 1000, { ...alert, db: { execute } as any, signal: controller.signal })).rejects.toThrow();
  expect(sendAlert).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledTimes(1);
});
it("an email already in flight cannot start alert bookkeeping after abort", async () => {
  const controller = new AbortController();
  const execute = vi.fn().mockResolvedValue([]);
  vi.mocked(getDb).mockReturnValue({ execute } as any);
  vi.mocked(sendAlert).mockImplementationOnce(async () => { controller.abort(); return true; });
  await expect(alertOnce("sample", 1000, { ...alert, db: { execute } as any, signal: controller.signal })).rejects.toThrow();
  expect(execute).toHaveBeenCalledTimes(1);
});
it("a fact INSERT failing after abort cannot start a failure-marker INSERT", async () => {
  const controller = new AbortController();
  const values = vi.fn(async () => { controller.abort(); throw new Error("insert failed"); });
  const insert = vi.fn(() => ({ values }));
  vi.mocked(getDb).mockReturnValue({ insert } as any);
  await expect(recordInvocation({ capabilitySlug: "sample-tool", rail: "onboarding", contextKind: "internal_test", latencyMs: 1, outcome: outcomeFromOutput("sample-tool", { ok: true }) }, { db: { insert } as any, signal: controller.signal })).rejects.toThrow();
  expect(insert).toHaveBeenCalledTimes(1);
  expect(values).toHaveBeenCalledTimes(1);
});
it("quota alert writes stay on the bounded handle and stop after abort", async () => {
  const controller = new AbortController();
  const execute = vi.fn()
    .mockResolvedValueOnce([{ slug: "sample-tool", cost_class: "free_quota", quota_window: "daily", quota_cap: 200 }])
    .mockResolvedValueOnce([{ test_count: 32, budget_cap: 40, alert_30_fired_at: null, alert_50_fired_at: null, alert_80_fired_at: null, hard_stop_fired_at: null }])
    .mockImplementationOnce(async () => { controller.abort(); return []; });
  const db = boundDatabase({ execute } as any, controller.signal);
  vi.mocked(getDb).mockImplementation(() => { throw new Error("must use explicit handle"); });
  await expect(assertGuardedAllow("sample-tool", { kind: "internal_test", suiteId: "onboard-script", reason: "manual" }, { db, signal: controller.signal })).rejects.toThrow();
  expect(execute).toHaveBeenCalledTimes(3);
  expect(getDb).not.toHaveBeenCalled();
  expect(sendAlert).not.toHaveBeenCalled();
  function check(value: unknown, seen = new Set<unknown>()) {
    expect(value).not.toBeInstanceOf(Date);
    expect(Buffer.isBuffer(value)).toBe(false);
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) check(child, seen);
  }
  for (const call of execute.mock.calls) for (const query of call) check(query);
});
