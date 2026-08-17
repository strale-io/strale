/**
 * Regression tests for stale fixture baselines.
 *
 * Measured against production 2026-08-17. Six capabilities had been failing
 * their known-answer suite continuously since 2026-03-20 without a single live
 * execution, because:
 *
 *   1. `test_mode = 'fixture'` replays `baseline_output` instead of calling the
 *      executor, and
 *   2. `captureBaseline` returned early whenever a baseline already existed.
 *
 * Together those make a wrong baseline permanent. `iso-country-lookup`'s
 * known-answer suite stores `{"query":"Sweden"}`; its baseline was captured
 * 2026-03-13 from a different suite's input (`"land"`), the suite's input was
 * changed 2026-03-20, and all 81 recorded runs over the following week echoed
 * `"land"`. The verdict could never change, because nothing re-ran.
 *
 * 81 fixture-mode suites carry a baseline older than their last edit; 6 were
 * failing and 75 pass only by luck. These tests pin the staleness predicate
 * and the capture/refresh rule.
 *
 * Discrimination: against the un-fixed code `isBaselineStale` did not exist and
 * `captureBaseline` early-returned unconditionally; the "refreshes" and
 * "predates" cases below fail when the predicate is stubbed to `false`.
 */
import { describe, it, expect } from "vitest";
import { isBaselineStale } from "./test-runner.js";

const at = (iso: string) => new Date(iso);

describe("isBaselineStale", () => {
  it("flags the production case: baseline captured before the input changed", () => {
    // iso-country-lookup known_answer, verbatim from test_suites.
    expect(
      isBaselineStale({
        baselineOutput: { query: "land", matches: [], total_matches: 0 },
        baselineCapturedAt: at("2026-03-13T07:30:37.740Z"),
        updatedAt: at("2026-03-20T21:10:50.738Z"),
      }),
    ).toBe(true);
  });

  it("does not flag a baseline captured at or after the last edit", () => {
    expect(
      isBaselineStale({
        baselineOutput: { ok: true },
        baselineCapturedAt: at("2026-03-20T21:10:50.738Z"),
        updatedAt: at("2026-03-20T21:10:50.738Z"),
      }),
    ).toBe(false);
    expect(
      isBaselineStale({
        baselineOutput: { ok: true },
        baselineCapturedAt: at("2026-08-17T09:00:00.000Z"),
        updatedAt: at("2026-03-20T21:10:50.738Z"),
      }),
    ).toBe(false);
  });

  it("treats a one-millisecond gap as stale — the predicate is strict", () => {
    // This is why captureBaseline must write ONE timestamp to both columns.
    // Two `new Date()` calls a millisecond apart would make every freshly
    // captured baseline stale on arrival, and the suite would never use
    // fixture mode again.
    expect(
      isBaselineStale({
        baselineOutput: { ok: true },
        baselineCapturedAt: at("2026-08-17T09:00:00.000Z"),
        updatedAt: at("2026-08-17T09:00:00.001Z"),
      }),
    ).toBe(true);
  });

  it("is not stale when there is no baseline at all", () => {
    // Never captured is not the same as captured-and-rotten; the live path
    // handles it and would otherwise be told to 'refresh' nothing.
    expect(isBaselineStale({ baselineOutput: null, baselineCapturedAt: null, updatedAt: at("2026-08-17T09:00:00.000Z") })).toBe(false);
    expect(isBaselineStale({ baselineOutput: undefined, baselineCapturedAt: at("2026-01-01T00:00:00.000Z"), updatedAt: at("2026-08-17T09:00:00.000Z") })).toBe(false);
  });

  it("treats an undateable baseline as stale rather than trusting it", () => {
    expect(
      isBaselineStale({
        baselineOutput: { ok: true },
        baselineCapturedAt: null,
        updatedAt: at("2026-08-17T09:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("keeps a baseline whose suite has no recorded edit time", () => {
    expect(
      isBaselineStale({
        baselineOutput: { ok: true },
        baselineCapturedAt: at("2026-03-13T07:30:37.740Z"),
        updatedAt: null,
      }),
    ).toBe(false);
  });
});

describe("the fixture-mode branch conditions", () => {
  // The runner's guard is
  //   testMode === 'fixture' && baselineOutput && !isBaselineStale(suite)
  // and the paid fallback is
  //   testMode === 'fixture' && baselineOutput && externalCostCents > 0
  // These assert the decision table those two lines encode, which is the part
  // that determines whether an executor is called at all.
  const decide = (s: {
    testMode: string;
    baselineOutput: unknown;
    baselineCapturedAt: Date | null;
    updatedAt: Date | null;
    externalCostCents: number;
  }): "replay" | "stale-paid" | "live" => {
    if (s.testMode === "fixture" && s.baselineOutput && !isBaselineStale(s)) return "replay";
    if (s.testMode === "fixture" && s.baselineOutput && s.externalCostCents > 0) return "stale-paid";
    return "live";
  };

  const FRESH = { baselineCapturedAt: at("2026-08-17T09:00:00Z"), updatedAt: at("2026-08-17T09:00:00Z") };
  const STALE = { baselineCapturedAt: at("2026-03-13T07:30:00Z"), updatedAt: at("2026-03-20T21:10:50Z") };

  it("replays a current baseline — fixture mode still costs nothing", () => {
    expect(decide({ testMode: "fixture", baselineOutput: { a: 1 }, ...FRESH, externalCostCents: 0 })).toBe("replay");
  });

  it("re-executes a stale baseline when the capability is free to run", () => {
    // All six production casualties were external_cost_cents = 0, so this is
    // the path that actually repairs them.
    expect(decide({ testMode: "fixture", baselineOutput: { a: 1 }, ...STALE, externalCostCents: 0 })).toBe("live");
  });

  it("does not spend money to refresh — it reports the instrument instead", () => {
    expect(decide({ testMode: "fixture", baselineOutput: { a: 1 }, ...STALE, externalCostCents: 1 })).toBe("stale-paid");
  });

  it("leaves live-mode suites alone entirely", () => {
    expect(decide({ testMode: "live", baselineOutput: { a: 1 }, ...STALE, externalCostCents: 0 })).toBe("live");
    expect(decide({ testMode: "live", baselineOutput: { a: 1 }, ...FRESH, externalCostCents: 5 })).toBe("live");
  });
});
