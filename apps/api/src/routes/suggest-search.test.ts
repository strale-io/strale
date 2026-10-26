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
import { openApiSpec } from "../openapi.js";
import { a2aRoute } from "./a2a.js";
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
  it("passes the A2A caller's client IP into suggest", async () => {
    const response = await a2aRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.44" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: {
        message: { parts: [{ kind: "text", text: "validate email" }] },
      } }),
    });
    expect(response.status).toBe(200);
    expect(mocks.suggest).toHaveBeenCalledWith({ query: "validate email", limit: 1, clientIp: "203.0.113.44" });
  });
  it("truncates typeahead queries to 200 characters before matching", async () => {
    mocks.typeahead.mockResolvedValue({ results: [], total: 0 });
    const response = await app.request(`/v1/suggest/typeahead?q=${"x".repeat(10_240)}`);
    expect(response.status).toBe(200);
    expect(mocks.typeahead).toHaveBeenCalledWith("x".repeat(200), 6, undefined, undefined);
  });
  it("documents the real suggest response and minimum query length", () => {
    const operation = openApiSpec.paths["/v1/suggest"].post;
    expect(operation.requestBody.content["application/json"].schema.properties.query.minLength).toBe(2);
    const schema = operation.responses["200"].content["application/json"].schema;
    expect(Object.keys(schema.properties).sort()).toEqual(["alternatives", "query_understood_as", "recommendation", "total_matches"]);
    expect(schema.properties.recommendation.nullable).toBe(true);
  });
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
