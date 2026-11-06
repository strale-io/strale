/**
 * classifyVolume, the pure decision behind the x402 settlement watch. The SQL
 * and the alert wiring are covered against real Postgres in
 * x402-settlement-watch.integration.test.ts; these pin the edge cases.
 */
import { describe, expect, it } from "vitest";
import { classifyVolume, median, type PayerRow } from "./x402-settlement-watch.js";

/** A payer with the same count on each of the seven baseline days. */
const perDay = (payer: string | null, base: number, last24h: number): PayerRow =>
  ({ payer, priorDaily: new Array(7).fill(base), last24h });

/** A payer with an explicit day-by-day history (index 0 = 24–48h ago). */
const daily = (payer: string | null, priorDaily: number[], last24h: number): PayerRow => ({ payer, priorDaily, last24h });

/** The pre-fix rule, kept here only to show the replayed case fired under it. */
const meanBaseline = (rows: PayerRow[]) => rows.reduce((a, r) => a + r.priorDaily.reduce((x, n) => x + n, 0), 0) / 7;

describe("median", () => {
  it("is the middle value, the mean of the middle two, or 0 for nothing", () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([4, 1, 9, 6])).toBe(5);
    expect(median([])).toBe(0);
  });
});

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

describe("classifyVolume, robust baseline (incident 2026-11-03)", () => {
  // Replay of the shape, with round illustrative counts rather than production
  // figures: one big buyer settles a steady amount a day, a few small payers
  // settle a little, and on one day the big buyer ran a single job many times
  // its normal day. Four days later the buyer paused for part of a day and was
  // back within hours, so the last 24h is somewhat below a normal day.
  // Index 3 is 96–120h back: 2026-10-30 as seen from 2026-11-03.
  const bigDaily = [100, 100, 100, 1000, 100, 100, 100];
  const rows = [daily("big", bigDaily, 60), perDay("small1", 3, 3), perDay("small2", 2, 2)];

  it("fired under the old mean baseline", () => {
    const last24h = rows.reduce((a, r) => a + r.last24h, 0);
    expect(last24h).toBeLessThan(meanBaseline(rows) * 0.5);
  });

  it("is healthy now: one burst day does not set the bar for the week", () => {
    const v = classifyVolume(rows);
    expect(v.kind).toBe("healthy");
    expect(v.baselinePerDay).toBe(105);
  });

  it("still pages when the big buyer really stops, burst or not", () => {
    const v = classifyVolume([daily("big", bigDaily, 0), perDay("small1", 3, 0), perDay("small2", 2, 0)]);
    expect(v.kind).toBe("broad");
    expect(v.baselinePerDay).toBe(105);
  });

  it("a burst by a small payer does not make it outrank the steady buyer", () => {
    const v = classifyVolume([perDay("steady", 100, 0), daily("burst", [0, 0, 0, 900, 0, 0, 0], 0), perDay("c", 5, 5)]);
    expect(v.kind).toBe("concentrated");
    if (v.kind !== "concentrated") throw new Error("unreachable");
    expect(v.topBuyers[0]!.payerHashPrefix).toBe("steady");
    expect(v.excluded).toBe(1);
    expect(v.topBuyers[0]!.share).toBeLessThanOrEqual(1);
  });

  it("a quiet day or two in the baseline does not lower the bar either", () => {
    const v = classifyVolume([daily("a", [100, 0, 100, 100, 0, 100, 100], 40)]);
    expect(v.baselinePerDay).toBe(100);
    expect(v.kind).toBe("broad");
  });
});
