import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { recordLlmUsage, withCallCost } from "./call-cost.js";
import { MODELS } from "./models.js";
const { execute, logError } = vi.hoisted(() => ({ execute: vi.fn(), logError: vi.fn() }));
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
vi.mock("./log.js", () => ({ logError }));
import { persistCallCost } from "./persist-call-cost.js";
beforeEach(() => { vi.clearAllMocks(); });
it("writes a captured cost snapshot after scheduling, binds only encoder-safe primitives and never waits for DB", async () => {
  execute.mockReturnValue(new Promise(() => {}));
  withCallCost(() => {
    recordLlmUsage(MODELS.capability_default.id, { input_tokens: 10, output_tokens: 0 });
    expect(persistCallCost("00000000-0000-4000-8000-000000000001")).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    // Later work cannot alter this transaction's snapshot.
    recordLlmUsage(MODELS.capability_default.id, { input_tokens: 100, output_tokens: 0 });
  }, 1);
  await Promise.resolve();
  const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
  expect(query.sql).toContain("UPDATE transactions");
  expect(query.params[0]).toBe("0.001000000");
  expect(query.params.every((p) => !(p instanceof Date) && !Buffer.isBuffer(p) && (p === null || ["string", "number", "boolean"].includes(typeof p)))).toBe(true);
  expect(JSON.parse(query.params[1] as string).llm).toHaveLength(1);
});
it("swallows cost write rejection with transaction-scoped visibility", async () => {
  execute.mockRejectedValue(new Error("column missing"));
  expect(() => persistCallCost("00000000-0000-4000-8000-000000000002")).not.toThrow();
  await vi.waitFor(() => expect(logError).toHaveBeenCalledWith("transaction-cost-write-failed", expect.any(Error),
    { transaction_id: "00000000-0000-4000-8000-000000000002" }));
});
