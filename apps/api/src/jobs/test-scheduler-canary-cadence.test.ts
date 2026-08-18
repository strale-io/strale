/**
 * Regression tests for the `test_mode = 'canary'` scheduling floor
 * (cost-reduction pass, 2026-08-18, branch `ops/cut-browserless-harness-burn`).
 *
 * Background: schema.ts's `test_mode` column comment has documented three
 * values since the column was added — 'live', 'fixture', 'canary' (periodic
 * live check at reduced frequency) — but only 'fixture' had an actual code
 * path in test-runner.ts's `runSingleTest`. A suite set to `test_mode =
 * 'canary'` fell through to the same "real execution" branch as 'live' and
 * was dispatched on the same hourly cadence as any other eligible suite —
 * indistinguishable from 'live' in practice. Confirmed against prod
 * (read-only query, 2026-08-18): 12 `cost_class = 'free_unlimited'`
 * Browserless-touching capabilities generated ~7,565 real executor
 * invocations across their known_answer/known_bad/negative/edge_case/
 * dependency_health suites in 30 days, at effectively hourly cadence,
 * because nothing in the scheduler read `test_mode` at all.
 *
 * `minRetestIntervalHours` is the fix: an independent daily floor for
 * `test_mode = 'canary'`, combined via `GREATEST` with the pre-existing
 * `test_status` floor, so quarantined/upstream_broken canaries back off
 * further still rather than the canary floor silently overriding them.
 *
 * No DB harness exists for the scheduler's live SQL (test-harness
 * exemption, DEC-20260504-A, same posture as the sibling stagger/skip-bumper
 * test files in this directory) — these tests pin (a) the pure mirror
 * function's values and (b) that the actual SQL literal in this file
 * contains the matching CASE branch, so a future edit to one side without
 * the other fails loudly.
 */

import { describe, it, expect } from "vitest";
import { minRetestIntervalHours } from "./test-scheduler.js";

describe("minRetestIntervalHours", () => {
  it("floors at 1 hour for a normal, non-canary suite", () => {
    expect(minRetestIntervalHours("normal", "live")).toBe(1);
    expect(minRetestIntervalHours("normal", "fixture")).toBe(1);
    expect(minRetestIntervalHours(null, null)).toBe(1);
  });

  it("gives test_mode = 'canary' a 24h floor on an otherwise-normal suite", () => {
    expect(minRetestIntervalHours("normal", "canary")).toBe(24);
  });

  it("status-based backoff still applies to non-canary suites, unchanged", () => {
    expect(minRetestIntervalHours("upstream_broken", "live")).toBe(24);
    expect(minRetestIntervalHours("infra_limited", "live")).toBe(24);
    expect(minRetestIntervalHours("quarantined", "live")).toBe(168);
  });

  it("combines via GREATEST — a quarantined canary backs off to the longer of the two, not the canary floor", () => {
    // The canary floor (24h) must never silently override a longer
    // status-based backoff — GREATEST, not "canary wins".
    expect(minRetestIntervalHours("quarantined", "canary")).toBe(168);
    expect(minRetestIntervalHours("upstream_broken", "canary")).toBe(24);
  });

  it("an unrecognized test_status/test_mode never throws and never drops below the 1h floor", () => {
    expect(minRetestIntervalHours("some_future_status", "some_future_mode")).toBe(1);
  });
});

describe("findOverdueSuites' and countOverdueCapabilities' SQL carry the canary CASE branch", () => {
  it("both GREATEST(...) expressions include a test_mode CASE for 'canary' -> 24 hours", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./test-scheduler.ts", import.meta.url), "utf8");

    const canaryCase = /CASE ts\.test_mode\s*\n\s*WHEN 'canary' THEN INTERVAL '24 hours'\s*\n\s*ELSE INTERVAL '0 hours'\s*\n\s*END/;
    const matches = src.match(new RegExp(canaryCase.source, "g"));
    // findOverdueSuites() and countOverdueCapabilities() each need their own
    // copy — one query drives dispatch, the other drives the queue-depth
    // observability metric. Only fixing one would make the metric lie about
    // canary suites looking permanently "overdue".
    expect(matches?.length ?? 0).toBe(2);
  });

  it("the canary CASE sits inside a GREATEST(...) alongside the existing test_status CASE, not standalone", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./test-scheduler.ts", import.meta.url), "utf8");

    // Every GREATEST( ... test_status CASE ... ) block in this file must
    // also contain the test_mode CASE before its closing paren — i.e. the
    // two floors are combined, not applied by two independent WHERE clauses
    // that could silently diverge.
    const greatestBlocks = src.match(/GREATEST\(([\s\S]*?)\n\s{6}\)/g) ?? [];
    expect(greatestBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of greatestBlocks) {
      expect(block).toContain("CASE ts.test_status");
      expect(block).toContain("CASE ts.test_mode");
    }
  });
});
