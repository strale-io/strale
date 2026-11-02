/**
 * /v1/ops-read/* through the real app (mount, rate limit, auth, output
 * contract). The DB is mocked: `transaction` records its config and hands the
 * check an executor that returns `nextRows`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const txConfigs: unknown[] = [];
let nextRows: unknown[][] = [];
vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
        innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>, config: unknown) => {
      txConfigs.push(config);
      let i = 0;
      return fn({
        execute: async (q: unknown) => {
          // The statement-timeout SET is the first call; it returns nothing.
          const text = JSON.stringify(q);
          if (text.includes("statement_timeout")) return [];
          return nextRows[i++] ?? [];
        },
      });
    },
  }),
}));

vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

const TOKEN = "unit-test-ops-read-token-with-plenty-of-entropy-0123";
const auth = { Authorization: `Bearer ${TOKEN}` };

beforeAll(() => {
  process.env.ADMIN_SECRET = "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET = "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.STRALE_OPS_READ_TOKEN = TOKEN;
  process.env.RAILWAY_GIT_COMMIT_SHA = "b8e19865ee06aaaabbbbcccc";
});

afterEach(() => {
  txConfigs.length = 0;
  nextRows = [];
});

async function loadApp() {
  const { app } = await import("../app.js");
  return app;
}

describe("/v1/ops-read is invisible without the token", () => {
  it.each([
    ["no header", {}],
    ["wrong token", { Authorization: `Bearer ${"w".repeat(TOKEN.length)}` }],
    ["admin secret", { Authorization: `Bearer ${"unit-test-admin-secret-plenty-of-entropy-0123456789"}` }],
  ])("%s → 404 with the same body as an unknown route", async (_label, headers) => {
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/build", { headers });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error_code: "not_found", message: "No route matches GET /v1/ops-read/build" });
    expect(txConfigs).toHaveLength(0);
  });

  it("an unknown check is 404 even with the token", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/select-star", { headers: auth });
    expect(res.status).toBe(404);
  });

  it("fails closed when the configured token is shorter than 32 characters", async () => {
    const app = await loadApp();
    process.env.STRALE_OPS_READ_TOKEN = "short";
    try {
      const res = await app.request("/v1/ops-read/build", { headers: { Authorization: "Bearer short" } });
      expect(res.status).toBe(404);
    } finally {
      process.env.STRALE_OPS_READ_TOKEN = TOKEN;
    }
  });
});

describe("/v1/ops-read with the token", () => {
  it("build returns the deployed commit in a read-only transaction", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/build", { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ check: "build", result: { commit: "b8e19865ee06" } });
    expect(txConfigs).toEqual([{ accessMode: "read only" }]);
  });

  it("parked-suites returns identifiers and timestamps", async () => {
    nextRows = [[{
      test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
      capability_slug: "canadian-company-data",
      test_type: "known_answer",
      test_mode: "live",
      active: true,
      last_result_at: "2026-11-02T01:23:45Z",
    }]];
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/parked-suites", { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.count).toBe(1);
    expect(body.result.suites[0].capability_slug).toBe("canadian-company-data");
  });

  it("refuses to return planted free text and does not echo it in the error", async () => {
    const planted = "Customer said: refund order 1234 to jane.doe@example.com";
    nextRows = [[{
      test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
      capability_slug: planted,
      test_type: "known_answer",
      test_mode: "live",
      active: true,
      last_result_at: null,
    }]];
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/parked-suites", { headers: auth });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("jane.doe");
    expect(text).not.toContain("refund");
  });

  it("an invalid date range is a 400 and runs no query", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/test-call-cost?from=2026-01-01&to=2026-11-01", { headers: auth });
    expect(res.status).toBe(400);
    expect((await res.json()).error_code).toBe("invalid_request");
  });

  it("test-call-cost returns daily aggregates", async () => {
    nextRows = [
      [{ day: "2026-10-31", runs: 120, declared_external_cost_cents: "0" }],
      [{ test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e", capability_slug: "canadian-company-data", test_type: "known_answer", runs: 24, declared_external_cost_cents: "0" }],
    ];
    const app = await loadApp();
    const res = await app.request("/v1/ops-read/test-call-cost?from=2026-10-31&to=2026-10-31", { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.days[0].runs).toBe(120);
    expect(body.result.parked_suites[0].runs).toBe(24);
  });
});
