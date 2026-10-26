import { beforeEach, describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
const mocks = vi.hoisted(() => ({
  suggest: vi.fn(),
  typeahead: vi.fn(),
  values: vi.fn(),
}));
vi.mock("../lib/suggest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/suggest.js")>();
  return { ...actual, suggest: mocks.suggest, typeahead: mocks.typeahead };
});
vi.mock("../db/index.js", () => ({
  getDb: () => ({ insert: () => ({ values: mocks.values }) }),
}));
import { suggestRoute } from "./suggest.js";
const app = new Hono().route("/v1", suggestRoute);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.suggest.mockResolvedValue({
    recommendation: null,
    alternatives: [],
    total_matches: 0,
    query_understood_as: "query",
  });
  mocks.values.mockResolvedValue(undefined);
});
describe("public search route guard and IP propagation", () => {
  it.each(["", " ", "a"])(
    "rejects short input %j before the paid engine",
    async (query) => {
      const response = await app.request("/v1/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      expect(response.status).toBe(400);
      expect(mocks.suggest).not.toHaveBeenCalled();
    }
  );
  it("passes the client IP to the model-reaching request budget", async () => {
    const response = await app.request("/v1/suggest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.8",
      },
      body: JSON.stringify({ query: "email validation", limit: 2 }),
    });
    expect(response.status).toBe(200);
    expect(mocks.suggest).toHaveBeenCalledWith({
      query: "email validation",
      limit: 2,
      clientIp: "203.0.113.8",
    });
  });
});
