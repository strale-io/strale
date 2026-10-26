import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  evaluate,
  formatMetrics,
  acceptable,
  type GoldenQuery,
  type SearchObservation,
} from "../src/lib/search/eval.js";
import {
  legacyItems,
  legacyTypeahead,
} from "../src/lib/search/legacy-baseline.js";
import { groupSolutionVariants } from "../src/lib/search/ranking.js";
import type { FixtureItem } from "../src/lib/search/fixtures.js";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const engine = arg("--engine") ?? "keyword";
if (
  !["keyword", "legacy-keyword", "live-typeahead", "live-suggest"].includes(
    engine
  )
)
  throw new Error("Unknown --engine");
const base = arg("--base") ?? "https://api.strale.io";
const fixture = (name: string) =>
  fileURLToPath(
    new URL(`../src/lib/search/__fixtures__/${name}.json`, import.meta.url)
  );
const queries: GoldenQuery[] = JSON.parse(
  await readFile(fixture("golden-queries"), "utf8")
).queries;
const items: FixtureItem[] = JSON.parse(
  await readFile(fixture("catalog-2026-10-26"), "utf8")
).items;
const oldItems = legacyItems(items);
const rows: SearchObservation[] = [];
// Lazy import keeps the old baseline executable before the new engine exists.
const indexStarted = performance.now();
const index =
  engine === "keyword"
    ? (await import("../src/lib/search/keyword.js")).createKeywordIndex(items)
    : null;
const indexBuildMs = performance.now() - indexStarted;
for (const query of queries) {
  let slugs: string[];
  if (engine === "legacy-keyword")
    slugs = legacyTypeahead(oldItems, query.q, 5).results.map((i) => i.slug);
  else if (index)
    slugs = groupSolutionVariants(index.search(query.q))
      .slice(0, 5)
      .map((r) => r.item.slug);
  else {
    const isTypeahead = engine === "live-typeahead";
    const response = await fetch(
      isTypeahead
        ? `${base}/v1/suggest/typeahead?q=${encodeURIComponent(
            query.q
          )}&limit=5`
        : `${base}/v1/suggest`,
      {
        ...(isTypeahead
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: query.q, limit: 4 }),
            }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!response.ok)
      throw new Error(`${engine}: ${response.status} for ${query.q}`);
    const result = (await response.json()) as {
      results?: { slug: string }[];
      recommendation?: { slug: string };
      alternatives?: { slug: string }[];
    };
    slugs = isTypeahead
      ? (result.results ?? []).map((r) => r.slug)
      : result.recommendation
      ? [result.recommendation, ...(result.alternatives ?? [])].map(
          (r) => r.slug
        )
      : [];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  rows.push({ query, slugs });
}
const mode = engine === "live-suggest" ? "suggest" : "typeahead";
const metrics = evaluate(rows, mode);
console.log(`Engine: ${engine}\n${formatMetrics(metrics)}`);
console.log("\nTop-1 misses:");
for (const r of rows.filter(
  (r) =>
    r.query.kind !== "none" && !acceptable(r.slugs[0] ?? "", r.query.expect)
))
  console.log(
    JSON.stringify({ q: r.query.q, expect: r.query.expect, actual: r.slugs })
  );
let benchmark:
  | {
      queries: number;
      index_build_ms: number;
      total_ms: number;
      mean_ms: number;
      p95_ms: number;
      max_ms: number;
    }
  | undefined;
if (index && process.argv.includes("--benchmark")) {
  const times: number[] = [];
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const before = performance.now();
    index.search(queries[i % queries.length].q);
    times.push(performance.now() - before);
  }
  const total = performance.now() - start;
  times.sort((a, b) => a - b);
  benchmark = {
    queries: 1000,
    index_build_ms: indexBuildMs,
    total_ms: total,
    mean_ms: total / 1000,
    p95_ms: times[949],
    max_ms: times[999],
  };
  console.log(`\nBenchmark: ${JSON.stringify(benchmark)}`);
}
if (arg("--output"))
  await writeFile(
    arg("--output")!,
    JSON.stringify({ engine, mode, metrics, rows, benchmark }, null, 2) + "\n"
  );
