import { describe, it, expect, beforeEach } from "vitest";
import { onShutdown, isShuttingDown, _resetForTests, installShutdownHandlers } from "./shutdown.js";

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
});
