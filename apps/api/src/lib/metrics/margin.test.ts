import { expect, it, vi } from "vitest";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../db/index.js", () => ({ getDb: () => ({ execute }) }));
import { toolMargin, marginPerTool } from "./commercial.js";
import { PgDialect } from "drizzle-orm/pg-core";
it("uses matched known revenue; unknown revenue never inflates margin", () => {
  const result = toolMargin({ tool: "example", calls: 100, revenue_cents: 1000, known_calls: 20, known_cost_cents: 160, cohort_cost_cents: 160, known_revenue_cents: 200 });
  expect(result.margin).toBe(0.2); expect(result.flag).toBe("thin"); expect(result.unknown_cost_share).toBe(0.8);
  expect(toolMargin({ ...result, known_cost_cents: 210, cohort_cost_cents: 210 }).flag).toBe("negative");
  expect(toolMargin({ ...result, known_calls: 19 }).margin).toBeNull();
  expect(toolMargin({ ...result, known_revenue_cents: 0 }).margin).toBeNull();
  expect(toolMargin({ ...result, known_revenue_cents: 0 }).flag).toBe("negative");
});
it("binds ISO timestamps, groups solutions and capabilities separately and treats historical NULLs as unknown", async () => {
  execute.mockResolvedValue([{ tool: "solution:example", calls: "100", revenue_cents: "1000", known_calls: "20", known_cost_cents: "200", cohort_cost_cents: "160", known_revenue_cents: "200" }]);
  const result = await marginPerTool({ from: new Date("2026-10-26T00:00:00Z"), to: new Date("2026-10-27T00:00:00Z"), label: "day" });
  expect(result[0]!.flag).toBe("thin");
  expect(result[0]!.known_cost_cents).toBe(200);
  expect(result[0]!.cohort_cost_cents).toBe(160);
  const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
  expect(query.params.every(p => !(p instanceof Date) && !Buffer.isBuffer(p))).toBe(true);
  expect(query.params).toContain("2026-10-26T00:00:00.000Z");
  expect(query.sql).toContain("COUNT(t.cost_cents)");
  expect(query.sql).toContain("t.status IN ('completed', 'failed')");
  expect(query.sql).toContain("CASE WHEN t.status = 'completed' THEN t.price_cents ELSE 0 END");
});
