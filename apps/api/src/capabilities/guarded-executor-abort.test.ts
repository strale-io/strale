import { beforeEach, expect, it, vi } from "vitest";
import { guardedExecute, seedCostMetaForOnboarding, __resetCostMetaCacheForTests } from "./guarded-executor.js";
import { getExecutor } from "./index.js";
import { recordInvocation } from "../lib/invocation-facts.js";
import { getDb } from "../db/index.js";
vi.mock("./index.js", () => ({ getExecutor: vi.fn() }));
vi.mock("../lib/invocation-facts.js", () => ({ recordInvocation: vi.fn() }));
vi.mock("../db/index.js", () => ({ getDb: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); __resetCostMetaCacheForTests(); });
const context = { kind: "internal_test", suiteId: "onboard-script", reason: "manual" } as const;
it.each(["resolve", "reject"] as const)("late executor %s cannot write an invocation after abort", async (outcome) => {
  seedCostMetaForOnboarding({ slug: "sample-tool", cost_class: "free_unlimited", quota_window: null, quota_cap: null, quota_reset_dom: null });
  let complete!: () => void;
  const executor = vi.fn(() => new Promise<any>((resolve, reject) => {
    complete = () => outcome === "resolve" ? resolve({ output: { ok: true } }) : reject(new Error("late failure"));
  }));
  vi.mocked(getExecutor).mockReturnValue(executor);
  const controller = new AbortController();
  const pending = guardedExecute("sample-tool", {}, context, "onboarding", { signal: controller.signal });
  await vi.waitFor(() => expect(executor).toHaveBeenCalled());
  controller.abort();
  complete();
  await expect(pending).rejects.toThrow();
  expect(recordInvocation).not.toHaveBeenCalled();
});
it("an abort during quota metadata lookup cannot write a budget counter or start the executor", async () => {
  const controller = new AbortController();
  vi.mocked(getExecutor).mockReturnValue(vi.fn().mockResolvedValue({ output: { ok: true } }));
  const execute = vi.fn(async () => {
    controller.abort();
    return [{ slug: "sample-tool", cost_class: "free_quota", quota_window: "daily", quota_cap: 200 }];
  });
  vi.mocked(getDb).mockReturnValue({ execute } as any);
  await expect(guardedExecute("sample-tool", {}, context, "onboarding", { signal: controller.signal })).rejects.toThrow();
  expect(getExecutor).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(recordInvocation).not.toHaveBeenCalled();
});
