import { expect, it, vi } from "vitest";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../db/index.js", () => ({ getDb: () => ({ execute }) }));
import { PgDialect } from "drizzle-orm/pg-core";
import { mcpFunnel, monitorVisitDays } from "./metrics.js";

const w = { from: new Date("2026-10-20T00:00:00Z"), to: new Date("2026-10-27T00:00:00Z"), label: "week" };

it("counts narrow entry-point rows (/mcp/<id>:<step>) in the same funnel steps as the broad server", async () => {
  execute.mockResolvedValue([
    { endpoint: "/mcp:initialize", events: "2", visit_days: "2" },
    { endpoint: "/mcp/company-check:initialize", events: "3", visit_days: "1" },
    { endpoint: "/mcp:tools/call:strale_execute", events: "1", visit_days: "1" },
    { endpoint: "/mcp/web-reader:tools/call:url-to-markdown", events: "4", visit_days: "2" },
  ]);
  const result = await mcpFunnel(w);
  if (result.status !== "observed") throw new Error("expected observed");
  const [found, , tried] = result.value;
  expect(found).toMatchObject({ events: 5, visitDays: 3 });
  expect(tried).toMatchObject({ events: 5, visitDays: 3 });
  const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
  expect(query.sql).toContain("'/mcp/%:%'");
});

it("monitor visit-days include narrow entry-point initializes", async () => {
  execute.mockResolvedValue([{ n: "1" }]);
  await monitorVisitDays(w);
  const query = new PgDialect().sqlToQuery(execute.mock.calls.at(-1)![0]);
  expect(query.sql).toContain("'/mcp/%:initialize'");
});
