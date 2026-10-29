import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BEAT_INTERVAL_MS,
  FIRST_BEAT_DELAY_MS,
  startSqsRetirementHeartbeat,
} from "./sqs-schema-retirement.js";

describe("startSqsRetirementHeartbeat", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const start = (beat: () => Promise<boolean>, opts: { onError?: (e: unknown) => void; shuttingDown?: () => boolean } = {}) =>
    startSqsRetirementHeartbeat({ beat, onError: opts.onError ?? (() => {}), shuttingDown: opts.shuttingDown ?? (() => false) });

  it("never beats on the listen tick or inside Railway's healthcheck window", async () => {
    // A deployment that listens and then fails /health/deep is stopped within
    // seconds; it must not leave a beat that lets block 0132 drop the columns
    // under the old build that keeps serving.
    const beat = vi.fn(async () => true);
    start(beat);
    await vi.advanceTimersByTimeAsync(0);
    expect(beat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS - 1);
    expect(beat).not.toHaveBeenCalled();
    expect(FIRST_BEAT_DELAY_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("beats once the delay has passed, then on every interval", async () => {
    const beat = vi.fn(async () => true);
    start(beat);
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS);
    expect(beat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BEAT_INTERVAL_MS * 3);
    expect(beat).toHaveBeenCalledTimes(4);
  });

  it("does not beat once shutdown has begun", async () => {
    let shutting = false;
    const beat = vi.fn(async () => true);
    start(beat, { shuttingDown: () => shutting });
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS);
    expect(beat).toHaveBeenCalledTimes(1);
    shutting = true;
    await vi.advanceTimersByTimeAsync(BEAT_INTERVAL_MS * 3);
    expect(beat).toHaveBeenCalledTimes(1);
  });

  it("stop() ends the heartbeat, including before the first beat", async () => {
    const beat = vi.fn(async () => true);
    start(beat).stop();
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS + BEAT_INTERVAL_MS * 3);
    expect(beat).not.toHaveBeenCalled();
  });

  it("stops itself once a beat reports nothing is left to drop", async () => {
    const beat = vi.fn(async () => false);
    start(beat);
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS + BEAT_INTERVAL_MS * 3);
    expect(beat).toHaveBeenCalledTimes(1);
  });

  it("reports a failed beat and keeps beating", async () => {
    const onError = vi.fn();
    const beat = vi.fn(async () => { throw new Error("db down"); });
    start(beat, { onError });
    await vi.advanceTimersByTimeAsync(FIRST_BEAT_DELAY_MS + BEAT_INTERVAL_MS);
    expect(beat).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe("index.ts shutdown wiring", () => {
  it("withdraws the beat before the DB pool closes (cleanups run last-registered first)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(import.meta.dirname, "../index.ts"), "utf8");
    const pool = src.indexOf('onShutdown("db-pool"');
    const beat = src.indexOf('onShutdown("sqs-retirement-beat"');
    expect(pool).toBeGreaterThan(0);
    expect(beat).toBeGreaterThan(pool);
  });
});
