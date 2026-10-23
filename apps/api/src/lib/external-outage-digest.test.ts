/**
 * Daily summary of outside data-source outages (replaces one email per
 * outage/recovery for third-party dependencies — 577 emails in two months).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const sentEmails: Array<{ subject: string; html: string }> = [];
const healthEvents: Array<{ eventType: string; details: Record<string, unknown> }> = [];
let probeRows: Array<{ dependency: string; created_at: string; healthy: boolean }> = [];
let lastWindowEnd: string | null = null;

vi.mock("./digest-sender.js", () => ({
  isEmailConfigured: () => true,
  sendDigestEmail: async (html: string, subject: string) => {
    sentEmails.push({ subject, html });
  },
}));

vi.mock("./health-monitor.js", () => ({
  logHealthEvent: async (e: { eventType: string; details: Record<string, unknown> }) => {
    healthEvents.push(e);
  },
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: async (q: unknown) =>
      JSON.stringify(q).includes("'external_outage_digest'")
        ? (lastWindowEnd ? [{ window_end: lastWindowEnd }] : [])
        : probeRows,
  }),
}));

import {
  isExternalDependency,
  summarizeExternalOutages,
  renderExternalOutageDigest,
  sendExternalOutageDigest,
  isDigestSendHour,
  digestWindowStart,
  type ProbeRow,
} from "./external-outage-digest.js";

const T0 = new Date("2026-10-22T06:00:00Z"); // 08:00 Swedish summer time
const END = new Date(T0.getTime() + 24 * 3600_000);
const min = (m: number) => new Date(T0.getTime() + m * 60_000);
const p = (dependency: string, minute: number, healthy: boolean): ProbeRow => ({ dependency, at: min(minute), healthy });
const allExternal = () => true;

beforeEach(() => {
  sentEmails.length = 0;
  healthEvents.length = 0;
  probeRows = [];
  lastWindowEnd = null;
});

describe("isExternalDependency", () => {
  it("treats third-party sources as external", () => {
    expect(isExternalDependency("openalex")).toBe(true);
    expect(isExternalDependency("vies")).toBe(true);
    expect(isExternalDependency("usgs-earthquake")).toBe(true);
  });

  it("treats Strale's own Browserless and unknown names as ours, so they keep alerting at once", () => {
    expect(isExternalDependency("browserless")).toBe(false);
    expect(isExternalDependency("not-a-known-dependency")).toBe(false);
  });
});

describe("summarizeExternalOutages", () => {
  it("counts confirmed outages and total downtime, and ignores single missed checks", () => {
    const rows = [
      p("vies", 0, true), p("vies", 10, false), p("vies", 20, false), p("vies", 40, true), // 30 min outage
      p("vies", 100, false), p("vies", 110, true), // blip — ignored
      p("vies", 200, false), p("vies", 210, false), p("vies", 215, false), p("vies", 300, true), // 100 min outage
    ];
    const [s] = summarizeExternalOutages(rows, T0, END, allExternal);
    expect(s).toMatchObject({ dependency: "vies", outages: 2, downMinutes: 130, longestMinutes: 100, stillDown: false });
  });

  it("marks an outage with no recovery yet as still down, with when it started", () => {
    const rows = [p("openalex", 0, true), p("openalex", 600, false), p("openalex", 610, false)];
    const [s] = summarizeExternalOutages(rows, T0, END, allExternal);
    expect(s.stillDown).toBe(true);
    expect(s.downSince).toEqual(min(600));
    expect(s.downSinceIsLowerBound).toBe(false);
    expect(s.downMinutes).toBe(24 * 60 - 600);
  });

  it("clips downtime to the window but reports the real start of an outage that began before it", () => {
    const rows = [p("arxiv", -200, true), p("arxiv", -120, false), p("arxiv", -110, false), p("arxiv", 30, true)];
    const [s] = summarizeExternalOutages(rows, T0, END, allExternal);
    expect(s.downMinutes).toBe(30);
    expect(s.longestMinutes).toBe(150);
  });

  it("leaves out an outage that ended before the window and a dependency that only blipped", () => {
    const rows = [
      p("nvd", -100, false), p("nvd", -90, false), p("nvd", -80, true),
      p("sudreg", 5, false), p("sudreg", 6, true),
    ];
    expect(summarizeExternalOutages(rows, T0, END, allExternal)).toEqual([]);
  });

  it("drops Strale's own dependencies (they alert immediately instead)", () => {
    const rows = [p("browserless", 0, false), p("browserless", 10, false)];
    expect(summarizeExternalOutages(rows, T0, END)).toEqual([]);
  });

  it("lists still-down sources first, then by downtime", () => {
    const rows = [
      p("a", 0, false), p("a", 10, false), p("a", 300, true),
      p("b", 0, false), p("b", 10, false), p("b", 20, true),
      p("c", 1000, false), p("c", 1010, false),
    ];
    expect(summarizeExternalOutages(rows, T0, END, allExternal).map((s) => s.dependency)).toEqual(["c", "a", "b"]);
  });
});

describe("renderExternalOutageDigest", () => {
  it("names each source, says what is still down, in Swedish time and plain language", () => {
    const rows = [
      p("openalex", 600, false), p("openalex", 610, false),
      p("usgs-earthquake", 0, true), p("usgs-earthquake", 60, false), p("usgs-earthquake", 70, false), p("usgs-earthquake", 100, true),
    ];
    const summaries = summarizeExternalOutages(rows, T0, END);
    const { subject, html } = renderExternalOutageDigest(summaries, T0, END);
    expect(subject).toBe("Strale — outside data sources, daily summary: 2 had outages, 1 still down");
    expect(html).toContain("Still down now");
    expect(html).toContain("Had outages, back now");
    expect(html).toContain("1 outage, 40 min down in total");
    // 600 min after 08:00 Swedish time = 18:00 Swedish time (16:00 UTC).
    expect(html).toContain("down since before Thu 22 Oct, 18:00");
    expect(html).toContain("Nothing here needs you");
    expect(html.indexOf("Still down now")).toBeLessThan(html.indexOf("Had outages, back now"));
  });
});

describe("sendExternalOutageDigest", () => {
  it("sends nothing on a day with no outages, and records that it ran", async () => {
    probeRows = [{ dependency: "vies", created_at: min(5).toISOString(), healthy: false }];
    const result = await sendExternalOutageDigest(END);
    expect(result).toMatchObject({ sent: false, reason: "nothing_to_report" });
    expect(sentEmails).toHaveLength(0);
    expect(healthEvents[0]).toMatchObject({ eventType: "external_outage_digest", details: { sent: false } });
  });

  it("sends one email covering every source that went down", async () => {
    probeRows = [
      { dependency: "vies", created_at: min(5).toISOString(), healthy: false },
      { dependency: "vies", created_at: min(6).toISOString(), healthy: false },
      { dependency: "vies", created_at: min(30).toISOString(), healthy: true },
      { dependency: "nvd", created_at: min(50).toISOString(), healthy: false },
      { dependency: "nvd", created_at: min(51).toISOString(), healthy: false },
    ];
    const result = await sendExternalOutageDigest(END);
    expect(result.sent).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].html).toContain("VIES");
    expect(sentEmails[0].html).toContain("NVD");
    expect(healthEvents[0]).toMatchObject({ eventType: "external_outage_digest", details: { sent: true } });
  });

  it("previews without sending", async () => {
    probeRows = [
      { dependency: "vies", created_at: min(5).toISOString(), healthy: false },
      { dependency: "vies", created_at: min(6).toISOString(), healthy: false },
    ];
    const result = await sendExternalOutageDigest(END, { previewOnly: true });
    expect(result).toMatchObject({ sent: false, reason: "preview" });
    expect(result.html).toContain("VIES");
    expect(sentEmails).toHaveLength(0);
  });
});

describe("digestWindowStart", () => {
  it("starts where the previous summary ended, so a late send leaves no gap and an early one no overlap", () => {
    const prev = new Date(END.getTime() - 26 * 3600_000);
    expect(digestWindowStart(END, prev)).toEqual(prev);
  });

  it("defaults to 24 hours, and catches up at most 48 hours after a missed day", () => {
    expect(digestWindowStart(END, null)).toEqual(new Date(END.getTime() - 24 * 3600_000));
    expect(digestWindowStart(END, new Date(END.getTime() - 5 * 86400_000))).toEqual(new Date(END.getTime() - 48 * 3600_000));
  });

  it("is used by the send: the window in the record starts at the previous window's end", async () => {
    lastWindowEnd = new Date(END.getTime() - 20 * 3600_000).toISOString();
    await sendExternalOutageDigest(END);
    expect(healthEvents[0].details.window_start).toBe(lastWindowEnd);
  });
});

describe("isDigestSendHour", () => {
  it("is open 08:00–11:59 Swedish time, across summer and winter time", () => {
    expect(isDigestSendHour(new Date("2026-10-22T05:59:00Z"))).toBe(false); // 07:59 CEST
    expect(isDigestSendHour(new Date("2026-10-22T06:00:00Z"))).toBe(true);  // 08:00 CEST
    expect(isDigestSendHour(new Date("2026-10-22T09:59:00Z"))).toBe(true);  // 11:59 CEST
    expect(isDigestSendHour(new Date("2026-10-22T10:00:00Z"))).toBe(false); // 12:00 CEST
    expect(isDigestSendHour(new Date("2026-12-01T07:00:00Z"))).toBe(true);  // 08:00 CET
    expect(isDigestSendHour(new Date("2026-12-01T06:59:00Z"))).toBe(false); // 07:59 CET
  });
});
