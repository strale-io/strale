/**
 * Probe cadence. The test scheduler asked for provider health on every
 * one-minute poll, so each outside source was probed ~1,000 times a day
 * (32,153 probes/day across 31 providers, 2026-10). These tests pin that the
 * scheduler reuses a recent run, that the reuse expires, and that concurrent
 * callers share one run instead of probing twice.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./dependency-manifest.js", () => ({
  getActiveProviders: () => [
    {
      name: "example",
      displayName: "Example",
      description: "",
      baseUrl: "https://example.test",
      authType: "none",
      healthProbe: { path: "/ping", method: "GET", healthyStatuses: [200], timeoutMs: 1000 },
      capabilities: [],
      tier: "free",
    },
  ],
}));
vi.mock("./fire-and-forget.js", () => ({ fireAndForget: () => {} }));
vi.mock("../db/index.js", () => ({ getDb: () => ({ insert: () => ({ values: async () => {} }) }) }));

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

const mod = await import("./dependency-health.js");
const { getRecentDependencyHealth, runDependencyHealthChecks, resetDependencyHealthCacheForTests, PROBE_REUSE_MS } = mod;

beforeEach(() => {
  resetDependencyHealthCacheForTests();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the scheduler reuses a recent probe run", () => {
  it("probes once for many polls inside the reuse window", async () => {
    for (let minute = 0; minute < 10; minute++) {
      vi.setSystemTime(new Date(Date.parse("2026-10-23T12:00:00Z") + minute * 60_000 + 1));
      const r = await getRecentDependencyHealth();
      expect(r.example.healthy).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("probes again once the last run is older than the window", async () => {
    await getRecentDependencyHealth();
    vi.setSystemTime(new Date(Date.now() + PROBE_REUSE_MS));
    await getRecentDependencyHealth();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the window at 10 minutes — far below ~1,000 probes a day per source", () => {
    expect(PROBE_REUSE_MS).toBe(10 * 60 * 1000);
    expect((24 * 60 * 60 * 1000) / PROBE_REUSE_MS).toBeLessThanOrEqual(144);
  });
});

describe("explicit runs stay fresh, but never doubled", () => {
  it("runDependencyHealthChecks probes even when a recent run exists", async () => {
    await runDependencyHealthChecks();
    await runDependencyHealthChecks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("concurrent callers share one in-flight run", async () => {
    await Promise.all([runDependencyHealthChecks(), getRecentDependencyHealth(), runDependencyHealthChecks()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("the per-poll caller is the one that reuses", () => {
  it("test-scheduler's skip-unhealthy check asks for a recent result, not a fresh probe", () => {
    const src = readFileSync(resolve(import.meta.dirname, "../jobs/test-scheduler.ts"), "utf8");
    const block = src.slice(src.indexOf("Check provider health"), src.indexOf("const skippedUnhealthy"));
    expect(block).toContain("getRecentDependencyHealth()");
    expect(block).not.toContain("runDependencyHealthChecks()");
  });
});
