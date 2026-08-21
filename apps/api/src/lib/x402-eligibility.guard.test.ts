/**
 * WP8 bypass guard: "may this be served" has one answer.
 *
 * The predicate `isX402PayableCapability` already existed and was already
 * correct. It was imported by exactly ONE file. That is how two authorities
 * came to exist without anyone deciding to create them: the wallet rail gated
 * on `isActive`, the x402 gateway open-coded `lifecycle_state IN (…)` in its
 * cache query, and solution steps checked nothing at all. In production those
 * two rules already disagree about six capabilities.
 *
 * A shared predicate that nothing is required to use is a convention. This test
 * is what makes it an authority.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname, "..");

/**
 * Open-coded eligibility: a lifecycle-state comparison, or an is_active filter
 * standing in for "may we serve this", written anywhere other than the module
 * that owns the decision.
 */
const OPEN_CODED_LIFECYCLE =
  /lifecycleState\s*(?:===|!==|,)\s*["']|lifecycle_state\s*(?:=|<>|!=|IN)\s*|inArray\(\s*capabilities\.lifecycleState/;

/**
 * Files reviewed once and found NOT to be deciding servability.
 *
 * A ratchet, in the shape this codebase already uses for console calls and
 * migration blocks: the existing set is grandfathered, anything NEW fails.
 * Every entry was read, and each falls into one of three groups — it WRITES
 * lifecycle transitions, it REPORTS on them, or it filters a listing for
 * display. None of them gate execution or payment.
 *
 * Adding an entry here is a claim that the file does not decide whether a
 * capability may run. Make that claim only after reading it.
 */
const REVIEWED_NOT_DECIDING = new Set([
  // Owns the decision.
  "lib/x402-eligibility.ts",
  // WRITE lifecycle transitions — they must name the states they move between.
  "jobs/quality-floor.ts",
  "jobs/capability-promotion.ts",
  "jobs/fix-lifecycle-anomalies.ts",
  "lib/startup-migrations.ts",
  "lib/capability-persistence.ts",
  "lib/capability-onboarding.ts",
  // REPORT on lifecycle — dashboards, digests, monitors, issue filing.
  "jobs/invariant-checker.ts",
  "lib/digest-compiler.ts",
  "lib/event-triggers.ts",
  "lib/github-issues.ts",
  "lib/meta-monitoring.ts",
  "lib/platform-facts.ts",
  "lib/test-runner.ts",
  "lib/metrics/metrics.ts",
  "routes/admin.ts",
  "routes/internal-health-monitor.ts",
  "routes/reply-webhook.ts",
  // Filter a LISTING for display. Stricter than the floor, never more
  // permissive, which is the direction that stays safe.
  "routes/capabilities.ts",
  "lib/suggest.ts",
]);

function readdirRecursive(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...readdirRecursive(full));
    else out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("one authority answers 'may this capability be served'", () => {
  it("no rail open-codes a lifecycle-state rule", () => {
    const offenders: string[] = [];

    for (const dir of ["routes", "lib", "jobs", "capabilities"]) {
      for (const file of readdirRecursive(join(API_SRC, dir))) {
        if (!file.endsWith(".ts") || file.includes(".test.")) continue;
        const rel = file.slice(API_SRC.length + 1).replace(/\\/g, "/");
        if (REVIEWED_NOT_DECIDING.has(rel)) continue;

        const src = stripComments(readFileSync(file, "utf8"));
        if (!OPEN_CODED_LIFECYCLE.test(src)) continue;

        // Reading the column to PASS to the predicate is fine; deciding with it
        // is not. A file that imports the authority is presumed to be feeding it.
        if (src.includes("x402-eligibility.js")) continue;

        offenders.push(rel);
      }
    }

    expect(
      offenders,
      "this file reads lifecycle state without consulting lib/x402-eligibility.ts. " +
        "If it DECIDES whether a capability may run, use the shared predicate — two " +
        "authorities is how the wallet and x402 rails came to disagree about six " +
        "capabilities in production. If it only reports or lists, read it and add it " +
        "to REVIEWED_NOT_DECIDING with which group it falls into.",
    ).toEqual([]);
  });

  // The two below are lint assertions, not behavioural tests, and the review
  // caught them being satisfied by an IMPORT LINE alone — delete the logic,
  // keep the import, and they stayed green. They now require a CALL with an
  // argument, which an import cannot satisfy. Behavioural coverage lives in
  // routes/solution-reservations.integration.test.ts, which quarantines a
  // capability the way the quality floor actually does and asserts the step
  // does not run.

  it("the solution executor CALLS the authority", () => {
    const src = stripComments(
      readFileSync(join(API_SRC, "lib/solution-executor.ts"), "utf8"),
    );
    expect(src).toMatch(/isServableCapability\(\s*\{/);
    // And on the quarantine signal specifically — the field whose absence made
    // the first version of this package miss every floor quarantine.
    expect(src).toMatch(/visible:/);
  });

  it("the x402 gateway CALLS its rail predicate against a live row", () => {
    const src = stripComments(
      readFileSync(join(API_SRC, "routes/x402-gateway-v2.ts"), "utf8"),
    );
    expect(src).toMatch(/isX402RailEligible\(\w+\)/);
  });
});
