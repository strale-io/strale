/**
 * Tests for GET /health/deep — the DB write-path probe added after the
 * 2026-04-16 outage. /health (shallow) only confirms the process is
 * alive; /health/deep inserts and immediately deletes a probe row inside
 * a single CTE, exercising every index on the transactions table.
 *
 * The endpoint must:
 *   1. Return 200 { status: "ok", write_path: "ok", latency_ms } on a
 *      healthy DB (mocked execute resolves without throwing).
 *   2. Return 503 { status: "degraded", write_path: "failed", error }
 *      on a broken DB (mocked execute rejects).
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// execute() is the single method /health/deep calls. Toggle its behaviour
// per test via `executeImpl`.
let executeImpl: () => Promise<unknown> = () => Promise.resolve([]);

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (..._args: unknown[]) => executeImpl(),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
        innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }),
      }),
    }),
  }),
}));

// Same MCP route stub as internal-auth.test.ts — app.ts imports it at
// module-load and vitest's resolver can't find the workspace package
// without a prior build.
vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

beforeAll(() => {
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
});

async function loadApp() {
  const { app } = await import("./../app.js");
  return app;
}

describe("GET /health/deep", () => {
  it("returns 200 with write_path=ok when the DB probe succeeds", async () => {
    executeImpl = () => Promise.resolve([]);
    const app = await loadApp();
    const res = await app.request("/health/deep");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.write_path).toBe("ok");
    expect(typeof body.latency_ms).toBe("number");
  });

  it("returns 503 with write_path=failed when the DB probe throws", async () => {
    executeImpl = () =>
      Promise.reject(new Error("connection refused on probe insert"));
    const app = await loadApp();
    const res = await app.request("/health/deep");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.write_path).toBe("failed");
    // The error message surfaces the underlying cause so Railway log
    // viewers can see WHY the deep check failed — don't swallow it.
    expect(body.error).toContain("connection refused");
    expect(typeof body.latency_ms).toBe("number");
  });
});
