/**
 * Test placeholder for db-rate-limit.ts (F-0-002).
 *
 * Filename ends in `.test.todo.ts` because vitest is not installed yet
 * (FIX_PHASE_A_verification.md Q3). Phase D flips it to `.test.ts`.
 *
 * These cases need a real Postgres to exercise the atomic INSERT ... ON
 * CONFLICT path. For unit-level CI, a Testcontainers Postgres or a single
 * shared DB per test file is the cleanest option.
 */

/*
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimitByIpDb } from "./db-rate-limit.js";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

describe("rateLimitByIpDb (F-0-002)", () => {
  beforeEach(async () => {
    // Fresh counters each test — otherwise a prior test's rows leak in.
    const db = getDb();
    await db.execute(sql`TRUNCATE TABLE rate_limit_counters`);
  });

  function makeApp(max: number, windowSeconds: number) {
    const app = new Hono();
    app.use(
      "*",
      rateLimitByIpDb({ windowSeconds, max, scope: "test" }),
    );
    app.get("/", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows the first `max` calls, denies call max+1", async () => {
    const app = makeApp(2, 60);
    const headers = { "x-forwarded-for": "203.0.113.1" };
    for (let i = 0; i < 2; i++) {
      const res = await app.request("/", { headers });
      expect(res.status).toBe(200);
    }
    const denied = await app.request("/", { headers });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("resets on a new window", async () => {
    // Window rollover is tricky to test without clock mocking. At minimum
    // assert that a disjoint identifier gets a fresh quota (proves row
    // separation).
    const app = makeApp(1, 60);
    expect((await app.request("/", { headers: { "x-forwarded-for": "10.0.0.1" } })).status).toBe(200);
    expect((await app.request("/", { headers: { "x-forwarded-for": "10.0.0.2" } })).status).toBe(200);
  });

  it("fails CLOSED when the DB is unreachable (returns 503, not 200)", async () => {
    // Drop the table to simulate a DB failure. The middleware must respond
    // 503, not allow the request through.
    const db = getDb();
    await db.execute(sql`ALTER TABLE rate_limit_counters RENAME TO rate_limit_counters_tmp`);
    try {
      const app = makeApp(5, 60);
      const res = await app.request("/", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      expect(res.status).toBe(503);
    } finally {
      await db.execute(sql`ALTER TABLE rate_limit_counters_tmp RENAME TO rate_limit_counters`);
    }
  });

  it("rejects requests with no extractable IP when rejectUnknownIp is true", async () => {
    const app = new Hono();
    app.use(
      "*",
      rateLimitByIpDb({
        windowSeconds: 60,
        max: 10,
        scope: "test-no-ip",
        rejectUnknownIp: true,
      }),
    );
    app.get("/", (c) => c.json({ ok: true }));
    const res = await app.request("/"); // no proxy headers
    expect(res.status).toBe(429);
  });
});
*/

export {};
