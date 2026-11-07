/**
 * classifyVolume, the pure decision behind the x402 settlement watch. The SQL
 * and the alert wiring are covered against real Postgres in
 * x402-settlement-watch.integration.test.ts; these pin the edge cases.
 */
import { describe, expect, it } from "vitest";
import {
  bucketsFromQueryRows,
  capPayerSpikes,
  classifyVolume,
  rowsFromBuckets,
  SPIKE_CAP_FLOOR,
  type PayerRow,
} from "./x402-settlement-watch.js";

/** A payer with the same count on each of the seven baseline days. */
const perDay = (payer: string | null, base: number, last24h: number): PayerRow =>
  ({ payer, priorDaily: new Array(7).fill(base), last24h });

/** A payer with an explicit day-by-day history (index 0 = 24–48h ago). */
const daily = (payer: string | null, priorDaily: number[], last24h: number, contextDaily?: number[]): PayerRow =>
  ({ payer, priorDaily, last24h, ...(contextDaily ? { contextDaily } : {}) });

/** classifyVolume leaves the plain mean in place for these rows. */
const unchangedVerdict = (rows: PayerRow[]) => expect(classifyVolume(rows).baselinePerDay).toBeCloseTo(meanBaseline(rows));

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

describe("capPayerSpikes", () => {
  const unchanged = (row: PayerRow) => expect(capPayerSpikes(row)).toEqual(row.priorDaily);

  it("leaves an ordinary payer alone", () => {
    unchanged(daily("a", [100, 100, 100, 100, 100, 100, 100], 100));
    unchanged(daily("a", [100, 100, 100, 100, 100, 45, 45], 45)); // quiet weekend
    unchanged(daily("a", [0, 100, 0, 100, 0, 100, 0], 100)); // every-other-day buyer
    unchanged(daily("a", [500, 500, 500, 0, 0, 0, 0], 0)); // a buyer three days old
    unchanged(daily("a", [0, 0, 0, 0, 0, 0, 0], 0));
  });

  it("leaves a ramp, an outage and a degradation alone: no usual day on one side", () => {
    unchanged(daily("a", [300, 300, 30, 30, 30, 30, 30], 300)); // ramp still running
    unchanged(daily("a", [300, 300, 30, 30, 30, 30, 30], 0)); // ramp, then the rail broke
    unchanged(daily("a", [0, 0, 0, 0, 100, 10, 10], 0)); // review round 3: a big day, then an outage
    unchanged(daily("a", [0, 0, 0, 0, 0, 500, 500], 0)); // review round 3: a two-day buyer that stopped
    unchanged(daily("a", [30, 30, 30, 30, 100, 100, 100], 25)); // degradation to 30%
    unchanged(daily("a", [1, 1, 1, 1, 100, 100, 100], 1)); // degradation to 1%
  });

  it("caps a burst once the payer is seen at its usual level before and after it", () => {
    expect(capPayerSpikes(daily("a", [100, 100, 100, 1000, 100, 100, 100], 75))).toEqual([100, 100, 100, 300, 100, 100, 100]);
    // review round 3: a job spanning three buckets
    expect(capPayerSpikes(daily("a", [100, 100, 1000, 1000, 1000, 100, 100], 75))).toEqual([100, 100, 300, 300, 300, 100, 100]);
  });

  it("caps a straddle at the oldest edge against the older context days (review round 3)", () => {
    expect(capPayerSpikes(daily("a", [100, 100, 100, 100, 100, 1000, 1000], 100, new Array(7).fill(100))))
      .toEqual([100, 100, 100, 100, 100, 300, 300]);
    // Without the older context, the oldest days have no "before" and stay as they are.
    unchanged(daily("a", [100, 100, 100, 100, 100, 1000, 1000], 100));
  });

  it("has a floor: a capped day is never below SPIKE_CAP_FLOOR, so a payer is never capped away (review round 3)", () => {
    expect(capPayerSpikes(daily("a", [1, 1, 1, 30, 1, 1, 1], 1))).toEqual([1, 1, 1, SPIKE_CAP_FLOOR, 1, 1, 1]);
    unchanged(daily("a", [1, 1, 1, 9, 1, 1, 1], 1));
    for (let seed = 1; seed <= 500; seed++) {
      const r = (k: number) => ((seed * 9301 + k * 49297) % 233280) % 7 === 0 ? (seed * k) % 1500 : (seed + k) % 4;
      const row = daily("a", [0, 1, 2, 3, 4, 5, 6].map(r), r(7), [8, 9, 10, 11, 12, 13, 14].map(r));
      capPayerSpikes(row).forEach((n, d) => {
        expect(n).toBeGreaterThanOrEqual(Math.min(row.priorDaily[d]!, SPIKE_CAP_FLOOR));
        expect(n).toBeLessThanOrEqual(row.priorDaily[d]!);
      });
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
      { payer: "a", dayAgo: 8, n: 6 }, // context: the day before the oldest baseline day
      { payer: "a", dayAgo: 14, n: 9 },
      { payer: "a", dayAgo: 15, n: 99 }, // outside the window
      { payer: null, dayAgo: 3, n: 5 },
    ]);
    expect(rows).toEqual([
      { payer: "a", last24h: 5, priorDaily: [7, 0, 0, 0, 0, 0, 2], contextDaily: [6, 0, 0, 0, 0, 0, 9] },
      { payer: null, last24h: 0, priorDaily: [0, 0, 5, 0, 0, 0, 0], contextDaily: [0, 0, 0, 0, 0, 0, 0] },
    ]);
  });

  it("refuses a malformed bucket instead of losing its count", () => {
    expect(() => rowsFromBuckets([{ payer: "a", dayAgo: Number.NaN, n: 3 }])).toThrow(/malformed bucket/);
    expect(() => rowsFromBuckets([{ payer: "a", dayAgo: 1.5, n: 3 }])).toThrow(/malformed bucket/);
    expect(() => rowsFromBuckets([{ payer: "a", dayAgo: 1, n: -1 }])).toThrow(/malformed bucket/);
  });

  it("refuses a query row with a missing day_ago or n column instead of reading it as 0 (review round 3)", () => {
    expect(() => rowsFromBuckets(bucketsFromQueryRows([{ payer: "a", n: 3 }]))).toThrow(/malformed bucket/);
    expect(() => rowsFromBuckets(bucketsFromQueryRows([{ payer: "a", day_ago: 1 }]))).toThrow(/malformed bucket/);
    expect(() => rowsFromBuckets(bucketsFromQueryRows([{ payer: "a", day_ago: null, n: 3 }]))).toThrow(/malformed bucket/);
    expect(rowsFromBuckets(bucketsFromQueryRows([{ payer: "a", day_ago: "1", n: "3" }]))[0]!.priorDaily[0]).toBe(3);
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
    // The big buyer's burst day capped at 3x its usual 100; the small payers untouched.
    expect(v.baselinePerDay).toBeCloseTo((6 * 100 + 300) / 7 + 5);
    expect(v.cappedPayerDays).toBe(1);
  });

  it("still pages when the big buyer really stops, burst or not", () => {
    const v = classifyVolume([daily("big", bigDaily, 0), perDay("small1", 3, 0), perDay("small2", 2, 0)]);
    expect(v.kind).toBe("broad");
    expect(v.baselinePerDay).toBeCloseTo((6 * 100 + 300) / 7 + 5);
  });

  it("a job spanning three buckets is capped on all three (review round 3)", () => {
    const rows = [daily("big", [100, 100, 1000, 1000, 1000, 100, 100], 100), perDay("small1", 3, 3), perDay("small2", 2, 2)];
    expect(rows.reduce((a, r) => a + r.last24h, 0)).toBeLessThan(meanBaseline(rows) * 0.5); // the mean paged
    const v = classifyVolume(rows);
    expect(v.kind).toBe("healthy");
    expect(v.cappedPayerDays).toBe(3);
  });

  it("a burst in the newest baseline days is capped once a usual baseline day follows it, never on the last 24h alone", () => {
    // The last 24h is what is being judged, so it is not evidence that the buyer came back.
    unchangedVerdict([daily("big", [1000, 1000, 100, 100, 100, 100, 100], 100)]);
    const v = classifyVolume([daily("big", [100, 1000, 1000, 100, 100, 100, 100], 100), perDay("small1", 3, 3)]);
    expect(v.kind).toBe("healthy");
    expect(v.cappedPayerDays).toBe(2);
  });

  it("one buyer's burst never shrinks the steady payers, so a broad drop stays critical (review round 3)", () => {
    // The steady payers fell to two thirds of their own plain baseline: below
    // OTHERS_NEAR_BASELINE_RATIO, so excluding the big buyer must not explain it.
    const v = classifyVolume([
      daily("big", [100, 100, 100, 1000, 100, 100, 100], 0),
      perDay("c", 30, 20),
      perDay("d", 30, 20),
    ]);
    expect(v.kind).toBe("broad");
    if (v.kind !== "broad") throw new Error("unreachable");
    const c = v.topBuyers.find((b) => b.payerHashPrefix === "c");
    expect(c?.baselinePerDay).toBe(30);
  });

  it("a buyer seen on one day only keeps the plain mean (nothing shows it came back), and shares stay within 1", () => {
    const rows = [perDay("steady", 100, 0), daily("burst", [0, 0, 0, 900, 0, 0, 0], 0), perDay("c", 5, 5)];
    const v = classifyVolume(rows);
    expect(v.baselinePerDay).toBeCloseTo(meanBaseline(rows));
    expect(v.kind).toBe("concentrated");
    if (v.kind !== "concentrated") throw new Error("unreachable");
    expect(v.topBuyers.reduce((a, b) => a + b.share, 0)).toBeLessThanOrEqual(1);
  });

  it("counts distinct payers on the same basis as the baseline: context-only payers are not in the 7 days (review round 3)", () => {
    const v = classifyVolume([perDay("a", 100, 0), daily("old", [0, 0, 0, 0, 0, 0, 0], 0, new Array(7).fill(50)), perDay("c", 5, 5)]);
    if (v.kind !== "concentrated" && v.kind !== "broad") throw new Error("expected a drop");
    expect(v.distinctPayers7d).toBe(2);
    expect(v.baselinePerDay).toBe(105);
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

describe("classifyVolume, round-3 shapes keep the plain mean", () => {
  const plain = (rows: PayerRow[]) => expect(classifyVolume(rows).baselinePerDay).toBeCloseTo(meanBaseline(rows));

  it("a ramp made by a new buyer, then a drop, keeps the plain mean and pages", () => {
    // Totals [30, 300, 300, 30, 30, 30, 30]: a steady payer plus a new buyer.
    const rows = [perDay("old", 30, 0), daily("new", [0, 270, 270, 0, 0, 0, 0], 0)];
    plain(rows);
    expect(classifyVolume(rows).kind).toBe("broad");
  });

  it("a healthy level followed by an outage keeps the plain mean, one payer or many", () => {
    plain([daily("a", [0, 0, 0, 0, 100, 10, 10], 0)]);
    const many = ["p", "q", "r", "s", "t"].map((p) => daily(p, [0, 0, 0, 0, 20, 2, 2], 0));
    plain(many);
    expect(classifyVolume(many).kind).toBe("broad");
  });

  it("an outage where all payers fall together keeps the plain mean", () => {
    const rows = ["p", "q", "r"].map((p) => daily(p, [0, 0, 40, 40, 40, 40, 40], 0));
    plain(rows);
    expect(classifyVolume(rows).kind).toBe("broad");
  });
});
