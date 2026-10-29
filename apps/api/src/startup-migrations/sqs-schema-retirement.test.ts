import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BEAT_INTERVAL_MS,
  FIRST_BEAT_DELAY_MS,
  startSqsRetirementHeartbeat,
} from "./sqs-schema-retirement.js";

describe("startSqsRetirementHeartbeat", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("never beats on the listen tick or inside Railway's healthcheck window", async () => {
    // A deployment that listens and then fails /health/deep is stopped within
    // seconds; it must not leave a marker that lets block 0132 drop the
    // columns under the old build that keeps serving.
    const beat = vi.fn(async () => {});
    startSqsRetirementHeartbeat(beat, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(beat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS - 1);
    expect(beat).not.toHaveBeenCalled();
    expect(FIRST_BEAT_DELAY_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("beats once the delay has passed, then on every interval", async () => {
    const beat = vi.fn(async () => {});
    startSqsRetirementHeartbeat(beat, () => {});
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS);
    expect(beat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BEAT_INTERVAL_MS * 3);
    expect(beat).toHaveBeenCalledTimes(4);
  });

  it("reports a failed beat and keeps beating", async () => {
    const onError = vi.fn();
    const beat = vi.fn(async () => { throw new Error("db down"); });
    startSqsRetirementHeartbeat(beat, onError);
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS + BEAT_INTERVAL_MS);
    expect(beat).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
