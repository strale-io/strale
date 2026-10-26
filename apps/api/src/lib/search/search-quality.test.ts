import { describe, it, expect } from "vitest";
import { performance } from "node:perf_hooks";
import catalogue from "./__fixtures__/catalog-2026-10-26.json";
import golden from "./__fixtures__/golden-queries.json";
import { createKeywordIndex } from "./keyword.js";
import { groupSolutionVariants } from "./ranking.js";
import { evaluate } from "./eval.js";
import type { FixtureItem } from "./fixtures.js";
const index = createKeywordIndex(catalogue.items as FixtureItem[]);
describe("frozen public catalogue quality gate", () => {
  it("keeps measured top-1 and top-3 within two queries of the accepted rebuild", () => {
    const rows = golden.queries.map((query) => ({
      query,
      topCoverage: index.search(query.q)[0]?.coverage ?? 0,
      slugs: groupSolutionVariants(index.search(query.q))
        .slice(0, 5)
        .map((r) => r.item.slug),
    }));
    const overall = evaluate(rows, "typeahead").at(-1)!;
    // Accepted rebuild: 81/87 top-1, 86/87 top-3. None is reported separately.
    expect(evaluate(rows, "typeahead").find((m) => m.kind === "none")?.count).toBe(3);
    expect(overall.count).toBe(87);
    expect(overall.top1).toBeGreaterThanOrEqual(79);
    expect(overall.top3).toBeGreaterThanOrEqual(84);
  });
  it("bounds synchronous work for a 10 KB query, including distinct unknown tokens", () => {
    const distinct = Array.from({ length: 1280 }, (_, i) =>
      `zzq${i.toString(36).padStart(4, "x")}`).join(" ") + " ";
    expect(Buffer.byteLength(distinct)).toBe(10_240);
    for (const query of ["x".repeat(10_240), "qwertyuiopasdfghjkl ".repeat(550), "a ".repeat(5120), distinct]) {
      const started = performance.now();
      index.search(query);
      expect(performance.now() - started).toBeLessThan(50);
    }
  });
  it.each([
    ["abn lookup", "au-company-data"], ["check abn", "au-company-data"],
    ["abn 12345678901", "au-company-data"], ["orgnr 1234567890", "swedish-company-data"],
    ["brreg lookup", "norwegian-company-data"],
    ["siren lookup", "french-company-data"], ["cro lookup", "irish-company-data"],
    ["krs lookup", "polish-company-data"], ["ico lookup", "cz-company-data"],
  ])("prioritizes registry identity for %s", (query, slug) => {
    expect(index.search(query)[0]?.item.slug).toBe(slug);
  });
  it("returns only existing generic ID tools for bare IDs and a missing Dutch registry", () => {
    for (const query of ["1234567890", "kvk lookup"]) {
      const slugs = index.search(query).map((r) => r.item.slug);
      expect(slugs).toHaveLength(2);
      expect(slugs).toEqual(expect.arrayContaining(["company-id-detect", "id-number-validate"]));
    }
  });
  it("ranks 1,000 mixed natural/typo/country queries in under two seconds", () => {
    const started = performance.now();
    for (let i = 0; i < 1000; i++)
      index.search(golden.queries[i % golden.queries.length].q);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2000);
  });
});
