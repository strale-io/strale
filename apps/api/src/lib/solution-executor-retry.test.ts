import { afterEach, expect, it, vi } from "vitest";
import { APIError } from "@anthropic-ai/sdk";

const state = vi.hoisted(() => ({ executor: vi.fn() }));
vi.mock("../db/index.js", () => ({ getDb: () => ({
  select: () => ({ from: () => ({ where: () => {
    const rows = [{ slug: "test-llm", capabilityType: "ai_generated", isActive: true, visible: true, lifecycleState: "active" }];
    return Object.assign(Promise.resolve(rows), { orderBy: async () => [{
      capabilitySlug: "test-llm", stepOrder: 0, inputMap: { text: "$input.text" },
      canParallel: false, parallelGroup: null, gateCondition: null,
    }] });
  } }) }),
}) }));
vi.mock("../capabilities/index.js", () => ({ getExecutor: () => state.executor }));
vi.mock("../capabilities/guarded-executor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../capabilities/guarded-executor.js")>(),
  assertGuardedAllow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./invocation-facts.js", () => ({ recordPaidInvocation: vi.fn().mockResolvedValue(undefined) }));
import { executeSolution, isSuccessfulStepOutput } from "./solution-executor.js";

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("a solution step succeeds after one real Anthropic 429", async () => {
  vi.useFakeTimers();
  state.executor.mockRejectedValueOnce(APIError.generate(429,
    { type: "error", error: { type: "rate_limit_error" } }, undefined, new Headers()))
    .mockResolvedValueOnce({ output: { answer: "done" }, provenance: { source: "test" } });
  const pending = executeSolution("test-solution", { text: "hello" }, { userId: null });
  await vi.advanceTimersByTimeAsync(1200);
  const result = await pending;
  expect(result?.errors).toEqual([]);
  expect(result?.steps["test-llm"]).toEqual({ answer: "done" });
  expect(isSuccessfulStepOutput(result?.steps["test-llm"])).toBe(true);
  expect(state.executor).toHaveBeenCalledTimes(2);
});

it("a solution step does not retry a non-transient Anthropic 400", async () => {
  state.executor.mockRejectedValueOnce(APIError.generate(400,
    { type: "error", error: { type: "invalid_request_error" } }, undefined, new Headers()))
    .mockResolvedValueOnce({ output: { answer: "should not run" }, provenance: { source: "test" } });
  const result = await executeSolution("test-solution", { text: "hello" }, { userId: null });
  expect(result?.errors.length).toBeGreaterThan(0);
  expect(state.executor).toHaveBeenCalledTimes(1);
});
