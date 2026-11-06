/**
 * classifyVolume, the pure decision behind the x402 settlement watch. The SQL
 * and the alert wiring are covered against real Postgres in
 * x402-settlement-watch.integration.test.ts; these pin the edge cases.
 */
import { describe, expect, it } from "vitest";
import { capSpikes, classifyVolume, rowsFromBuckets, type PayerRow } from "./x402-settlement-watch.js";

/** A payer with the same count on each of the seven baseline days. */
const perDay = (payer: string | null, base: number, last24h: number): PayerRow =>
  ({ payer, priorDaily: new Array(7).fill(base), last24h });

/** A payer with an explicit day-by-day history (index 0 = 24–48h ago). */
const daily = (payer: string | null, priorDaily: number[], last24h: number): PayerRow => ({ payer, priorDaily, last24h });

/** The pre-fix rule, kept here only to show the replayed case fired under it. */
const meanBaseline = (rows: PayerRow[]) => rows.reduce((a, r) => a + r.priorDaily.reduce((x, n) => x + n, 0), 0) / 7;

describe("classifyVolume", () => {
  it("is healthy at or above half the baseline, and silent under the minimum", () => {
    expect(classifyVolume([perDay("a", 100, 50)]).kind).toBe("healthy");
    expect(classifyVolume([perDay("a", 9, 0)]).kind).toBe("no_baseline");
  });

  it("excludes the top two buyers when one alone does not explain the drop", () => {
    const v = classifyVolume([perDay("a", 80, 0), perDay("b", 60, 0), perDay("c", 10, 10), perDay("d", 8, 8)]);
    expect(v.kind).toBe("concentrated");
    if (v.kind !== "concentrated") throw new Error("unreachable");
    expect(v.excluded).toBe(2);
    expect(v.othersLast24h).toBe(18);
  });

  it("never excludes more than two buyers", () => {
    const v = classifyVolume([perDay("a", 60, 0), perDay("b", 50, 0), perDay("c", 40, 0), perDay("d", 8, 8)]);
    expect(v.kind).toBe("broad");
  });

  it("stays critical when the other payers' own baseline is too small to prove the rail works", () => {
    // Review scenario: a v1 die-off takes out the big buyer; one v2 payer at ~1/day carries on.
    const v = classifyVolume([perDay("a", 150, 1), perDay("b", 1, 1)]);
    expect(v.kind).toBe("broad");
  });

  it("counts unattributed rows with the others and never as a buyer to exclude", () => {
    const v = classifyVolume([perDay(null, 150, 0), perDay("b", 9, 9)]);
    expect(v.kind).toBe("broad");
    if (v.kind !== "broad") throw new Error("unreachable");
    expect(v.topBuyers.map((b) => b.payerHashPrefix)).toEqual(["b"]);
    expect(v.distinctPayers24h).toBe(1);
  });
});

describe("capSpikes", () => {
  it("leaves an ordinary week alone", () => {
    for (const week of [
      [100, 100, 100, 100, 100, 100, 100],
      [100, 100, 100, 100, 100, 45, 45], // quiet weekend
      [0, 100, 0, 100, 0, 100, 0], // every-other-day buyer
      [500, 500, 500, 0, 0, 0, 0], // a buyer three days old
      [0, 0, 0, 0, 0, 0, 0],
    ]) expect(capSpikes(week)).toEqual(week);
  });

  it("leaves a ramp and the healthy days of an outage alone (review round 2)", () => {
    for (const week of [
      [300, 300, 30, 30, 30, 30, 30], // ramp: the newest days are the busy ones
      [300, 300, 300, 30, 30, 30, 30],
      [0, 0, 0, 0, 0, 100, 100], // total outage, day 6
      [0, 0, 0, 0, 100, 100, 100],
      [30, 30, 30, 30, 100, 100, 100], // slow degradation
    ]) expect(capSpikes(week)).toEqual(week);
  });

  it("caps a one-off spike, and both days of one that straddles a bucket boundary", () => {
    expect(capSpikes([105, 105, 105, 1005, 105, 105, 105])).toEqual([105, 105, 105, 315, 105, 105, 105]);
    expect(capSpikes([105, 105, 900, 800, 105, 105, 105])).toEqual([105, 105, 315, 315, 105, 105, 105]);
    expect(capSpikes([105, 900, 800, 105, 105, 105, 105])).toEqual([105, 315, 315, 105, 105, 105, 105]);
  });

  it("never caps the newest or the oldest baseline day", () => {
    expect(capSpikes([1005, 105, 105, 105, 105, 105, 105])[0]).toBe(1005);
    expect(capSpikes([105, 105, 105, 105, 105, 105, 1005])[6]).toBe(1005);
  });

  it("is continuous: one more call on a spike day never lowers the baseline", () => {
    const sum = (xs: number[]) => xs.reduce((a, n) => a + n, 0);
    for (let n = 200; n <= 400; n++) {
      expect(sum(capSpikes([100, 100, 100, n + 1, 100, 100, 100]))).toBeGreaterThanOrEqual(sum(capSpikes([100, 100, 100, n, 100, 100, 100])));
    }
  });
});

