/**
 * Tests for fire-and-forget.ts (F-0-009).
 *
 * The helper must:
 *   1. Never throw synchronously.
 *   2. Never reject (it's fire-and-forget).
 *   3. Log via logError with the supplied label + context on rejection.
 *   4. Be a no-op on success (no noise in the log).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const errorMock = vi.fn();
vi.mock("./log.js", () => ({
  logError: (label: string, err: unknown, ctx?: unknown) => errorMock(label, err, ctx),
}));

beforeEach(() => {
  errorMock.mockReset();
});

describe("fireAndForget (F-0-009)", () => {
  it("does not throw synchronously when fn rejects", async () => {
    const { fireAndForget } = await import("./fire-and-forget.js");
    expect(() =>
      fireAndForget(() => Promise.reject(new Error("boom")), {
        label: "sync-throw-test",
      }),
    ).not.toThrow();
    // Give the microtask queue a chance to run the .catch.
    await new Promise((r) => setImmediate(r));
    expect(errorMock).toHaveBeenCalledOnce();
  });

  it("catches a synchronous throw inside fn", async () => {
    const { fireAndForget } = await import("./fire-and-forget.js");
    fireAndForget(() => { throw new Error("sync"); }, { label: "sync-inside" });
    await new Promise((r) => setImmediate(r));
    expect(errorMock).toHaveBeenCalledOnce();
    expect(errorMock.mock.calls[0][0]).toBe("sync-inside");
  });

  it("passes label + context to logError on rejection", async () => {
    const { fireAndForget } = await import("./fire-and-forget.js");
    fireAndForget(() => Promise.reject(new Error("x")), {
      label: "integrity-hash-store",
      context: { transactionId: "txn-1", slug: "iban-validate" },
    });
    await new Promise((r) => setImmediate(r));
    expect(errorMock).toHaveBeenCalledWith(
      "integrity-hash-store",
      expect.any(Error),
      { transactionId: "txn-1", slug: "iban-validate" },
    );
  });

  it("does NOT log on success", async () => {
    const { fireAndForget } = await import("./fire-and-forget.js");
    fireAndForget(() => Promise.resolve("ok"), { label: "success-test" });
    await new Promise((r) => setImmediate(r));
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("does not propagate the rejection to the caller's promise chain", async () => {
    const { fireAndForget } = await import("./fire-and-forget.js");
    // If fireAndForget propagated, the outer await would reject.
    await expect(
      (async () => {
        fireAndForget(() => Promise.reject(new Error("nope")), { label: "no-propagate" });
        return "parent-done";
      })(),
    ).resolves.toBe("parent-done");
  });
});
