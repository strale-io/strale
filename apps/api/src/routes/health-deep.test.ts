/**
 * Tests for GET /health/deep — the DB write-path probe added after the
 * 2026-04-16 outage. /health (shallow) only confirms the process is
 * alive; /health/deep inserts and immediately deletes a probe row inside
 * two statements in one transaction, exercising every index on the
 * transactions table.
 *
 * WP7: the probe used to be a single data-modifying CTE whose DELETE ran
 * against a snapshot predating its own INSERT, so it never deleted anything and
 * leaked a permanent row on every call. The mock therefore has to model a
 * transaction now, not a bare execute.
 *
 * The endpoint must:
 *   1. Return 200 { status: "ok", write_path: "ok", latency_ms } on a
 *      healthy DB (mocked execute resolves without throwing).
 *   2. Return 503 { status: "degraded", write_path: "failed", error }
 *      on a broken DB (mocked execute rejects).
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// execute() is the method the probe calls, now inside a transaction. Toggle
// its behaviour per test via `executeImpl`.
let executeImpl: (...args: unknown[]) => Promise<unknown> = () => Promise.resolve([]);
let transactionSpy: () => void = () => {};

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (...args: unknown[]) => executeImpl(...args),
    // The probe wraps its INSERT + DELETE in a transaction so the DELETE can
    // see the INSERT. Hand the callback a tx whose execute is the same toggle,
    // so a rejecting executeImpl still surfaces as a failed probe.
    transaction: async (fn: (tx: { execute: (..._a: unknown[]) => Promise<unknown> }) => Promise<unknown>) => {
      transactionSpy();
      return fn({ execute: (...args: unknown[]) => executeImpl(...args) });
    },
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

beforeAll(async () => {
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  // Import app.ts here rather than inside the first test. Transforming its
  // module graph from cold can exceed the per-test timeout on a loaded
  // machine, failing these tests for a reason unrelated to /health/deep.
  await loadApp();
}, 120_000);

async function loadApp() {
  const { app } = await import("./../app.js");
  return app;
}

describe("GET /health/deep", () => {
  it("returns 200 with write_path=ok when the DB probe succeeds", async () => {
    // Shaped like a RETURNING id result so the probe finds a row to delete.
    executeImpl = () => Promise.resolve([{ id: "probe-row-id" }]);
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

  it("deletes the probe row it inserted (WP7: it used to leak one per call)", async () => {
    // The regression that matters. The old single-CTE form ran its DELETE
    // against a snapshot predating its own INSERT, so it matched nothing and
    // every call to this PUBLIC endpoint left a permanent row: 200 in August
    // alone. One such row, hashed with a null completed_at, captured the audit
    // chain head and acquired 150,719 children.
    // Counting statements is the discriminator, and it is exact: the old form
    // was ONE execute (a CTE), the fix is TWO (INSERT then DELETE) inside a
    // transaction. Drizzle's `sql` objects do not stringify to text, so the
    // count is a more honest assertion than pattern-matching a serialisation.
    let executeCount = 0;
    let transactionUsed = false;
    executeImpl = () => {
      executeCount += 1;
      return Promise.resolve([{ id: "probe-row-id" }]);
    };
    transactionSpy = () => {
      transactionUsed = true;
    };

    const { app } = await import("../app.js");
    const res = await app.request("http://localhost/health/deep");
    expect(res.status).toBe(200);

    expect(transactionUsed, "INSERT and DELETE must share a transaction").toBe(true);
    expect(
      executeCount,
      "two statements: a DELETE inside the same statement as its INSERT cannot see it",
    ).toBe(2);
  });
});
