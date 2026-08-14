/**
 * Regression tests for the 2026-08-14 settlement-outage monitoring gaps.
 *
 * Incident: Coinbase's facilitator gives 1,000 free settlements/month, then
 * refuses with `payment-method-required`. Strale crossed it at settlement
 * 1,009; every x402 payment then failed at settle for 21 hours. Verify and
 * execute kept succeeding, so nothing looked broken internally — the only
 * symptom was revenue stopping.
 *
 * Three defects, one test each:
 *   1. No signal on settle failure itself. The only monitor watched settlement
 *      *volume* over a rolling 24h window, so it could not fire until a full
 *      day of good traffic aged out (~21h latency).
 *   2. The volume monitor's cooldown was module-level state; every redeploy
 *      reset it, sending five identical CRITICAL pages in 90 minutes.
 *   3. Routine INFO budget notices were emailed alongside CRITICAL pages, so
 *      the revenue-outage alert competed with noise and was missed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sentAlerts: Array<{ subject: string; severity: string; body: string }> = [];
const executed: string[] = [];
let cooldownRowExists = false;

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (msg: { subject: string; text: string }) => {
        sentAlerts.push({
          subject: msg.subject,
          severity: msg.subject.match(/\[Strale (\w+)\]/)?.[1] ?? "?",
          body: msg.text,
        });
        return { error: null };
      },
    };
  },
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: async (q: unknown) => {
      const text = JSON.stringify(q);
      executed.push(text);
      // The cooldown lookup is the only SELECT this path makes.
      if (text.includes("alert_key") && text.includes("SELECT")) {
        return cooldownRowExists ? [{ "?column?": 1 }] : [];
      }
      return [];
    },
  }),
}));

beforeEach(() => {
  sentAlerts.length = 0;
  executed.length = 0;
  cooldownRowExists = false;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.ALERT_RECIPIENTS = "ops@example.com";
  delete process.env.ALERT_INFO_EMAIL;
  vi.resetModules();
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.ALERT_RECIPIENTS;
  delete process.env.ALERT_INFO_EMAIL;
});

describe("defect 1 — settle failures must page immediately, not via 24h volume", () => {
  it("pages on the exact Coinbase billing refusal that caused the outage", async () => {
    const { alertOnce } = await import("./alert-once.js");
    // The real reason string returned by CDP during the incident.
    const reason =
      'Facilitator settle failed (402): {"errorMessage":"A valid payment method is required to complete the request"}';
    const systemic = /payment[-_ ]?method[-_ ]?required|valid payment method is required/i.test(reason);
    expect(systemic, "billing refusal must classify as systemic").toBe(true);

    await alertOnce("x402-settle-facilitator_billing", 60_000, {
      severity: "critical",
      subject: "x402 settlement is failing — facilitator billing",
      body: "…",
    });
    expect(sentAlerts).toHaveLength(1);
    expect(sentAlerts[0].severity).toBe("CRITICAL");
  });

  it("does not page on ordinary per-payment failures", () => {
    const perPayment = [
      "authorization expired",
      "insufficient funds in payer wallet",
      "nonce already used",
    ];
    const systemic =
      /payment[-_ ]?method[-_ ]?required|valid payment method is required|unauthorized|forbidden|invalid api key|authentication|401|403|quota|rate limit|429|exceeded/i;
    for (const reason of perPayment) {
      expect(systemic.test(reason), `"${reason}" must not page`).toBe(false);
    }
  });
});

describe("defect 2 — cooldown must survive process restarts", () => {
  it("suppresses a repeat alert when the DB shows a recent one", async () => {
    const { alertOnce } = await import("./alert-once.js");
    cooldownRowExists = true; // as if a previous process already paged
    const sent = await alertOnce("x402-settlement-volume-drop", 24 * 60 * 60 * 1000, {
      severity: "critical",
      subject: "x402 settlement volume dropped",
      body: "…",
    });
    expect(sent).toBe(false);
    expect(sentAlerts, "a fresh process must not re-page a live condition").toHaveLength(0);
  });

  it("records the alert so the next process sees the cooldown", async () => {
    const { alertOnce } = await import("./alert-once.js");
    await alertOnce("x402-settlement-volume-drop", 24 * 60 * 60 * 1000, {
      severity: "critical",
      subject: "x402 settlement volume dropped",
      body: "…",
    });
    expect(sentAlerts).toHaveLength(1);
    const wrote = executed.some((q) => q.includes("INSERT INTO health_monitor_events"));
    expect(wrote, "must persist the send so restarts honour the cooldown").toBe(true);
  });

  it("sends anyway if the cooldown check errors (fail open, never silent)", async () => {
    vi.resetModules();
    vi.doMock("../db/index.js", () => ({
      getDb: () => ({
        execute: async () => {
          throw new Error("db unavailable");
        },
      }),
    }));
    const { alertOnce } = await import("./alert-once.js");
    await alertOnce("some-key", 60_000, {
      severity: "critical",
      subject: "still important",
      body: "…",
    });
    expect(sentAlerts, "a DB failure must not swallow a critical page").toHaveLength(1);
    vi.doUnmock("../db/index.js");
  });
});

describe("defect 3 — routine INFO must not compete with CRITICAL in the inbox", () => {
  it("does not email the budget notices that buried the outage alert", async () => {
    const { sendAlert } = await import("./alerting.js");
    const sent = await sendAlert({
      severity: "info",
      subject: "[budget] greek-company-data reached 30% of daily test budget",
      body: "…",
    });
    expect(sent).toBe(false);
    expect(sentAlerts).toHaveLength(0);
  });

  it("still emails warning and critical", async () => {
    const { sendAlert } = await import("./alerting.js");
    await sendAlert({ severity: "warning", subject: "budget 80%", body: "…" });
    await sendAlert({ severity: "critical", subject: "settlement stopped", body: "…" });
    expect(sentAlerts.map((a) => a.severity)).toEqual(["WARNING", "CRITICAL"]);
  });

  it("ALERT_INFO_EMAIL=true restores INFO email", async () => {
    process.env.ALERT_INFO_EMAIL = "true";
    const { sendAlert } = await import("./alerting.js");
    const sent = await sendAlert({ severity: "info", subject: "fyi", body: "…" });
    expect(sent).toBe(true);
    expect(sentAlerts).toHaveLength(1);
  });
});
