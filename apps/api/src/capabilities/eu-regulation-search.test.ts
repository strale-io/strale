import { describe, it, expect } from "vitest";
import { tokenizeQuery } from "./eu-regulation-search.js";
import { getExecutor } from "./index.js";

describe("tokenizeQuery", () => {
  it("drops stop/instrument words and lowercases", () => {
    expect(tokenizeQuery("the Artificial Intelligence Act")).toEqual([
      "artificial",
      "intelligence",
    ]);
  });

  it("produces only injection-safe alphanumeric tokens", () => {
    const tokens = tokenizeQuery(`data' ) . } DROP protection " bif:contains`);
    for (const t of tokens) expect(t).toMatch(/^[a-z0-9]{2,}$/);
    expect(tokens).toContain("data");
    expect(tokens).toContain("protection");
  });

  it("returns empty for queries made only of generic terms", () => {
    expect(tokenizeQuery("EU regulation law")).toEqual([]);
  });

  it("dedupes and caps token count", () => {
    const tokens = tokenizeQuery("alpha alpha beta gamma delta epsilon zeta eta theta");
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.length).toBeLessThanOrEqual(6);
  });
});

describe("executor input refusals (no network)", () => {
  const exec = () => getExecutor("eu-regulation-search")!;

  it("refuses empty input", async () => {
    await expect(exec()({})).rejects.toThrow(/'query' or 'topic' is required/);
  });

  it("refuses an unknown type", async () => {
    await expect(exec()({ query: "ai", type: "treaty" })).rejects.toThrow(
      /must be one of: regulation, directive, decision/,
    );
  });

  it("refuses a malformed year", async () => {
    await expect(exec()({ query: "ai", year: "24" })).rejects.toThrow(/4-digit year/);
  });

  it("refuses an all-generic query with actionable guidance", async () => {
    await expect(exec()({ query: "EU regulation law" })).rejects.toThrow(
      /no searchable words/,
    );
  });
});
