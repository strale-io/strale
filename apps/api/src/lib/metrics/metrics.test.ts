/**
 * Regression tests for the five analytical failures of 2026-08-15.
 *
 * Each test reproduces one real mistake. The bar these have to clear is the one
 * that caught out two earlier tests this week: **a test must fail against the
 * un-fixed behaviour.** Every case below therefore asserts on the guard doing
 * something a naive implementation would not do — refusing, or narrowing, or
 * naming what it counted — rather than on a value that would come out the same
 * either way.
 */
import { describe, it, expect } from "vitest";
import {
  coversWindow, commonWindowStart, INSTRUMENTS,
} from "./instruments.js";
import { categorise, VISIT_DAY_CAVEAT } from "./populations.js";
import { renderMeasurement, explainUnavailable, type Measurement } from "./types.js";

const day = 86_400_000;
const now = new Date("2026-08-15T14:00:00Z");

describe("failure 2 — reporting a metric older than its instrument", () => {
  // Shipped: "1 paying customer", from a column that was one day old. It read
  // as "we have one customer" and meant "we started counting yesterday".
  it("refuses a 30-day window on an instrument enabled yesterday", () => {
    const from = new Date(now.getTime() - 30 * day);
    const guard = coversWindow("x402_payer_identity", from);
    expect(guard.ok, "a 1-day-old instrument cannot answer 30 days").toBe(false);
    if (!guard.ok) expect(guard.enabledAt).toEqual(INSTRUMENTS.x402_payer_identity.enabledAt);
  });

  it("allows a window that starts after the instrument did", () => {
    const from = new Date("2026-08-15T12:00:00Z"); // after the 09:13 activation
    expect(coversWindow("x402_payer_identity", from).ok).toBe(true);
  });

  it("treats an unregistered instrument as absent, not as available", () => {
    const guard = coversWindow("not_a_real_instrument", new Date(0));
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.absent).toBe(true);
  });
});

describe("failure 3 — funnel steps measured over different windows", () => {
  // Shipped: "92% of agents never look at the catalogue", from comparing two
  // days of initialize against three hours of tools/list.
  it("uses the LATEST activation across steps, not the earliest", () => {
    const common = commonWindowStart(["mcp_initialize", "mcp_tools"]);
    expect(common).toEqual(INSTRUMENTS.mcp_tools.enabledAt);
    // The distinction that matters: the older instrument must not set the window.
    expect(common!.getTime()).toBeGreaterThan(INSTRUMENTS.mcp_initialize.enabledAt!.getTime());
  });

  it("returns null when any step's start is unknown, rather than guessing", () => {
    expect(commonWindowStart(["mcp_initialize", "mystery_step"])).toBeNull();
  });
});

describe("failure 4 — monitoring infrastructure counted as demand", () => {
  it("recognises the monitors we actually observed", () => {
    for (const ua of ["glimind-probe/0.1.0", "mcpbeat/0.1", "yellowmcp-health/1.0",
                      "x402-observatory/0.2", "MCPScoringEngine/1.0"]) {
      expect(categorise(ua), ua).toBe("known_monitor");
    }
  });

  it("separates indexers from monitors — they are different evidence", () => {
    expect(categorise("smithery-probe/0")).toBe("known_indexer");
    expect(categorise("glama/1.0.0")).toBe("known_indexer");
  });

  it("does NOT discard a real client just for containing a monitoring word", () => {
    // The first version matched the substring "probe"/"registry"/"bot", which
    // would have thrown away exactly this caller as non-demand.
    expect(categorise("company-registry-bot/1.0")).toBe("customer_candidate");
    expect(categorise("health-data-agent/2.1")).toBe("customer_candidate");
  });

  it("puts an absent user agent in `unknown`, never in a demand bucket", () => {
    // In SQL this was worse than a miscategorisation: NOT (NULL ILIKE ANY(...))
    // is NULL, so these rows silently left both populations at once.
    expect(categorise(null)).toBe("unknown");
    expect(categorise(undefined)).toBe("unknown");
    expect(categorise("")).toBe("unknown");
  });
});

describe("the contract itself — an unavailable measurement has no number to render", () => {
  // The first draft returned { value, trustworthy: false }. A caller renders
  // `value` and never reads the flag; that is how failure 2 reached a dashboard.
  const unavailable: Measurement<number> = {
    status: "unavailable",
    reason: { kind: "instrument_too_young", instrument: "x402_payer_identity",
              enabledAt: new Date("2026-08-15T09:13:00Z") },
    requestedWindow: { from: new Date(now.getTime() - 30 * day), to: now, label: "last 30 days" },
    population: "external_customers",
  };

  it("has no value property at all when unavailable", () => {
    expect("value" in unavailable).toBe(false);
  });

  it("renders a placeholder and an explanation, never a fabricated number", () => {
    const out = renderMeasurement(unavailable, (v) => String(v));
    expect(out.text).toBe("—");
    expect(out.trustworthy).toBe(false);
    expect(out.note).toContain("2026-08-15");
  });

  it("marks an estimate as untrustworthy even though it carries a value", () => {
    const estimated: Measurement<number> = {
      status: "estimated", value: 430, methodology: "test cost times runs",
      window: { from: new Date(now.getTime() - 7 * day), to: now, label: "last 7 days" },
      population: "all_transactions", instruments: [],
    };
    const out = renderMeasurement(estimated, (v) => `€${(v / 100).toFixed(2)}`);
    expect(out.text).toBe("€4.30");
    expect(out.trustworthy, "an estimate is never presented as observed").toBe(false);
    expect(out.note).toContain("test cost times runs");
  });

  it("explains every reason in words a non-technical reader can act on", () => {
    const reasons = [
      { kind: "instrument_absent", instrument: "payer identity" },
      { kind: "window_not_covered", instrument: "x", availableFrom: new Date("2026-08-15T00:00:00Z") },
      { kind: "steps_disagree", detail: "steps cover different periods" },
      { kind: "no_data" },
    ] as const;
    for (const r of reasons) {
      const text = explainUnavailable(r);
      expect(text.length, JSON.stringify(r)).toBeGreaterThan(10);
      expect(text, "no jargon in reader-facing text").not.toMatch(/null|undefined|SQL|instrument_/i);
    }
  });
});

describe("the visit-day caveat cannot be quietly softened", () => {
  // Every "agents" figure shown on 2026-08-15 was really agent-days, inflated
  // by up to 7x, because discovery_hits.ip_hash re-salts every UTC day.
  it("says plainly that these are not individuals", () => {
    expect(VISIT_DAY_CAVEAT).toMatch(/visit-days/);
    expect(VISIT_DAY_CAVEAT).toMatch(/not individuals/);
    expect(VISIT_DAY_CAVEAT).toMatch(/seven/);
  });
});
