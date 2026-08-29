/**
 * How a capability's routing latency is derived (#438).
 *
 * `capabilities.avg_latency_ms` selects sync-vs-async execution in `/v1/do`
 * (see `execution-routing.ts`). Before this module, the only automated writer
 * — `POST /v1/internal/onboarding/fix-latency` — derived it by medianing
 * `test_results.response_time_ms` across every suite for a slug, then fell
 * back to a per-transparency-tag constant when there were fewer than three
 * results. Both halves were wrong, and both wrote a number that looked
 * measured.
 *
 * ## Why the old evidence set was polluted
 *
 * Measured 2026-08-29 over `page-speed-test` and `company-news`, by suite type:
 *
 *     schema_check        n=1071   median      3 ms
 *     negative            n= 391   median      6 ms
 *     edge_case           n= 410   median      9 ms
 *     dependency_health   n= 213   median  7,879 ms
 *     known_answer        n= 206   median 14,430 ms
 *     known_bad           n= 155   median 17,723 ms
 *     piggyback           n=   2   median 11,489 ms
 *
 * The three cheap types outnumber the executing ones roughly three to one, so
 * the median across all of them lands in single-digit milliseconds for a
 * capability that really takes ten to twenty seconds. `page-speed-test`
 * medians 6 ms over all 1,592 results and 11,208 ms over the 617 that ran.
 *
 * Note what the table also says: `known_bad` DOES execute — it feeds a real
 * input the upstream rejects — so the obvious "exclude negative and known_bad"
 * filter would have been wrong in both directions, and `edge_case` spans both
 * behaviours (median 9 ms, max 60,020 ms). The suite label does not reliably
 * separate "executed" from "returned before executing", and neither does a
 * duration threshold: a fast capability's real execution and a slow one's
 * validation refusal are both a few milliseconds.
 *
 * ## So the evidence is transactions, not test results
 *
 * A row in `transactions` exists only because the capability actually ran. It
 * needs no filter, no label and no threshold to mean what it says — which is
 * the property the old estimator lacked. Rows written by the internal harness
 * count: the harness calls executors directly, so its latencies are real
 * executions of the real code.
 *
 * ## Why p95 rather than an average
 *
 * The routing threshold is 10s and the sync path dies at 15s, so the question
 * the number has to answer is "will this capability's calls exceed a hard
 * limit?" An average is structurally blind to the tail that actually hits it:
 * `page-speed-test` averaged a truthful 8,000 ms while 12.5% of its executions
 * ran past 15s. p95 is tail-aware and still robust against the rare outlier —
 * `vasp-verify` has a 180-second maximum and a 1,146 ms p95, and belongs on
 * the sync path.
 *
 * The consequence, stated rather than hidden: the column is named
 * `avg_latency_ms` and now holds a routing budget, not a mean. `lib/suggest.ts`
 * surfaces it to callers as `avg_response_time_ms`, so that number becomes a
 * conservative estimate rather than a literal average — an overstatement, in
 * the safe direction for a latency hint. Renaming the column or splitting the
 * two uses is a schema change this did not need.
 */

/** Executions required before a percentile is worth trusting. */
export const MIN_EXECUTION_SAMPLES = 20;

/** Tail-aware, outlier-tolerant. See the module note. */
export const ROUTING_LATENCY_PERCENTILE = 0.95;

export interface RoutingLatencyEstimate {
  /** Milliseconds to write, or null when the evidence does not support one. */
  value: number | null;
  /** Why that value — or why nothing. Surfaced to the operator verbatim. */
  reason: string;
  /** Executions the estimate was computed from. */
  samples: number;
}

/**
 * Nearest-rank percentile. Deliberately picks an OBSERVED value rather than
 * interpolating between two, so the number written is a latency that actually
 * happened and can be found in the table.
 */
export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) throw new Error("percentile of an empty sample");
  const rank = Math.ceil(p * sortedAscending.length);
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
}

/**
 * The estimate, or a refusal.
 *
 * Refusing is the important half. The old implementation could not refuse: with
 * no usable results it returned `heuristicLatency(transparencyTag)` — 20 ms for
 * anything tagged `algorithmic` — so a capability with zero execution evidence
 * got a confident, tiny, routing-relevant number that nothing downstream could
 * tell apart from a measurement. A null says "unmeasured", which is true and
 * which `capability-readiness.ts` already reports as an issue.
 */
export function estimateRoutingLatency(executionLatenciesMs: number[]): RoutingLatencyEstimate {
  const usable = executionLatenciesMs.filter((ms) => Number.isFinite(ms) && ms > 0);

  if (usable.length === 0) {
    return {
      value: null,
      reason: "no completed executions on record — leaving unmeasured rather than guessing",
      samples: 0,
    };
  }

  if (usable.length < MIN_EXECUTION_SAMPLES) {
    return {
      value: null,
      reason:
        `only ${usable.length} completed execution${usable.length === 1 ? "" : "s"} on record ` +
        `(need ${MIN_EXECUTION_SAMPLES}) — a percentile over that few is noise`,
      samples: usable.length,
    };
  }

  const sorted = [...usable].sort((a, b) => a - b);
  const value = percentile(sorted, ROUTING_LATENCY_PERCENTILE);
  return {
    value,
    reason: `p${ROUTING_LATENCY_PERCENTILE * 100} of ${usable.length} completed executions`,
    samples: usable.length,
  };
}
