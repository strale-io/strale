/**
 * The price table decays silently, and that is the actual defect.
 *
 * A real x402 caller asked `llm-cost-calculate` for `claude-sonnet-4-5` and was
 * turned away: the table was stamped "updated Feb 2025" and stopped at
 * `claude-3.5-sonnet`. Eighteen months of new models were missing and nothing
 * anywhere said so — no test failed, no monitor fired, the capability reported
 * itself healthy while being useless for current work.
 *
 * The refresh is the easy half. These tests are the half that matters: they
 * make the next eighteen months of decay visible while it is still cheap.
 */

import { describe, it, expect } from "vitest";
import { __pricingMeta } from "./llm-cost-calculate.js";

const { PRICING, MODEL_ALIASES, PRICING_SOURCES, PRICING_VERIFIED_ON, PRICING_MAX_AGE_DAYS } =
  __pricingMeta;

describe("the request that exposed the staleness", () => {
  it("prices claude-sonnet-4-5, the model the caller actually asked for", () => {
    const p = PRICING["claude-sonnet-4-5"];
    expect(p, "the exact string a paying caller sent must resolve").toBeDefined();
    // $3/$15 per MTok, per the Anthropic pricing page.
    expect(p.inputPer1K).toBeCloseTo(0.003);
    expect(p.outputPer1K).toBeCloseTo(0.015);
  });

  it("covers the current generation of each vendor, not just the newest one", () => {
    for (const model of ["claude-sonnet-5", "claude-opus-5", "gpt-5.5", "gemini-3.5-flash"]) {
      expect(PRICING[model], `${model} must be priced`).toBeDefined();
    }
  });
});

describe("staleness is visible before a caller finds it", () => {
  it("the table has been verified within PRICING_MAX_AGE_DAYS", () => {
    // The whole point. When this fails, re-check the three vendor pages and
    // move PRICING_VERIFIED_ON — do not just bump the date. A green test with
    // a stale table is exactly the state that produced the original failure.
    const verified = new Date(PRICING_VERIFIED_ON);
    expect(Number.isNaN(verified.getTime()), "PRICING_VERIFIED_ON must parse").toBe(false);
    const ageDays = (Date.now() - verified.getTime()) / 86_400_000;
    expect(
      ageDays,
      `price table last verified ${Math.round(ageDays)} days ago — re-check ${Object.values(
        PRICING_SOURCES,
      ).join(", ")} and update PRICING_VERIFIED_ON`,
    ).toBeLessThan(PRICING_MAX_AGE_DAYS);
  });

  it("every priced model names a vendor that has a source URL", () => {
    // Stops a model being added with no traceable origin — an unsourced price
    // is worse than a missing one, because the output still looks authoritative.
    for (const [model, p] of Object.entries(PRICING)) {
      expect(PRICING_SOURCES[p.vendor], `${model} cites an unknown vendor`).toBeTruthy();
    }
  });

  it("distinguishes verified rows from carried-over ones", () => {
    // Carried-over rows are allowed, but they must be marked. Silence is what
    // let the old table pass as current.
    const carried = Object.entries(PRICING).filter(([, p]) => p.unverified);
    expect(carried.length, "some rows are carried over unverified").toBeGreaterThan(0);
    for (const [, p] of carried) expect(p.unverified).toBe(true);
  });
});

describe("nothing that worked before breaks", () => {
  it("resolves the old dotted spellings through aliases", () => {
    for (const [alias, target] of Object.entries(MODEL_ALIASES)) {
      expect(PRICING[target], `alias ${alias} points at missing ${target}`).toBeDefined();
    }
  });

  it("keeps the previously supported models priced", () => {
    for (const model of ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "claude-3-opus", "gemini-1.5-pro"]) {
      expect(PRICING[model], `${model} was supported before and must stay`).toBeDefined();
    }
  });

  it("leaves gpt-4o's price unchanged — it was never wrong", () => {
    // The old table was incomplete, not inaccurate. Re-verified: still
    // $2.50/$10.00 per MTok.
    expect(PRICING["gpt-4o"].inputPer1K).toBeCloseTo(0.0025);
    expect(PRICING["gpt-4o"].outputPer1K).toBeCloseTo(0.01);
  });
});

describe("the numbers are structurally sane", () => {
  it("every price is positive and output costs at least input", () => {
    for (const [model, p] of Object.entries(PRICING)) {
      expect(p.inputPer1K, `${model} input`).toBeGreaterThan(0);
      expect(p.outputPer1K, `${model} output`).toBeGreaterThan(0);
      expect(p.outputPer1K, `${model}: output should not be cheaper than input`).toBeGreaterThanOrEqual(
        p.inputPer1K,
      );
    }
  });

  it("context is a positive number or explicitly null, never zero or guessed", () => {
    for (const [model, p] of Object.entries(PRICING)) {
      if (p.context === null) continue;
      expect(p.context, `${model} context`).toBeGreaterThan(0);
    }
  });
});
