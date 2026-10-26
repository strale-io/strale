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
      slugs: groupSolutionVariants(index.search(query.q))
        .slice(0, 5)
        .map((r) => r.item.slug),
    }));
    const overall = evaluate(rows, "typeahead").at(-1)!;
    // Accepted rebuild: 81/87 top-1, 86/87 top-3. None queries are unscored.
    expect(overall.count).toBe(87);
    expect(overall.top1).toBeGreaterThanOrEqual(79);
    expect(overall.top3).toBeGreaterThanOrEqual(84);
  });
  it("ranks 1,000 mixed natural/typo/country queries in under two seconds", () => {
    const started = performance.now();
    for (let i = 0; i < 1000; i++)
      index.search(golden.queries[i % golden.queries.length].q);
    const elapsed = performance.now() - started;
    console.info(`keyword benchmark: ${elapsed.toFixed(1)} ms / 1,000 queries`);
    expect(elapsed).toBeLessThan(2000);
  });
});
