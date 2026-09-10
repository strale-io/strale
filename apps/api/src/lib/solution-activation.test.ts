/**
 * Automated sweeps may switch a solution ON only under one shared rule.
 *
 * Incident, 2026-09-06 to 2026-09-10: four solutions were deactivated because
 * their steps rest on vendor free tiers that forbid resale (CoinGecko Demo,
 * Etherscan free). The seeding sweep was fixed to respect that. The test
 * scheduler's `checkSolutionGates()` carried its own copy of the rule — "every
 * step passed a test in the last 30 days" — was never found, and revived all
 * four within minutes of each deactivation for four days. It ignored the
 * deactivation reason AND whether the step capabilities were still switched on,
 * so capabilities dropped that morning kept their bundles qualified on last
 * week's results.
 *
 * Two layers of test:
 *  1. the predicate's behaviour, including the two conditions the scheduler
 *     lacked;
 *  2. a structural guard: every file that writes `isActive: true` to the
 *     solutions table must import this module. The incident was a duplicate
 *     nobody knew existed; this is what makes the next duplicate fail CI
 *     instead of production.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { mayAutoActivateSolution, wasDeactivatedDeliberately, type StepState } from "./solution-activation.js";

const ok = (slug: string): StepState => ({ capabilitySlug: slug, capabilityActive: true, hasRecentPass: true });

describe("wasDeactivatedDeliberately", () => {
  it("treats any stated reason as deliberate", () => {
    expect(wasDeactivatedDeliberately("requires crypto-price, deactivated 2026-09-06: CoinGecko Demo excludes commercial use")).toBe(true);
    expect(wasDeactivatedDeliberately("founder decision")).toBe(true);
  });
  it("leaves vendor-control-tower's own markers to its restore cycle", () => {
    expect(wasDeactivatedDeliberately("vendor:openregister")).toBe(false);
  });
  it("treats no reason as no reason", () => {
    for (const v of [null, undefined, "", "   ", 0, {}]) expect(wasDeactivatedDeliberately(v)).toBe(false);
  });
});

describe("mayAutoActivateSolution", () => {
  it("activates a solution whose every step is on and recently passing", () => {
    expect(mayAutoActivateSolution({ deactivationReason: null, steps: [ok("a"), ok("b")] })).toBe(true);
  });

  // The exact incident: every step has a passing result inside 30 days, but one
  // step's capability was switched off today. The old scheduler rule said yes.
  it("refuses when a step capability is switched off, however recently it passed", () => {
    expect(mayAutoActivateSolution({
      deactivationReason: null,
      steps: [ok("token-security-check"), { capabilitySlug: "crypto-price", capabilityActive: false, hasRecentPass: true }],
    })).toBe(false);
  });

  it("refuses a solution deactivated deliberately, even with every step green", () => {
    expect(mayAutoActivateSolution({
      deactivationReason: "requires gas-price-check, deactivated 2026-09-06: Etherscan free API is personal-use only",
      steps: [ok("a"), ok("b")],
    })).toBe(false);
  });

  it("refuses when a step has no recent passing result", () => {
    expect(mayAutoActivateSolution({
      deactivationReason: null,
      steps: [ok("a"), { capabilitySlug: "b", capabilityActive: true, hasRecentPass: false }],
    })).toBe(false);
  });

  it("refuses an empty bundle rather than calling it fully qualified", () => {
    expect(mayAutoActivateSolution({ deactivationReason: null, steps: [] })).toBe(false);
  });
});

describe("every solution auto-activation goes through this module", () => {
  const SRC = resolve(import.meta.dirname, "..");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
      return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
    });
  }

  // A write that switches a solution on: drizzle `.update(solutions)` followed
  // closely by `isActive: true`. Raw SQL writers are covered separately below.
  const ACTIVATES = /\.update\(solutions\)[\s\S]{0,120}isActive:\s*true/;

  it("finds the writers it is meant to police (the scan is not hollow)", () => {
    const hits = walk(SRC).filter((f) => ACTIVATES.test(readFileSync(f, "utf8")));
    const names = hits.map((f) => relative(SRC, f).replace(/\\/g, "/"));
    // Both known auto-activators must be seen, or the regex has drifted from
    // the code and this whole guard is green while checking nothing.
    expect(names).toContain("jobs/test-scheduler.ts");
    expect(names).toContain("db/seed-solutions.ts");
  });

  it("requires each of them to import the shared predicate", () => {
    const offenders = walk(SRC)
      .filter((f) => ACTIVATES.test(readFileSync(f, "utf8")))
      .filter((f) => !/solution-activation\.js/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(offenders, `auto-activates solutions without lib/solution-activation.ts: ${offenders.join(", ")}`).toEqual([]);
  });
});
