import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { anyStepRetryable } from "./solution-step-failure.js";
import { targetUnavailable } from "./upstream-result.js";
import { inputRefusal } from "./capability-refusal.js";
import { recoveryDetails } from "./errors.js";

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

// Promise-audit T1 follow-up 42: each failed step keeps the advice its error
// carried when it was caught. Before, only the error string survived, and the
// bundle routes rebuilt generic advice from it.
describe("follow-up 42: a failed step's own advice", () => {
  // The tests above leave a queued answer behind; clearAllMocks keeps it.
  beforeEach(() => { state.executor.mockReset(); });
  it("a caller's site answering 404 is not retryable", async () => {
    state.executor.mockRejectedValueOnce(targetUnavailable("URL", 404));
    const result = await executeSolution("test-solution", { text: "hello" }, { userId: null });
    expect(result?.failures).toEqual([{ capability_slug: "test-llm", details: expect.objectContaining({ retryable: false }) }]);
    expect(anyStepRetryable(result!.failures)).toBe(false);
  });

  it("a refusal keeps its exact fix and field", async () => {
    state.executor.mockRejectedValueOnce(inputRefusal("'text' is too long.", "text", "Send 'text' under 1,000 characters."));
    const result = await executeSolution("test-solution", { text: "hello" }, { userId: null });
    expect(result?.failures[0]?.details).toMatchObject({ retryable: false, field: "text", fix: "Send 'text' under 1,000 characters." });
  });

  it("a transient failure of the caller's site stays retryable", async () => {
    vi.useFakeTimers();
    state.executor.mockImplementation(async () => { throw targetUnavailable("URL", 503); });
    const pending = executeSolution("test-solution", { text: "hello" }, { userId: null });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result?.failures[0]?.details).toMatchObject({ retryable: true });
    expect(anyStepRetryable(result!.failures)).toBe(true);
  });

  it("an untyped failure keeps the advice it had before", async () => {
    state.executor.mockRejectedValueOnce(new Error("Invalid email address"));
    const result = await executeSolution("test-solution", { text: "hello" }, { userId: null });
    expect(result?.failures[0]?.details).toEqual(recoveryDetails("execution_failed", "", { error: "Invalid email address" }));
    expect(result?.errors).toEqual(["test-llm: Invalid email address"]);
  });
});
