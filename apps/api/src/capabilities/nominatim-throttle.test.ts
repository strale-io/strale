import { afterEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { createNominatimThrottle } from "./address-validate.js";
import "./address-geocode.js";
import { isRefusalMessage } from "../lib/capability-refusal.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";

// 2026-11-23: a paying buyer sent address-geocode calls concurrently. The old
// throttle let them all through at once and Nominatim refused every call for
// 16 minutes. These tests fail against that throttle.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Nominatim throttle", () => {
  it("spaces concurrent address-geocode calls at least 1.1 s apart", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
    const sentAt: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        sentAt.push(performance.now());
        return new Response(JSON.stringify([]), { status: 200 });
      }),
    );
    const geocode = getDirectExecutor("address-geocode")!;
    const calls = [0, 1, 2, 3].map((i) => geocode({ address: `Street ${i}, Stockholm` }));
    await vi.advanceTimersByTimeAsync(4_000);
    await Promise.all(calls);

    expect(sentAt).toHaveLength(4);
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i] - sentAt[i - 1]).toBeGreaterThanOrEqual(1100);
    }
  });

  it("refuses at once, reserving nothing, when the queue is longer than the cap", async () => {
    let t = 0;
    const throttle = createNominatimThrottle(1000, 2500, () => t);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const ok = [throttle(), throttle(), throttle(), throttle()]; // slots 0, 1000, 2000 ... 3000 is over the cap
    const refused = await ok[3].catch((e: Error) => e);
    expect((refused as Error).message).toMatch(/retry in 3 seconds/);
    // Unbilled and invisible to the breaker and the quality floor: the source is healthy.
    expect(isRefusalMessage((refused as Error).message)).toBe(true);
    expect(isUserInputError((refused as Error).message)).toBe(true);
    expect(classifyTransactionFailure((refused as Error).message)).toBe("caller_input");
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(ok.slice(0, 3));
    // The refused caller reserved nothing: the next free slot is still 3000.
    t = 3000;
    await expect(throttle()).resolves.toBeUndefined();
  });
});
