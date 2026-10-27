import { afterEach, describe, expect, it, vi } from "vitest";
import { APIError, APIConnectionError, APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { withRetry } from "./retry.js";
import { withCallCost, setCostDeadline } from "./call-cost.js";

const apiError = (status: number, headers = new Headers()) => APIError.generate(status,
  { type: "error", error: { type: status === 429 ? "rate_limit_error" : "overloaded_error" } }, undefined, headers);
afterEach(() => vi.useRealTimers());
describe("real Anthropic SDK transient errors", () => {
  for (const error of [apiError(408), apiError(409), apiError(429), apiError(529), apiError(503),
    new APIConnectionError({}), new APIConnectionTimeoutError()]) {
    it(`retries ${error.constructor.name} ${error.status ?? "connection"} once then succeeds`, async () => {
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");
      expect(await withRetry(fn, { baseDelayMs: 0 })).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });
    it(`caps ${error.constructor.name} ${error.status ?? "connection"} at two attempts on failure`, async () => {
      const fn = vi.fn().mockRejectedValue(error);
      await expect(withRetry(fn, { maxRetries: 10, baseDelayMs: 0 })).rejects.toBe(error);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  }
  it.each([400, 401])("does not retry HTTP %s even with a misleading transient message", async (status) => {
    const error = APIError.generate(status, {}, "HTTP 503 fetch failed", new Headers());
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it.each(["2", new Date(Date.now() + 8_000).toUTCString()])("honours retry-after %s", async (header) => {
    vi.useFakeTimers();
    const error = apiError(429, new Headers({ "retry-after": header }));
    const wait = Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now();
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");
    const pending = withRetry(fn, { baseDelayMs: 0, maxDelayMs: 1 });
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("rejects an hour-long retry-after immediately without a deadline", async () => {
    vi.useFakeTimers();
    const error = apiError(429, new Headers({ "retry-after": "3600" }));
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withRetry(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not retry early when retry-after exceeds remaining caller budget", async () => withCallCost(async () => {
    vi.useFakeTimers();
    setCostDeadline(1000);
    const error = apiError(429, new Headers({ "retry-after": "5" }));
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withRetry(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }, 1));
});
