import { describe, it, expect, beforeEach } from "vitest";
import {
  onShutdown,
  isShuttingDown,
  _resetForTests,
  installShutdownHandlers,
  trackBackgroundTask,
  getInflightTaskCount,
} from "./shutdown.js";

describe("shutdown", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("isShuttingDown is false before any signal", () => {
    expect(isShuttingDown()).toBe(false);
  });

  it("onShutdown registrations are accepted in any order", () => {
    onShutdown("first", () => {});
    onShutdown("second", async () => {});
    expect(isShuttingDown()).toBe(false);
  });

  it("installShutdownHandlers is idempotent", () => {
    // If installed twice, second call must be a no-op so we don't end up with
    // duplicate SIGTERM handlers (which would call cleanups twice).
    const beforeCount = process.listenerCount("SIGTERM");
    installShutdownHandlers();
    const afterFirst = process.listenerCount("SIGTERM");
    installShutdownHandlers();
    const afterSecond = process.listenerCount("SIGTERM");
    expect(afterFirst).toBe(beforeCount + 1);
    expect(afterSecond).toBe(afterFirst);
    // Cleanup so we don't pollute other tests
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("trackBackgroundTask increments and decrements the inflight set", async () => {
    expect(getInflightTaskCount()).toBe(0);
    let resolveTask: () => void;
    const task = new Promise<void>((resolve) => { resolveTask = resolve; });
    const tracked = trackBackgroundTask("test-task", task);
    expect(getInflightTaskCount()).toBe(1);
    resolveTask!();
    await tracked;
    // Microtask flush — finally() decrements after the awaited promise resolves
    await Promise.resolve();
    expect(getInflightTaskCount()).toBe(0);
  });

  it("trackBackgroundTask cleans up on rejection too", async () => {
    expect(getInflightTaskCount()).toBe(0);
    const task = Promise.reject(new Error("simulated"));
    const tracked = trackBackgroundTask("failing-task", task);
    expect(getInflightTaskCount()).toBe(1);
    await tracked.catch(() => {/* expected */});
    await Promise.resolve();
    expect(getInflightTaskCount()).toBe(0);
  });
});
