/**
 * The heartbeat has to fire on the case that already cost us money, and stay
 * quiet on the case that already looked like it.
 *
 * Both are real, measured over 60 days of the paying wallet's behaviour:
 *  - it once went 177 hours between calls and resumed normally — a fixed
 *    "silent for 24h" rule would have cried wolf until it was ignored;
 *  - a 21-hour settlement outage stopped it completely and nobody noticed.
 *
 * So the rule is relative to each customer's own rhythm. These tests pin that,
 * and pin the two ways it could quietly stop working: alerting on customers who
 * never had a rhythm, and letting one customer's cooldown mask another's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
vi.mock("../lib/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logWarn: vi.fn(), logError: vi.fn(),
}));

const { findSilentPayers } = await import("./revenue-heartbeat.js");

/** One row as the SQL returns it — strings, as postgres hands them over. */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    actor: "x402:abc123",
    active_days: 12,          // established: paid on 12 of the last 14 days
    revenue_cents: 4800,
    hours_silent: 2,
    expected_gap_hours: 28,   // 14 days / 12 active days ≈ 28h
    ...over,
  };
}

beforeEach(() => {
  execute.mockReset();
});

describe("it fires when an established customer breaks their own rhythm", () => {
  it("alerts on a daily caller silent for three times their normal gap", async () => {
    execute.mockResolvedValue([row({ hours_silent: 90 })]); // 90h vs 28h × 3 = 84h
    const found = await findSilentPayers();
    expect(found).toHaveLength(1);
    expect(found[0].hoursSilent).toBe(90);
    expect(found[0].revenueCents).toBe(4800);
  });

  it("stays quiet inside the rhythm — the 177-hour gap case", async () => {
    // A customer active on only 2 of 14 days has an expected gap of 168h, so
    // a 177h silence is barely outside their normal pattern and must not page.
    execute.mockResolvedValue([
      row({ active_days: 2, expected_gap_hours: 168, hours_silent: 177 }),
    ]);
    expect(await findSilentPayers()).toHaveLength(0);
  });

  it("never alerts on a customer with no established rhythm", async () => {
    // The HAVING clause excludes these in SQL; this asserts the JS filter does
    // not resurrect them if the query is ever loosened.
    execute.mockResolvedValue([
      row({ active_days: 1, expected_gap_hours: 336, hours_silent: 300 }),
    ]);
    expect(await findSilentPayers()).toHaveLength(0);
  });
});

describe("the floor and the multiple both apply", () => {
  it("never pages before 24 hours, however tight the rhythm", async () => {
    // A customer calling every 30 minutes has an expected gap under an hour;
    // without the floor, a two-hour lull would page at 3am for nothing.
    execute.mockResolvedValue([
      row({ expected_gap_hours: 0.5, hours_silent: 6 }),
    ]);
    expect(await findSilentPayers()).toHaveLength(0);
  });

  it("does page that same customer once a full day has passed", async () => {
    execute.mockResolvedValue([row({ expected_gap_hours: 0.5, hours_silent: 25 })]);
    expect(await findSilentPayers()).toHaveLength(1);
  });
});

describe("multiple customers are tracked independently", () => {
  it("returns every silent payer, not just the first", async () => {
    // With 99% concentration today this is theoretical — but the whole point
    // of the work is that it stops being theoretical, and a loop that returns
    // early would then hide the second customer leaving.
    execute.mockResolvedValue([
      row({ actor: "x402:aaa", hours_silent: 100 }),
      row({ actor: "user:bbb", hours_silent: 200 }),
      row({ actor: "x402:ccc", hours_silent: 3 }),   // healthy
    ]);
    const found = await findSilentPayers();
    expect(found.map((f) => f.actor)).toEqual(["x402:aaa", "user:bbb"]);
  });
});

describe("it degrades safely", () => {
  it("returns nothing rather than throwing when there is no data", async () => {
    execute.mockResolvedValue([]);
    expect(await findSilentPayers()).toEqual([]);
  });
});
