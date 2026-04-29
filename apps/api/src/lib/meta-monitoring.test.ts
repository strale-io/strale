/**
 * Registry assertion: every exported `check*` function in meta-monitoring.ts
 * must be either listed in CHECK_REGISTRY (and therefore actually wired into
 * runHourlyChecks / runDailyChecks / runWeeklyChecks) or explicitly named in
 * CHECKS_EXEMPT_FROM_AUTO_RUN.
 *
 * Closes the failure mode that masked the 2026-04-26 scheduler-staleness
 * incident: `checkSchedulerHeartbeat` was written, exported, and never
 * invoked, so the watchdog couldn't fire when the scheduler dropped caps.
 * Adding a new check now fails this test until it's wired.
 */

import { describe, expect, it } from "vitest";
import * as metaMonitoring from "./meta-monitoring.js";
import { CHECK_REGISTRY, CHECKS_EXEMPT_FROM_AUTO_RUN } from "./meta-monitoring.js";

describe("meta-monitoring registry", () => {
  it("every exported check* function is registered or explicitly exempt", () => {
    const exportedCheckNames = Object.keys(metaMonitoring).filter(
      (name) => name.startsWith("check") && typeof (metaMonitoring as any)[name] === "function",
    );

    const registeredFns = new Set(CHECK_REGISTRY.map((c) => c.fn));

    const unwired: string[] = [];
    for (const name of exportedCheckNames) {
      const fn = (metaMonitoring as any)[name];
      if (registeredFns.has(fn)) continue;
      if (CHECKS_EXEMPT_FROM_AUTO_RUN.has(name)) continue;
      unwired.push(name);
    }

    expect(
      unwired,
      `These checks are exported but unwired — add to CHECK_REGISTRY (preferred) or CHECKS_EXEMPT_FROM_AUTO_RUN with a justifying comment:\n  ${unwired.join(
        "\n  ",
      )}`,
    ).toEqual([]);
  });

  it("registry has no duplicate names", () => {
    const names = CHECK_REGISTRY.map((c) => c.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("registry has no duplicate function references", () => {
    const fns = CHECK_REGISTRY.map((c) => c.fn);
    const dupes = fns.filter((f, i) => fns.indexOf(f) !== i);
    expect(dupes.map((f) => f.name)).toEqual([]);
  });

  it("every registered schedule is one of the supported values", () => {
    const valid = new Set(["hourly", "daily", "weekly"]);
    for (const c of CHECK_REGISTRY) {
      expect(valid.has(c.schedule), `Check ${c.name} has invalid schedule ${c.schedule}`).toBe(true);
    }
  });
});
