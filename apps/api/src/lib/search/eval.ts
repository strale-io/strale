/** Pure evaluation. A family wildcard is exactly one two-letter suffix. */
export interface GoldenQuery {
  q: string;
  kind: string;
  expect: string[];
}
export interface SearchObservation {
  query: GoldenQuery;
  slugs: string[];
}
export interface Metrics {
  kind: string;
  count: number;
  top1: number;
  top3: number;
  mrr5: number;
}
export function acceptable(slug: string, expected: readonly string[]): boolean {
  return expected.some((e) =>
    e.endsWith("-{cc}")
      ? slug.startsWith(e.slice(0, -4)) &&
        /^[a-z]{2}$/i.test(slug.slice(e.length - 4))
      : slug === e
  );
}
export function evaluate(
  rows: SearchObservation[],
  mode: "typeahead" | "suggest"
): Metrics[] {
  const scored = rows.filter(
    (r) => mode === "suggest" || r.query.kind !== "none"
  );
  const metric = (kind: string, group: SearchObservation[]): Metrics => {
    let top1 = 0,
      top3 = 0,
      mrr5 = 0;
    for (const { query, slugs } of group) {
      const rank =
        query.kind === "none"
          ? slugs.length === 0
            ? 0
            : -1
          : slugs.slice(0, 5).findIndex((s) => acceptable(s, query.expect));
      if (rank === 0) top1++;
      if (rank >= 0 && rank < 3) top3++;
      if (rank >= 0) mrr5 += 1 / (rank + 1);
    }
    return {
      kind,
      count: group.length,
      top1,
      top3,
      mrr5: group.length ? mrr5 / group.length : 0,
    };
  };
  return [...new Set(scored.map((r) => r.query.kind))]
    .sort()
    .map((kind) =>
      metric(
        kind,
        scored.filter((r) => r.query.kind === kind)
      )
    )
    .concat(metric("overall", scored));
}
export function formatMetrics(metrics: Metrics[]): string {
  return [
    "kind         n   top-1           top-3           MRR@5",
    ...metrics.map(
      (m) =>
        `${m.kind.padEnd(12)} ${String(m.count).padStart(2)}  ${`${m.top1}/${
          m.count
        } (${((100 * m.top1) / m.count).toFixed(1)}%)`.padEnd(15)} ${`${
          m.top3
        }/${m.count} (${((100 * m.top3) / m.count).toFixed(1)}%)`.padEnd(
          15
        )} ${m.mrr5.toFixed(4)}`
    ),
  ].join("\n");
}