describe("rowsFromBuckets", () => {
  it("folds (payer, days ago) buckets into rows, with bucket 0 as the last 24h", () => {
    const rows = rowsFromBuckets([
      { payer: "a", dayAgo: 0, n: 4 },
      { payer: "a", dayAgo: -1, n: 1 }, // clock skew: a row slightly in the future
      { payer: "a", dayAgo: 1, n: 7 },
      { payer: "a", dayAgo: 7, n: 2 },
      { payer: "a", dayAgo: 8, n: 99 }, // outside the window
      { payer: null, dayAgo: 3, n: 5 },
    ]);
    expect(rows).toEqual([
      { payer: "a", last24h: 5, priorDaily: [7, 0, 0, 0, 0, 0, 2] },
      { payer: null, last24h: 0, priorDaily: [0, 0, 5, 0, 0, 0, 0] },
    ]);
  });

  it("refuses a malformed bucket instead of losing its count", () => {
    expect(() => rowsFromBuckets([{ payer: "a", dayAgo: Number.NaN, n: 3 }])).toThrow(/malformed bucket/);
    expect(() => rowsFromBuckets([{ payer: "a", dayAgo: 1.5, n: 3 }])).toThrow(/malformed bucket/);
  });
});

describe("classifyVolume, robust baseline (incident 2026-11-03)", () => {
  // Replay of the shape, with round illustrative counts rather than production
  // figures: one big buyer settles a steady amount a day, a few small payers
  // settle a little, and on one day the big buyer ran a single job many times
  // its normal day. Four days later the buyer paused for part of a day and was
  // back within hours, so the last 24h is somewhat below a normal day.
  // Index 3 is 96–120h back: 2026-10-30 as seen from 2026-11-03.
  const bigDaily = [100, 100, 100, 1000, 100, 100, 100];
  const rows = [daily("big", bigDaily, 75), perDay("small1", 3, 3), perDay("small2", 2, 2)];

  it("fired under the old mean baseline", () => {
    const last24h = rows.reduce((a, r) => a + r.last24h, 0);
    expect(last24h).toBeLessThan(meanBaseline(rows) * 0.5);
  });

  it("is healthy now: one burst day does not set the bar for the week", () => {
    const v = classifyVolume(rows);
    expect(v.kind).toBe("healthy");
    expect(v.baselinePerDay).toBe(135); // (6 x 105 + the burst day capped at 3 x 105) / 7
    expect(v.cappedDays).toBe(1);
  });

  it("still pages when the big buyer really stops, burst or not", () => {
    const v = classifyVolume([daily("big", bigDaily, 0), perDay("small1", 3, 0), perDay("small2", 2, 0)]);
    expect(v.kind).toBe("broad");
    expect(v.baselinePerDay).toBe(135);
  });

  it("a burst by a small payer does not make it outrank the steady buyer", () => {
    const v = classifyVolume([perDay("steady", 100, 0), daily("burst", [0, 0, 0, 900, 0, 0, 0], 0), perDay("c", 5, 5)]);
    expect(v.kind).toBe("concentrated");
    if (v.kind !== "concentrated") throw new Error("unreachable");
    expect(v.topBuyers[0]!.payerHashPrefix).toBe("steady");
    expect(v.topBuyers.reduce((a, b) => a + b.share, 0)).toBeLessThanOrEqual(1);
  });
});

describe("classifyVolume, what the plain mean already got right stays right (review rounds 1 and 2)", () => {
  it("a quiet weekend day does not page", () => {
    const v = classifyVolume([daily("a", [100, 100, 100, 100, 100, 45, 45], 45)]);
    expect(v.kind).toBe("healthy");
    expect(v.baselinePerDay).toBe(meanBaseline([daily("a", [100, 100, 100, 100, 100, 45, 45], 0)]));
  });

  it("a deep outage keeps paging until its last healthy day ages out, as the mean did (review round 2)", () => {
    for (const history of [[0, 0, 0, 0, 100, 100, 100], [0, 0, 0, 0, 0, 100, 100], [0, 0, 0, 0, 0, 0, 100]]) {
      const v = classifyVolume([daily("a", history, 0)]);
      expect(v.baselinePerDay).toBe(meanBaseline([daily("a", history, 0)]));
      expect(v.kind).toBe("broad");
    }
  });

  it("a rail breaking right after a ramp pages, as the mean did (review round 2)", () => {
    const history = [300, 300, 30, 30, 30, 30, 30];
    const v = classifyVolume([daily("a", history, 20)]);
    expect(v.baselinePerDay).toBe(meanBaseline([daily("a", history, 0)]));
    expect(v.kind).toBe("broad");
  });

  it("a slow degradation keeps paging as long as the mean did", () => {
    // Four days at 30% of normal: the healthy days stay in the baseline.
    const history = [30, 30, 30, 30, 100, 100, 100];
    expect(classifyVolume([daily("a", history, 25)]).baselinePerDay).toBe(meanBaseline([daily("a", history, 0)]));
    expect(classifyVolume([daily("a", history, 25)]).kind).toBe("broad");
  });

  it("a buyer active on three of the seven days still counts, so its stop pages", () => {
    const v = classifyVolume([daily("new", [500, 500, 500, 0, 0, 0, 0], 0)]);
    expect(v.kind).toBe("broad");
  });

  it("shares of two excluded buyers never add up to more than the whole", () => {
    const v = classifyVolume([
      daily("a", [10, 10, 10, 10, 0, 0, 0], 0),
      daily("b", [0, 0, 0, 10, 10, 10, 10], 0),
      perDay("c", 5, 5),
    ]);
    if (v.kind !== "concentrated" && v.kind !== "broad") throw new Error("expected a drop");
    expect(v.topBuyers.reduce((a, b) => a + b.share, 0)).toBeLessThanOrEqual(1);
  });
});
