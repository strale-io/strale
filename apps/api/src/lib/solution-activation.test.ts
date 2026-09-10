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

/**
 * Every code path that can switch an existing solution ON must consult the
 * shared predicate — by CALLING it, not merely importing it.
 *
 * The first version of this guard was itself incomplete, found by independent
 * review of PR #626: it scanned only apps/api/src, matched only
 * `.update(solutions)` followed by `isActive: true` within 120 characters, and
 * accepted an import as proof of use. So it could not see routes/admin.ts (a
 * raw-SQL ON CONFLICT upsert with its own hand-written copy of the rule) or
 * apps/api/scripts/seed-kyb-solutions.ts (nineteen fields between the call and
 * the flag, in a directory it never walked). Both were real activators.
 *
 * This version scans every directory that holds runnable code, detects both
 * drizzle and raw-SQL writers bounded by statement rather than by a character
 * count, requires a call on a non-import line, and proves each of those
 * properties against synthetic fixtures before it trusts the real scan.
 */

/**
 * Where a source file can switch an existing solution on. Returns one entry per
 * site, or [] for a file that cannot.
 *
 * - drizzle: `.update(solutions)` through the next `.where(` or `;` — the whole
 *   `.set({...})` block however long — with an `isActive:` value that is not
 *   the literal `false`.
 * - raw SQL: an `UPDATE solutions` statement, or the ON CONFLICT branch of an
 *   `INSERT INTO solutions`, up to the template's closing backtick, setting
 *   `is_active` to anything but `false`. A plain INSERT creates a row; it cannot
 *   revive one, so it is not counted.
 */
