import { describe, expect, it, vi } from "vitest";
import { isTransientRun, retryTransientOnce, type CheckAttempt, type LiveRunShape } from "../scripts/record-upstream-retry.js";

const noWait = () => Promise.resolve();

const transientAttempt = (line = "live contract: executor threw: The operation was aborted due to timeout"): CheckAttempt => ({
  drift: [line, "no longer requested: GET https://example.test/data"],
  executorError: { name: "Error", message: line.replace("live contract: executor threw: ", "") },
  transient: true,
});

describe("retryTransientOnce", () => {
  it("passes when a transient failure is followed by a clean run", async () => {
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce(transientAttempt())
      .mockResolvedValueOnce({ drift: [], transient: false });

    await expect(retryTransientOnce(run, noWait)).resolves.toEqual({ drift: [], retried: true, unavailable: false });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports a second transient failure as the upstream unavailable, not drift", async () => {
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce(transientAttempt())
      .mockResolvedValueOnce(transientAttempt("live contract: executor threw: MF ČR unreliable-VAT SOAP returned HTTP 503"));

    await expect(retryTransientOnce(run, noWait)).resolves.toEqual({
      drift: [
        "live contract: executor threw: MF ČR unreliable-VAT SOAP returned HTTP 503 (after one retry)",
        "no longer requested: GET https://example.test/data (after one retry)",
      ],
      retried: true,
      unavailable: true,
    });
  });

  it("counts real drift found on the retry as drift", async () => {
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce(transientAttempt())
      .mockResolvedValueOnce({ drift: ["live contract: output.name: expected known answer"], transient: false });

    await expect(retryTransientOnce(run, noWait)).resolves.toEqual({
      drift: ["live contract: output.name: expected known answer (after one retry)"],
      retried: true,
      unavailable: false,
    });
  });

  it("does not retry or excuse a non-transient failure", async () => {
    const run = vi.fn<() => Promise<CheckAttempt>>().mockResolvedValue({
      drift: ["live contract: output.name: expected known answer"],
      transient: false,
    });

    await expect(retryTransientOnce(run, noWait)).resolves.toEqual({
      drift: ["live contract: output.name: expected known answer"],
      retried: false,
      unavailable: false,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("waits between the two attempts", async () => {
    const wait = vi.fn(noWait);
    const run = vi.fn<() => Promise<CheckAttempt>>()
      .mockResolvedValueOnce(transientAttempt())
      .mockResolvedValueOnce({ drift: [], transient: false });
    await retryTransientOnce(run, wait);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientRun", () => {
  const base: LiveRunShape = {
    failureCount: 1,
    executorError: { name: "Error", message: "MF ČR unreliable-VAT SOAP returned HTTP 503" },
    oversizeCount: 0,
    liveStatuses: [503],
    changedToStatuses: [503],
    recordingExpired: false,
  };

  it.each<[string, Partial<LiveRunShape>]>([
    ["the executor threw after a 503", {}],
    ["the executor threw after a 429", { liveStatuses: [429], changedToStatuses: [429] }],
    ["an executor TimeoutError with no answer", { executorError: { name: "TimeoutError", message: "x" }, liveStatuses: [], changedToStatuses: [] }],
    ["an executor AbortError", { executorError: { name: "AbortError", message: "x" }, liveStatuses: [], changedToStatuses: [] }],
    ["a fetch aborted on its timeout", { executorError: { name: "Error", message: "The operation was aborted due to timeout" }, liveStatuses: [], changedToStatuses: [] }],
  ])("is transient when %s", (_label, change) => {
    expect(isTransientRun({ ...base, ...change })).toBe(true);
  });

  it.each<[string, Partial<LiveRunShape>]>([
    ["a known-answer mismatch with no thrown executor", { executorError: undefined, liveStatuses: [200], changedToStatuses: [] }],
    ["a network error before any answer", { executorError: { name: "TypeError", message: "fetch failed" }, liveStatuses: [], changedToStatuses: [] }],
    ["the executor threw on a 200 answer", { liveStatuses: [200], changedToStatuses: [] }],
    ["a recorded 200 now answering 404", { liveStatuses: [503, 404], changedToStatuses: [503, 404] }],
    ["more than one failure", { failureCount: 2 }],
    ["an oversize body", { oversizeCount: 1 }],
    ["an expired recording", { recordingExpired: true }],
  ])("is not transient for %s", (_label, change) => {
    expect(isTransientRun({ ...base, ...change })).toBe(false);
  });
});
