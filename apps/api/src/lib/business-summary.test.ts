import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  revenue: vi.fn(), payers: vi.fn(), weeks: vi.fn(), sellers: vi.fn(), send: vi.fn(), configured: vi.fn(), register: vi.fn(),
  events: [] as { event_type: string; details: Record<string, string> }[], failRecord: false,
  queries: [] as { sql: string; params: unknown[] }[],
}));
vi.mock("./metrics/metrics.js", () => ({ revenueCents: mocks.revenue, topSellers: mocks.sellers }));
vi.mock("./metrics/commercial.js", async (original) => ({
  ...await original<typeof import("./metrics/commercial.js")>(), payerFacts: mocks.payers, discreteWeeks: mocks.weeks,
}));
vi.mock("./digest-sender.js", () => ({
  isEmailConfigured: mocks.configured, sendPrivateDigestEmail: mocks.send,
  preparePrivateDigestEmail: (html: string, subject: string) => ({ html, subject, from: "report@example.test", to: process.env.HEALTH_DIGEST_EMAIL, reply_to: process.env.HEALTH_DIGEST_EMAIL }),
}));
vi.mock("./job-coordinator.js", () => ({ registerJobSync: mocks.register }));
vi.mock("../db/index.js", () => {
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const compiled = new PgDialect().sqlToQuery(query);
      mocks.queries.push(compiled);
      if (compiled.sql.includes("business_summary_deliveries")) {
        const prepared = mocks.events.find((e) => e.event_type === "business_summary_prepared");
        return prepared ? [{ payload: prepared.details, sent_at: mocks.events.some((e) => e.event_type === "business_summary_sent") ? "2026-11-10T08:00:00Z" : null }] : [];
      }
      if (compiled.sql.includes("pg_advisory")) return [];
      return [{ settled_x402_calls: 3, settled_x402_revenue_cents: 120, completed_paid_calls: 5, failed_priced_attempts: 2, anonymous_free_calls: 7, anonymous_free_ip_hashes: 4 }];
    },
    insert: () => ({ values: async (value: { payload: Record<string, string> }) => {
      mocks.events.push({ event_type: "business_summary_prepared", details: value.payload });
    } }),
    update: () => ({ set: () => ({ where: async () => {
      if (mocks.failRecord) throw new Error("record failed");
      mocks.events.push({ event_type: "business_summary_sent", details: {} });
    } }) }),
    transaction: async <T>(fn: (db: unknown) => Promise<T>) => fn(db),
  };
  return { getDb: () => db, withDatabase: (_: unknown, fn: () => unknown) => fn() };
});

import { businessReportDay, collectBusinessSummary, renderBusinessSummary, sendBusinessSummary, startBusinessSummary } from "./business-summary.js";
import { observeJobOutcome } from "./job-run-context.js";

const now = new Date("2026-11-10T08:00:00Z");
const observed = (value: unknown) => ({ status: "observed", value });
beforeEach(() => {
  vi.clearAllMocks(); mocks.events.length = 0; mocks.queries.length = 0; mocks.failRecord = false;
  vi.stubEnv("HEALTH_DIGEST_EMAIL", "owner@example.test");
  mocks.configured.mockReturnValue(true); mocks.send.mockResolvedValue(undefined);
  mocks.revenue.mockResolvedValue(observed(1000));
  mocks.payers.mockResolvedValue(observed({ unattributedCents: 100, payers: [
    { key: "private-payer-A", cents: 700, calls: 7, activeDays: 3 },
    { key: "private-payer-B", cents: 200, calls: 2, activeDays: 1 },
  ] }));
  mocks.weeks.mockResolvedValue(observed([
    { startsOn: "2026-11-09", cents: 9000, payers: 1, calls: 100, partial: true, daysElapsed: 2 },
    { startsOn: "2026-11-02", cents: 1000, payers: 2, calls: 20, partial: false, daysElapsed: 7 },
    { startsOn: "2026-10-26", cents: 2000, payers: 3, calls: 40, partial: false, daysElapsed: 7 },
  ]));
  mocks.sellers.mockResolvedValue(observed([{ slug: "test-tool", calls: 3, cents: 300 }]));
});
afterEach(() => vi.unstubAllEnvs());