export function activatorSites(src: string): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(/\.update\(solutions\)([\s\S]*?)(?:\.where\(|;)/g)) {
    const v = m[1].match(/\bisActive:\s*([^,\n}]+)/);
    if (v && !/^\s*false\b/.test(v[1])) hits.push(`drizzle isActive: ${v[1].trim()}`);
  }
  for (const m of src.matchAll(/\b(UPDATE\s+solutions\b|INSERT\s+INTO\s+solutions\b)([^`]*)/gi)) {
    let body = m[2];
    if (/^INSERT/i.test(m[1])) {
      const at = body.search(/\bON\s+CONFLICT\b/i);
      if (at < 0) continue;
      body = body.slice(at);
    }
    // Only the SET clause writes. `is_active = true` in a WHERE clause is a
    // filter — startup-migrations block 0092 has exactly that and writes only
    // x402_enabled — so reading the whole statement is a false positive.
    const set = body.match(/\bSET\b([\s\S]*?)(?:\bWHERE\b|\bRETURNING\b|\bFROM\b|$)/i);
    if (!set) continue;
    const v = set[1].match(/\bis_active\s*=\s*([^,\n]+)/i);
    if (v && !/^\s*false\b/i.test(v[1])) hits.push(`sql is_active = ${v[1].trim()}`);
  }
  return hits;
}

/** True when the file CALLS the predicate somewhere other than an import line. */
export function callsPredicate(src: string): boolean {
  const code = src.split(/\r?\n/).filter((l) => !/^\s*(import|export)\b.*from\s+["']/.test(l)).join("\n");
  return /\b(wasDeactivatedDeliberately|mayAutoActivateSolution)\s*\(/.test(code);
}

/**
 * Activators exempt from the call requirement, each with the reason it is safe.
 * An entry here is a claim that must stay true; keep the list short.
 */
const EXEMPT: Record<string, string> = {
  "apps/api/src/lib/vendor-control-tower.ts":
    "Restores only a row whose deactivation_reason still equals its OWN vendor: suspension marker, and records a restore_error instead if any other authority changed it. That is precisely the case wasDeactivatedDeliberately() excludes by design.",
};

describe("the activator detector itself (proved before the real scan is trusted)", () => {
  it("sees a drizzle write however many fields separate the call from the flag", () => {
    const fields = Array.from({ length: 19 }, (_, i) => `field${i}: sol.field${i},`).join("\n            ");
    const src = `await tx.update(solutions).set({\n            ${fields}\n            isActive: true,\n          }).where(eq(solutions.id, id));`;
    expect(activatorSites(src)).toHaveLength(1);
  });

  it("sees a conditional or variable isActive value", () => {
    expect(activatorSites("db.update(solutions).set({ isActive: keepOff ? existing.isActive : true }).where(x)")).toHaveLength(1);
  });

  it("ignores a deactivation", () => {
    expect(activatorSites("db.update(solutions).set({ isActive: false, updatedAt: new Date() }).where(x)")).toEqual([]);
    expect(activatorSites("sql`UPDATE solutions s SET is_active = false, x402_enabled = false WHERE s.slug = ${x}`")).toEqual([]);
  });

  it("sees the ON CONFLICT branch of a raw-SQL upsert", () => {
    const src = "sql`INSERT INTO solutions (slug, is_active) VALUES (${s}, true) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = CASE WHEN ${k} THEN solutions.is_active ELSE true END`";
    expect(activatorSites(src)).toHaveLength(1);
  });

  it("ignores a plain INSERT, which creates a row and cannot revive one", () => {
    expect(activatorSites("sql`INSERT INTO solutions (slug, is_active) VALUES (${s}, true)`")).toEqual([]);
  });

  // The false positive the first draft of this detector produced: block 0092
  // filters on active rows and writes only x402_enabled.
  it("ignores is_active in a WHERE clause, which filters rather than writes", () => {
    expect(activatorSites("sql`UPDATE solutions SET x402_enabled = true, updated_at = now() WHERE slug IN (${l}) AND is_active = true AND x402_enabled = false`")).toEqual([]);
  });

  it("sees a raw UPDATE that restores is_active from a variable", () => {
    expect(activatorSites("sql`UPDATE solutions SET is_active = ${prev}, updated_at = now() WHERE slug = ${s}`")).toHaveLength(1);
  });

  it("does not accept an import as a call", () => {
    expect(callsPredicate(`import { wasDeactivatedDeliberately } from "./solution-activation.js";\nconst x = 1;`)).toBe(false);
    expect(callsPredicate(`import { wasDeactivatedDeliberately } from "./solution-activation.js";\nif (wasDeactivatedDeliberately(r)) return;`)).toBe(true);
  });
});

describe("every code path that can switch a solution on consults the shared predicate", () => {
  const API = resolve(import.meta.dirname, "../..");
  const REPO = resolve(API, "../..");
  // Every directory holding code that runs: the server, operator scripts, and
  // repo-level scripts. `archive` directories hold retired one-off scripts
  // that nothing invokes.
  const ROOTS = [join(API, "src"), join(API, "scripts"), join(REPO, "scripts")];

  function walk(dir: string): string[] {
    let names: string[];
    try { names = readdirSync(dir); } catch { return []; }
    return names.flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === "node_modules" || name === "archive" ? [] : walk(p);
      return /\.(ts|mjs)$/.test(name) && !/\.test\.(ts|mjs)$/.test(name) ? [p] : [];
    });
  }

  const rel = (p: string) => relative(REPO, p).replace(/\\/g, "/");
  const activators = ROOTS.flatMap(walk)
    .map((p) => ({ path: rel(p), src: readFileSync(p, "utf8") }))
    .filter((f) => activatorSites(f.src).length > 0);

  it("finds every activator known on 2026-09-10 (the scan is not hollow)", () => {
    const found = activators.map((a) => a.path);
    for (const known of [
      "apps/api/src/jobs/test-scheduler.ts",
      "apps/api/src/db/seed-solutions.ts",
      "apps/api/src/lib/capability-onboarding.ts",
      "apps/api/src/routes/admin.ts",
      "apps/api/scripts/seed-kyb-solutions.ts",
      "apps/api/src/lib/vendor-control-tower.ts",
    ]) {
      expect(found, `detector no longer sees ${known}`).toContain(known);
    }
  });

  it("requires each to call the predicate, or to be exempt for a stated reason", () => {
    const offenders = activators
      .filter((a) => !(a.path in EXEMPT) && !callsPredicate(a.src))
      .map((a) => `${a.path}: ${activatorSites(a.src).join("; ")}`);
    expect(offenders, `switches solutions on without calling lib/solution-activation.ts:\n${offenders.join("\n")}`).toEqual([]);
  });

  // The generic check above accepts either predicate, because operator paths
  // (admin endpoint, seed scripts) legitimately need only the reason check. An
  // AUTOMATED sweep needs both conditions. The scheduler calls
  // wasDeactivatedDeliberately() as a cheap early exit too, so dropping
  // mayAutoActivateSolution() would still satisfy the generic check while
  // silently losing the "step capability is switched on now" condition — the
  // exact 2026-09-06 failure. Found by planting it: it survived the generic
  // check.
  it("the scheduler's automated gate decides through mayAutoActivateSolution, not the reason check alone", () => {
    const p = "apps/api/src/jobs/test-scheduler.ts";
    const a = activators.find((x) => x.path === p);
    expect(a, `${p} is no longer an activator`).toBeDefined();
    const code = a!.src.split(/\r?\n/).filter((l) => !/^\s*(import|export)\b.*from\s+["']/.test(l)).join("\n");
    expect(/\bmayAutoActivateSolution\s*\(/.test(code), `${p} must decide through mayAutoActivateSolution()`).toBe(true);
  });

  it("keeps every exemption pointing at a file that is still an activator", () => {
    const paths = new Set(activators.map((a) => a.path));
    for (const p of Object.keys(EXEMPT)) expect(paths, `stale exemption: ${p}`).toContain(p);
  });
});
