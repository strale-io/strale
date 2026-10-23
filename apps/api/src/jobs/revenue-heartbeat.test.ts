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
 *
 * Since 2026-10-23 they also pin the two ways it got noisy in production (78
 * alerts in 30 days): re-paging the same silence every 12 hours, and paging a
 * bursty caller on its ordinary overnight pauses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
const sentKeys: string[] = [];
const alertLedger = new Set<string>();
vi.mock("../lib/alert-once.js", () => ({
  // Same contract as the real alertOnce: one send per key inside the cooldown.
  alertOnce: async (key: string) => {
    if (alertLedger.has(key)) return false;
    alertLedger.add(key);
    sentKeys.push(key);
    return true;
  },
}));
vi.mock("../lib/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logWarn: vi.fn(), logError: vi.fn(),
}));

const { findSilentPayers, tick, silenceAlertKey } = await import("./revenue-heartbeat.js");

/** One row as the SQL returns it — strings, as postgres hands them over. */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    actor: "x402:abc123",
    active_days: 12,          // established: paid on 12 of the last 14 days
    revenue_cents: 4800,
    hours_silent: 2,
    usual_long_gap_hours: 28, // their 95th-percentile pause between paid calls
    last_paid_at: "2026-10-20T08:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  execute.mockReset();
  sentKeys.length = 0;
  alertLedger.clear();
});

describe("it fires when an established customer breaks their own rhythm", () => {
  it("alerts on a caller silent for twice their usual long pause", async () => {
    execute.mockResolvedValue([row({ hours_silent: 90 })]); // 90h vs 28h × 2 = 56h
    const found = await findSilentPayers();
    expect(found).toHaveLength(1);
    expect(found[0].hoursSilent).toBe(90);
    expect(found[0].revenueCents).toBe(4800);
  });

  it("stays quiet inside the rhythm — the 177-hour gap case", async () => {
    // A customer whose usual long pause is a week: a 177h silence is barely
    // outside their normal pattern and must not page.
    execute.mockResolvedValue([
      row({ active_days: 2, usual_long_gap_hours: 168, hours_silent: 177 }),
    ]);
    expect(await findSilentPayers()).toHaveLength(0);
  });

  it("never alerts on a customer with no established rhythm", async () => {
    // The HAVING clause excludes these in SQL; this asserts the JS filter does
    // not resurrect them if the query is ever loosened.
    execute.mockResolvedValue([
      row({ active_days: 1, usual_long_gap_hours: 336, hours_silent: 300 }),
    ]);
    expect(await findSilentPayers()).toHaveLength(0);
  });
});

describe("the floor and the multiple both apply", () => {
  // The floor was 24 hours until 2026-08-16, which — combined with a cadence
  // estimate that could not return under ~24h — meant the minimum possible
  // alert latency was ~72 hours. The 21-hour settlement outage this job was
  // built for could not have fired it. The floor is now 6.
  it("does not page a half-hourly customer over a brief lull", async () => {
    execute.mockResolvedValue([
      row({ usual_long_gap_hours: 0.5, hours_silent: 3 }),
    ]);
    expect(await findSilentPayers()).toHaveLength(0);
  });

  it("pages that customer well inside the 21-hour incident window", async () => {
    execute.mockResolvedValue([row({ usual_long_gap_hours: 0.5, hours_silent: 7 })]);
    expect(await findSilentPayers()).toHaveLength(1);
  });

  it("still respects the multiple for a genuinely slow caller", async () => {
    // Usually pauses up to a day: silent 40h is within their rhythm, 80h is not.
    execute.mockResolvedValue([row({ usual_long_gap_hours: 24, hours_silent: 40 })]);
    expect(await findSilentPayers()).toHaveLength(0);
    execute.mockResolvedValue([row({ usual_long_gap_hours: 24, hours_silent: 80 })]);
    expect(await findSilentPayers()).toHaveLength(1);
  });

  it("does not page a bursty caller on an ordinary overnight pause", async () => {
    // The production case: an account averaging a 2.8h gap (the old bar was
    // 3 × 2.8 ≈ 8h) whose 95th-percentile pause is 10.5h. A 9.7h pause paged
    // it under the old rule; it is normal for them.
    execute.mockResolvedValue([row({ usual_long_gap_hours: 10.5, hours_silent: 9.7 })]);
    expect(await findSilentPayers()).toHaveLength(0);
    execute.mockResolvedValue([row({ usual_long_gap_hours: 10.5, hours_silent: 22 })]);
    expect(await findSilentPayers()).toHaveLength(1);
  });

  it("reads the rhythm as a percentile of gaps between calls, not an average", async () => {
    execute.mockResolvedValue([]);
    await findSilentPayers();
    const query = JSON.stringify(execute.mock.calls[0][0]);
    expect(query).toContain("percentile_cont(");
    expect(query).toContain("0.95");
    expect(query).toContain("LAG(created_at)");
  });
});

describe("one alert per silence", () => {
  it("alerts once while the same silence grows, instead of every 12 hours", async () => {
    // The production case: a wallet that stopped was paged at 24h, 36h … 230h.
    for (const hours of [12, 24, 36, 48, 120, 230]) {
      execute.mockResolvedValue([row({ usual_long_gap_hours: 3, hours_silent: hours })]);
      await tick();
    }
    expect(sentKeys).toHaveLength(1);
  });

  it("re-arms when the customer pays again, and a new silence alerts straight away", async () => {
    execute.mockResolvedValue([row({ usual_long_gap_hours: 1, hours_silent: 8 })]);
    await tick();
    // They come back, then go quiet again: a different last paid call.
    execute.mockResolvedValue([]);
    await tick();
    execute.mockResolvedValue([
      row({ usual_long_gap_hours: 1, hours_silent: 7, last_paid_at: "2026-10-22T09:00:00.000Z" }),
    ]);
    await tick();
    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[0]).not.toBe(sentKeys[1]);
  });

  it("keys each customer separately, so one customer's alert never masks another's", () => {
    const a = silenceAlertKey({ actor: "x402:aaa", lastPaidAt: "2026-10-20T08:00:00.000Z" });
    const b = silenceAlertKey({ actor: "user:bbb", lastPaidAt: "2026-10-20T08:00:00.000Z" });
    expect(a).not.toBe(b);
    expect(a).toBe("revenue-heartbeat:x402:aaa:2026-10-20T08:00:00.000Z");
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