describe("business summary metrics", () => {
  it("uses the commercial brief's completed UTC week, excludes the partial week and strips identities", async () => {
    const summary = await collectBusinessSummary("2026-11-10");
    expect(summary.daily.from).toBe("2026-11-09T00:00:00.000Z");
    expect(summary.daily.to).toBe("2026-11-09T23:59:59.999Z");
    expect(summary.last_completed_week.from).toBe("2026-11-02T00:00:00.000Z");
    expect(summary.last_completed_week.to).toBe("2026-11-08T23:59:59.999Z");
    expect(summary.last_completed_week).toMatchObject({ revenue_cents: 1000, top_share: 0.7, other_identified_payers_cents: 200, unattributed_cents: 100, repeat_payers: 1, repeat_payer_revenue_cents: 700 });
    expect(summary.growth.kind).toBe("falling");
    expect(summary.completed_weeks).toHaveLength(2);
    expect(JSON.stringify(summary)).not.toContain("private-payer");
    expect(mocks.payers).toHaveBeenCalledWith(expect.objectContaining({ from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-08T23:59:59.999Z") }));
  });
  it("uses the previous completed week on Monday, not an empty new week", async () => {
    const s = await collectBusinessSummary("2026-11-09");
    expect(s.last_completed_week.from).toBe("2026-11-02T00:00:00.000Z");
  });
  it("does not manufacture zero revenue or payer counts when measurement is unavailable", async () => {
    mocks.revenue.mockResolvedValue({ status: "unavailable" }); mocks.payers.mockResolvedValue({ status: "unavailable" });
    const s = await collectBusinessSummary("2026-11-10");
    expect(s.daily.revenue_cents).toBeNull(); expect(s.daily.payers).toBeNull(); expect(s.daily.top_share).toBeNull();
    expect(renderBusinessSummary(s).html).toContain("Unavailable");
  });
  it("keeps entirely unattributed revenue and distinguishes a genuine zero-sales day", async () => {
    mocks.payers.mockResolvedValue({ status: "unavailable", reason: { kind: "no_data" } });
    let s = await collectBusinessSummary("2026-11-10");
    expect(s.daily.unattributed_cents).toBe(1000); expect(s.daily.payers).toBeNull();
    mocks.revenue.mockResolvedValue(observed(0)); s = await collectBusinessSummary("2026-11-10");
    expect(s.daily.payers).toBe(0); expect(s.daily.other_identified_payers_cents).toBe(0);
  });
  it("does not present estimated concentration as observed", async () => {
    const facts = await mocks.payers(); mocks.payers.mockResolvedValue({ ...facts, status: "estimated" });
    expect((await collectBusinessSummary("2026-11-10")).daily.top_share).toBeNull();
  });
  it("uses bounded dates, canonical internal exclusions, and separate failed/free/settled definitions", async () => {
    await collectBusinessSummary("2026-11-10");
    const query = mocks.queries.find((q) => q.sql.includes("FROM transactions"))!;
    expect(query.sql).toContain("NOT IN"); expect(query.sql).toContain("FROM users");
    expect(query.params).toContain("health_probe");
    expect(query.params).toContain("2026-11-09T00:00:00.000Z"); expect(query.params).toContain("2026-11-10T00:00:00.000Z");
    expect(query.params.every((p) => !(p instanceof Date))).toBe(true);
    expect(query.sql).toContain("t.x402_settlement_id IS NOT NULL");
    expect(query.sql).toContain("t.status = 'failed' AND t.price_cents > 0");
    expect(query.sql).toContain("COUNT(DISTINCT t.client_ip_hash)");
  });
  it("escapes catalogue text and labels failures and free hashes honestly", async () => {
    mocks.sellers.mockResolvedValue(observed([{ slug: "<script>&", calls: 1, cents: 10 }]));
    const html = renderBusinessSummary(await collectBusinessSummary("2026-11-10")).html;
    expect(html).toContain("&lt;script&gt;&amp;"); expect(html).not.toContain("<script>");
    expect(html).toContain("not charges"); expect(html).toContain("not people"); expect(html).toContain("Stockholm time");
  });
  it.each(["invalid", "2026-02-30", "2026-1-1"])("rejects invalid report day %s", async (day) => {
    await expect(collectBusinessSummary(day)).rejects.toThrow("Invalid business report date");
  });
  it("shows both complete week amounts and dates without calling one rebound a general trend", async () => {
    const html = renderBusinessSummary(await collectBusinessSummary("2026-11-10")).html;
    expect(html).toContain("2026-11-02: €10.00, compared with €20.00");
    expect(html).toContain("2026-10-26"); expect(html).toContain("Revenue decreased compared with the prior completed week.");
    expect(html).not.toContain("consecutive");
  });
});

describe("delivery and durable scheduling", () => {
  it("opens at 08 Stockholm in both summer and winter", () => {
    expect(businessReportDay(new Date("2026-11-10T06:59:00Z"))).toBeNull();
    expect(businessReportDay(new Date("2026-11-10T07:00:00Z"))).toBe("2026-11-10");
    expect(businessReportDay(new Date("2026-07-10T05:59:00Z"))).toBeNull();
    expect(businessReportDay(new Date("2026-07-10T06:00:00Z"))).toBe("2026-07-10");
    expect(businessReportDay(new Date("2026-11-10T23:10:00Z"))).toBeNull();
  });
  it("does no database work before the send window and earns no success heartbeat", async () => {
    expect((await observeJobOutcome(() => sendBusinessSummary(new Date("2026-11-10T06:00:00Z"))))).toMatchObject({ successful: false, value: { outcome: "not_due" } });
    expect(mocks.queries).toHaveLength(0); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("requires configured email and an explicit private recipient", async () => {
    vi.stubEnv("HEALTH_DIGEST_EMAIL", "");
    await expect(sendBusinessSummary(now)).rejects.toThrow("not configured");
    expect(mocks.events).toHaveLength(0); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("records acceptance after sending and does not resend after a restart", async () => {
    expect((await observeJobOutcome(() => sendBusinessSummary(now))).successful).toBe(true);
    expect(mocks.events.map((e) => e.event_type)).toEqual(["business_summary_prepared", "business_summary_sent"]);
    expect(mocks.send.mock.calls[0][1]).toBe("strale-business-summary-2026-11-10");
    expect(mocks.queries.some((q) => q.sql.includes("'heartbeat:business-summary'"))).toBe(true);
    expect((await observeJobOutcome(() => sendBusinessSummary(now))).successful).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("retries identical content after send failure without claiming success", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(sendBusinessSummary(now)).rejects.toThrow("provider unavailable");
    expect(mocks.events.map((e) => e.event_type)).toEqual(["business_summary_prepared"]);
    mocks.revenue.mockResolvedValue(observed(999999));
    vi.stubEnv("HEALTH_DIGEST_EMAIL", "changed@example.test");
    await sendBusinessSummary(new Date("2026-11-10T09:00:00Z"));
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it("reuses provider idempotency after send success followed by a failed receipt write", async () => {
    mocks.failRecord = true;
    await expect(sendBusinessSummary(now)).rejects.toThrow("record failed");
    mocks.failRecord = false;
    await sendBusinessSummary(now);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it("refuses replay outside provider retention instead of risking duplicate delivery", async () => {
    mocks.events.push({ event_type: "business_summary_prepared", details: { report_day: "2026-11-10", prepared_at: "2026-11-09T08:00:00Z", subject: "old", html: "old" } });
    await expect(sendBusinessSummary(now)).rejects.toThrow("needs reconciliation");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("registers through the existing durable coordinator", () => {
    startBusinessSummary(); expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ name: "business-summary", intervalMs: 3600000, handler: expect.any(Function) }));
  });
});
