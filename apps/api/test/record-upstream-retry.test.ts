import { describe, expect, it, vi } from "vitest";
import { retryTimeoutOnce, type CheckAttempt } from "../scripts/record-upstream-retry.js";

const timeout = (message = "live contract: executor threw: The operation was aborted due to timeout"): CheckAttempt => ({
  drift: [message, "no longer requested: GET https://example.test/data"],
  executorError: { name: "Error", message: message.replace("live contract: executor threw: ", "") },
  hasNonTimeoutFailure: false,
});

describe("retryTimeoutOnce", () => {
  it("passes when a timeout is followed by a clean run", async () => {
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce(timeout())
      .mockResolvedValueOnce({ drift: [], hasNonTimeoutFailure: false });

    await expect(retryTimeoutOnce(run)).resolves.toEqual({ drift: [], retried: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([
    "TimeoutError",
    "AbortError",
  ])("recognises an executor %s as a retryable timeout", async (errorName) => {
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce({
        drift: [`live contract: executor threw: ${errorName}`],
        executorError: { name: errorName, message: "operation aborted" },
        hasNonTimeoutFailure: false,
      })
      .mockResolvedValueOnce({ drift: [], hasNonTimeoutFailure: false });

    await expect(retryTimeoutOnce(run)).resolves.toEqual({ drift: [], retried: true });
  });

  it("reports only the second timeout after one retry", async () => {
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce(timeout())
      .mockResolvedValueOnce(timeout("live contract: executor threw: TimeoutError"));

    await expect(retryTimeoutOnce(run)).resolves.toEqual({
      drift: [
        "live contract: executor threw: TimeoutError (after one retry)",
        "no longer requested: GET https://example.test/data (after one retry)",
      ],
      retried: true,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([
    "live contract: output.name: expected known answer",
    "live contract: executor threw: fetch failed",
  ])("does not retry a non-timeout failure: %s", async (failure) => {
    const run = vi.fn<() => Promise<CheckAttempt>>().mockResolvedValue({
      drift: [failure],
      executorError: failure.endsWith("fetch failed") ? { name: "TypeError", message: "fetch failed" } : undefined,
      hasNonTimeoutFailure: !failure.endsWith("fetch failed"),
    });

    await expect(retryTimeoutOnce(run)).resolves.toEqual({ drift: [failure], retried: false });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
