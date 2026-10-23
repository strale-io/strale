/**
 * Routing of dependency outages between an immediate email and the daily
 * summary (external-outage-digest.ts).
 *
 * Before: every confirmed outage and recovery of a third-party source was its
 * own email — 577 in two months, none actionable. After: external outages are
 * recorded for the daily summary; only Strale's own services, and an external
 * outage that has lasted an hour AND failed paying customers' calls, email at
 * once.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SituationAssessment } from "./situation-assessment.js";

const sentEmails: Array<{ subject: string; html: string }> = [];
const healthEvents: Array<{ eventType: string; details: Record<string, unknown> }> = [];
const queries: string[] = [];
const rawQueries: unknown[] = [];
let paidFailures = 0;
let alreadyEscalated = false;

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
    execute: async (q: unknown) => {
      const text = JSON.stringify(q);
      queries.push(text);
      rawQueries.push(q);
      if (text.includes("FROM transactions")) return [{ cnt: paidFailures }];
      if (text.includes("alert_sent")) return alreadyEscalated ? [{ "?column?": 1 }] : [];
      return [];
    },
  }),
}));

function assessment(dependency: string, overrides: Partial<SituationAssessment["impact"]> = {}): SituationAssessment {
  return {
    trigger: `${dependency}_probe_failed`,
    timestamp: new Date().toISOString(),
    correlatedSignals: [],
    rootCause: {
      category: "external_service",
      confidence: "high",
      explanation: `${dependency} is not responding. External service.`,
      evidence: ["Probe error: timeout"],
    },
    impact: { severity: "warning", customersAffected: false, capabilitiesAffected: 3, affectedSlugs: [], ...overrides },
    action: { type: "investigate", selfResolving: false, estimatedRecoveryMinutes: null, operatorSteps: [], automaticActions: [] },
  };
}

const START = new Date("2026-10-22T10:00:00Z");
let handle: typeof import("./intelligent-alerts.js")["handleDependencyProbeResult"];

/** Advance the clock and feed one probe result. */
async function probe(dependency: string, healthy: boolean, atMinute: number, a = assessment(dependency)) {
  vi.setSystemTime(new Date(START.getTime() + atMinute * 60_000));
  await handle(dependency, healthy, a);
}

beforeEach(async () => {
  sentEmails.length = 0;
  healthEvents.length = 0;
  queries.length = 0;
  rawQueries.length = 0;
  paidFailures = 0;
  alreadyEscalated = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.resetModules();
  ({ handleDependencyProbeResult: handle } = await import("./intelligent-alerts.js"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("external dependency outages go to the daily summary", () => {
  it("does not email a confirmed outage or its recovery (the old 'not responding' + 'recovered' pair)", async () => {
    await probe("openalex", false, 0);
    await probe("openalex", false, 2);
    await probe("openalex", false, 4);
    await probe("openalex", true, 30);
    expect(sentEmails).toHaveLength(0);
    const reasons = healthEvents.map((e) => e.details.suppression_reason);
    expect(reasons).toContain("External dependency — reported in the daily outage summary, not emailed");
    expect(reasons).toContain("External dependency recovered — reported in the daily outage summary");
  });

  it("does not email a long outage when no paying customer's call failed", async () => {
    paidFailures = 0;
    for (let m = 0; m <= 6 * 60; m += 2) await probe("openalex", false, m);
    expect(sentEmails).toHaveLength(0);
  });

  it("does not email the 'multiple dependencies failing' assessment for an external source", async () => {
    const multi = assessment("vies");
    multi.rootCause.category = "transient_network";
    multi.rootCause.explanation = "Multiple dependencies failing simultaneously (vies, nvd, arxiv).";
    await probe("vies", false, 0, multi);
    await probe("vies", false, 2, multi);
    expect(sentEmails).toHaveLength(0);
  });

  it("does not count paid failures before the outage has lasted an hour", async () => {
    paidFailures = 5;
    for (let m = 0; m < 60; m += 2) await probe("vies", false, m);
    expect(sentEmails).toHaveLength(0);
    expect(queries.some((q) => q.includes("FROM transactions"))).toBe(false);
  });
});

describe("an external outage hurting paying customers emails at once", () => {
  it("emails once after an hour of downtime with failed paid calls, then emails the recovery", async () => {
    paidFailures = 2;
    for (let m = 0; m <= 120; m += 2) await probe("vies", false, m);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].subject).toMatch(/^🔴 Strale — VIES \(EU Commission\) down 1 h and failing paying customers' calls/);
    expect(sentEmails[0].html).toContain("2 paid customer calls to tools that use VIES (EU Commission) failed");

    const sent = healthEvents.filter((e) => e.details.alert_sent === true);
    expect(sent).toHaveLength(1);
    expect(sent[0].details).toMatchObject({ trigger: "vies_probe_failed", severity: "critical", customers_affected: true });

    // Recovery after the 60-minute flap cooldown has passed.
    await probe("vies", true, 200);
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[1].subject).toBe("Strale — VIES (EU Commission) recovered");
  });

  it("counts only paid, non-internal failures of the source's own capabilities, with a string-bound time", async () => {
    paidFailures = 1;
    for (let m = 0; m <= 62; m += 2) await probe("vies", false, m);
    const q = queries.find((x) => x.includes("FROM transactions"))!;
    expect(q).toContain("is_free_tier");
    expect(q).toContain("lower(email) LIKE");
    expect(q).toContain('"vat-validate"');
    // postgres-js cannot encode a Date bound into sql`` (the PR #43 incident).
    const hasDate = (v: unknown): boolean =>
      v instanceof Date || (typeof v === "object" && v !== null && Object.values(v).some(hasDate));
    expect(rawQueries.some(hasDate)).toBe(false);
  });

  it("does not email again for an outage already emailed before a restart", async () => {
    paidFailures = 3;
    alreadyEscalated = true;
    for (let m = 0; m <= 120; m += 2) await probe("vies", false, m);
    expect(sentEmails).toHaveLength(0);
  });

  it("counts the customer-impact signal the assessment already carries (piggyback traffic)", async () => {
    const hurt = assessment("anthropic", { customersAffected: true, severity: "critical" });
    for (let m = 0; m <= 62; m += 2) await probe("anthropic", false, m, hurt);
    expect(sentEmails).toHaveLength(1);
  });
});

describe("Strale's own services still alert at once", () => {
  it("emails a confirmed Browserless outage without waiting for the summary", async () => {
    const own = assessment("browserless");
    own.rootCause.category = "strale_infrastructure";
    own.rootCause.explanation = "Browserless (Chromium) is not responding.";
    await probe("browserless", false, 0, own);
    expect(sentEmails).toHaveLength(0); // first failure is still buffered
    await probe("browserless", false, 2, own);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].subject).toContain("Browserless (Chromium) is not responding");
    await probe("browserless", true, 90, own);
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[1].subject).toBe("Strale — Browserless (Chromium) recovered");
  });
});
