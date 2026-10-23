/**
 * A probe reads only the status line. Its body must be released, not left
 * unread: an unread fetch body keeps its connection checked out until garbage
 * collection, and the probes run on every scheduler poll (~1,000 times a day
 * per provider in 2026-10).
 */
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

let cancelled = 0;
function responseWithTrackedBody(status: number): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{}"));
    },
    cancel() {
      cancelled++;
    },
  });
  return new Response(body, { status });
}

beforeEach(() => {
  cancelled = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dependency probes release the response body", () => {
  // 401 takes the unhealthy branch without the runner's 5s retry sleep.
  it.each([200, 401])("cancels the body of a %i answer", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => responseWithTrackedBody(status)));
    const { runDependencyHealthChecks } = await import("./dependency-health.js");
    const results = await runDependencyHealthChecks();
    expect(results.example.healthy).toBe(status === 200);
    await new Promise((r) => setTimeout(r, 0));
    expect(cancelled).toBeGreaterThanOrEqual(1);
  });
});
