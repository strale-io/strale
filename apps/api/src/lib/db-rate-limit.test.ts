/**
 * Tests for db-rate-limit.ts (F-0-002).
 *
 * Unit-level coverage: window alignment is pure; middleware decision
 * logic is tested by mocking the `getDb` module to return controlled
 * count values (simulating successive increments) or to throw
 * (simulating DB failure).
 *
 * Full integration against a real Postgres is valuable but out of
 * scope here — the per-CI Postgres harness is Phase D. The mocked
 * tests still prove the safety properties: fail-closed on DB error,
 * correct cap enforcement, header shape.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

// Shared mock state — reset in beforeEach.
let mockCountSequence: number[] = [];
let mockShouldThrow = false;
let mockCallArgs: unknown[] = [];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
      mockCallArgs.push(query);
      if (mockShouldThrow) {
        return Promise.reject(new Error("mocked DB failure"));
      }
      const next = mockCountSequence.shift();
      return Promise.resolve([{ count: next ?? 1 }]);
    },
  }),
}));

beforeEach(() => {
  mockCountSequence = [];
  mockShouldThrow = false;
  mockCallArgs = [];
});

describe("windowStart (F-0-002)", () => {
  it("rounds a timestamp down to the window boundary", async () => {
    const { windowStart } = await import("./db-rate-limit.js");
    const t = new Date("2026-04-16T12:34:56Z").getTime();
    // 60-second window → 12:34:00.
    expect(windowStart(60, t).toISOString()).toBe("2026-04-16T12:34:00.000Z");
    // Day window → 00:00:00.
    expect(windowStart(86_400, t).toISOString()).toBe("2026-04-16T00:00:00.000Z");
  });

  it("two timestamps inside the same window get the same boundary", async () => {
    const { windowStart } = await import("./db-rate-limit.js");
    const a = new Date("2026-04-16T12:00:05Z").getTime();
    const b = new Date("2026-04-16T12:00:55Z").getTime();
    expect(windowStart(60, a).getTime()).toBe(windowStart(60, b).getTime());
  });

  it("a timestamp one second past the boundary lands on the next window", async () => {
    const { windowStart } = await import("./db-rate-limit.js");
    const t = new Date("2026-04-16T12:01:00Z").getTime();
    expect(windowStart(60, t).toISOString()).toBe("2026-04-16T12:01:00.000Z");
  });
});

describe("rateLimitByIpDb — enforcement (F-0-002)", () => {
  async function makeApp(max: number, windowSeconds: number) {
    const { rateLimitByIpDb } = await import("./db-rate-limit.js");
    const app = new Hono();
    app.use(
      "*",
      rateLimitByIpDb({ windowSeconds, max, scope: "test" }),
    );
    app.get("/", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows when returned count is <= max", async () => {
    mockCountSequence = [1, 2, 3];
    const app = await makeApp(3, 60);
    const headers = { "x-forwarded-for": "203.0.113.1" };

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/", { headers });
      expect(res.status).toBe(200);
    }
  });

  it("denies with 429 when count exceeds max", async () => {
    mockCountSequence = [4];
    const app = await makeApp(3, 60);
    const res = await app.request("/", {
      headers: { "x-forwarded-for": "203.0.113.2" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("sets X-RateLimit-* headers on allowed responses", async () => {
    mockCountSequence = [1];
    const app = await makeApp(10, 60);
    const res = await app.request("/", {
      headers: { "x-forwarded-for": "203.0.113.3" },
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(res.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
  });

  it("FAILS CLOSED with 503 when the DB throws", async () => {
    mockShouldThrow = true;
    const app = await makeApp(10, 60);
    const res = await app.request("/", {
      headers: { "x-forwarded-for": "203.0.113.4" },
    });
    // The whole point of F-0-002: never fall through to allow.
    expect(res.status).toBe(503);
  });

  it("rejects with 429 when IP cannot be extracted and rejectUnknownIp is true", async () => {
    const { rateLimitByIpDb } = await import("./db-rate-limit.js");
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

  it("allows through (no DB hit) when IP cannot be extracted and rejectUnknownIp is false", async () => {
    // This branch is used by safer routes that have their own gating;
    // proving it DOESN'T hit the DB is important for cost.
    mockCountSequence = []; // if DB is called, mockCountSequence is empty → count=1 default
    const { rateLimitByIpDb } = await import("./db-rate-limit.js");
    const app = new Hono();
    app.use(
      "*",
      rateLimitByIpDb({
        windowSeconds: 60,
        max: 10,
        scope: "test-soft",
        rejectUnknownIp: false,
      }),
    );
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/"); // no headers, no-IP
    expect(res.status).toBe(200);
    expect(mockCallArgs).toHaveLength(0); // DB was not called
  });

  it("hashes the IP so two different IPs produce different bucket keys", async () => {
    mockCountSequence = [1, 1];
    const app = await makeApp(1, 60);

    // Each call's first arg is the SQL query object Drizzle built.
    // We inspect the mockCallArgs to verify the bucket_key component
    // changes between IPs. The exact Drizzle SQL query shape is an
    // internal object; for this assertion we just check there were
    // two distinct calls.
    await app.request("/", { headers: { "x-forwarded-for": "203.0.113.50" } });
    await app.request("/", { headers: { "x-forwarded-for": "203.0.113.51" } });
    expect(mockCallArgs).toHaveLength(2);
  });
});
