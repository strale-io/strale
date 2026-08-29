/**
 * #438 — the estimator that decides routing metadata, and the two ways its
 * predecessor produced a confident wrong number.
 *
 * The old `fix-latency` medianed `test_results.response_time_ms` across every
 * suite for a slug, then fell back to a per-transparency-tag constant. Both
 * halves wrote a value nothing downstream could tell apart from a measurement.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  estimateRoutingLatency,
  MIN_EXECUTION_SAMPLES,
  percentile,
  ROUTING_LATENCY_PERCENTILE,
} from "./latency-estimate.js";
import { shouldExecuteAsync } from "./execution-routing.js";

const repeat = (value: number, times: number) => Array.from({ length: times }, () => value);

describe("percentile", () => {
  it("picks an OBSERVED value rather than interpolating", () => {
    // The number written must be a latency that actually happened and can be
    // found in the table — not an average of two neighbours.
    const sample = [10, 20, 30, 40];
    expect(sample).toContain(percentile(sample, 0.5));
    expect(percentile(sample, 1)).toBe(40);
  });

  it("is nearest-rank at the boundaries", () => {
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });

  it("refuses an empty sample rather than returning zero", () => {
    expect(() => percentile([], 0.95)).toThrow(/empty sample/);
  });
});

describe("estimateRoutingLatency refuses when the evidence does not support a value", () => {
  it("no executions at all — leaves it unmeasured", () => {
    const e = estimateRoutingLatency([]);
    expect(e.value).toBeNull();
    expect(e.samples).toBe(0);
    expect(e.reason).toMatch(/no completed executions/);
  });

  it("too few executions for a percentile to mean anything", () => {
    const e = estimateRoutingLatency(repeat(12_000, MIN_EXECUTION_SAMPLES - 1));
    expect(e.value).toBeNull();
    expect(e.reason).toMatch(new RegExp(`need ${MIN_EXECUTION_SAMPLES}`));
  });

  it("accepts at exactly the minimum", () => {
    const e = estimateRoutingLatency(repeat(12_000, MIN_EXECUTION_SAMPLES));
    expect(e.value).toBe(12_000);
    expect(e.samples).toBe(MIN_EXECUTION_SAMPLES);
  });

  it("NEVER invents a value from a transparency tag or any other guess", () => {
    // The old fallback returned 20 ms for anything tagged `algorithmic`, with
    // zero executions behind it. There is no argument here that could carry
    // such a thing — the only inputs are latencies.
    expect(estimateRoutingLatency([]).value).toBeNull();
    expect(estimateRoutingLatency([0, 0, 0]).value).toBeNull();
    expect(estimateRoutingLatency([-1, Number.NaN, Infinity]).value).toBeNull();
  });
});

describe("the statistic is tail-aware", () => {
  it("a fat tail lands async even though the mean would not", () => {
    // page-speed-test's real shape: mostly fast, a slow tail that crosses the
    // 15s wall. Its declared average was a truthful 8,000 ms and it routed
    // sync while 12.5% of executions ran past the wall.
    const sample = [...repeat(7_000, 90), ...repeat(19_000, 10)];
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    expect(shouldExecuteAsync(mean), "the mean would have kept it sync").toBe(false);
    expect(shouldExecuteAsync(estimateRoutingLatency(sample).value)).toBe(true);
  });

  it("a single freak outlier does NOT drag a fast capability async", () => {
    // vasp-verify: max 180,007 ms, p95 1,146 ms, 4,860 executions. It belongs
    // on the sync path, and a max-based statistic would have moved it.
    const sample = [...repeat(500, 999), 180_000];
    const e = estimateRoutingLatency(sample);
    expect(e.value).toBe(500);
    expect(shouldExecuteAsync(e.value)).toBe(false);
  });

  it("reports the p95 it used, so an operator can check the arithmetic", () => {
    const e = estimateRoutingLatency(repeat(300, 50));
    expect(e.reason).toBe(`p${ROUTING_LATENCY_PERCENTILE * 100} of 50 completed executions`);
  });
});

describe("the production shapes this was built from", () => {
  it("company-news: routes ASYNC on its measured executions", () => {
    // Measured 2026-08-29: n=183, p50 12,722, p95 28,734, 38.8% past the wall.
    const sample = [...repeat(12_722, 112), ...repeat(28_734, 71)];
    const e = estimateRoutingLatency(sample);
    expect(shouldExecuteAsync(e.value), "company-news would still route sync").toBe(true);
  });

  it("a genuinely fast capability stays sync", () => {
    // cz-ico-validate: p95 6 ms over 1,803 executions.
    const e = estimateRoutingLatency(repeat(6, 1_803));
    expect(e.value).toBe(6);
    expect(shouldExecuteAsync(e.value)).toBe(false);
  });
});

describe("structural: the writer no longer reads test results", () => {
  /**
   * The estimator can only be as good as the population handed to it, and the
   * population is chosen at the call site. A behavioural test of this module
   * cannot see the endpoint going back to `test_results`.
   */
  const endpoint = readFileSync(resolve(__dirname, "../routes/internal-onboarding.ts"), "utf-8");

  it("fix-latency queries transactions, not test_results", () => {
    expect(endpoint).toMatch(/from\(transactions\)/);
    expect(endpoint, "the endpoint is reading test results again").not.toMatch(
      /from\(testResults\)/,
    );
  });

  it("it filters to completed executions", () => {
    expect(endpoint).toMatch(/eq\(transactions\.status, "completed"\)/);
  });

  it("the transparency-tag heuristic is gone", () => {
    // The DEFINITION, not the word. The endpoint's comment names the removed
    // helper to explain why the null branch exists, and prose about a deleted
    // mistake is worth keeping — a check that forbids mentioning it would
    // quietly pressure the next author to delete the explanation instead.
    expect(endpoint, "heuristicLatency is implemented again").not.toMatch(
      /function heuristicLatency/,
    );
    expect(endpoint).not.toMatch(/case "algorithmic": return 20/);
    // The tag must not be SELECTED any more — that is the load-bearing part,
    // and unlike the identifier it cannot appear in a comment by accident.
    expect(endpoint).not.toMatch(/transparencyTag: capabilities\.transparencyTag/);
  });

  it("it reports what it skipped rather than writing something", () => {
    expect(endpoint).toMatch(/skipped/);
    expect(endpoint).toMatch(/estimate\.value === null/);
  });
});
