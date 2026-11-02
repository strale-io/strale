import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../db/index.js", () => ({ getDb: () => ({ execute }) }));
import { monthlyFreeFunnel } from "./commercial.js";
it("counts anonymous free IPs without returning hashes, and attributes first-free signup cohorts and purchases", async () => {
  execute.mockResolvedValueOnce([{ month: "2026-10", src: "free-tier-limit", free_ips: 1, free_calls: 2 }])
    .mockResolvedValueOnce([{ free_ips: 1, free_calls: 2 }])
    .mockResolvedValueOnce([{ month: "2026-10", free_ips: 1, free_calls: 2 }])
    .mockResolvedValueOnce([{ month: "2026-10", signup_src: "free-tier-limit", first_call_src: "mcp", first_free_signups: 1, paid_conversions: 1 }]);
  const result = await monthlyFreeFunnel({ from: new Date("2026-10-01Z"), to: new Date("2026-11-01Z"), label: "test" });
  expect(result.window_totals).toEqual({ free_ips: 1, free_calls: 2 });
  expect(result.totals[0]).toMatchObject({ free_ips: 1, free_calls: 2 });
  expect(result.signups[0]).toMatchObject({ first_free_signups: 1, paid_conversions: 1 });
  expect(result.comparison).toMatchObject({ august_free_callers: 2, august_window_days: 90, stop_after_days: 45 });
  expect(JSON.stringify(result)).not.toContain("client_ip_hash");
  const queries = execute.mock.calls.map(([q]) => new PgDialect().sqlToQuery(q));
  for (const q of queries) for (const param of q.params) {
    expect(param).not.toBeInstanceOf(Date); expect(Buffer.isBuffer(param)).toBe(false);
  }
  expect(queries[0].sql).toContain("COUNT(DISTINCT t.client_ip_hash)");
  expect(queries[0].sql).toContain("t.user_id IS NULL");
  expect(queries[0].sql).toContain("t.client_meta->>'src'");
  expect(queries[2].sql).not.toContain("t.client_meta->>'src'");
  expect(queries[3].sql).toContain("u.signup_src");
  expect(queries[3].sql).toContain("t.client_ip_hash = u.signup_ip_hash");
  expect(queries[3].sql).toContain("ORDER BY t.created_at, t.id LIMIT 1");
  expect(queries[3].sql).toContain("first_call.is_free_tier = true");
  expect(queries[3].sql).toContain("p.price_cents > 0");
});
