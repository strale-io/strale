/**
 * "Promotion grace" fix (2026-08-16, DEC-20260812-A) — regression tests for
 * the quality-floor evidence-window clamp.
 *
 * Real incident this locks out: screenshot-url was quarantined 2026-08-12 on
 * a real 55%/30d completion driven by a bug that had already been fixed
 * 2026-08-05. Promoted 2026-08-13T07:34; the floor's next enforce tick
 * (07:47) re-quarantined it 13 minutes later because its 30d completion
 * window still averaged in the pre-fix failures — a promotion can never
 * survive its own tick under a flat 30-day window, however clean the traffic
 * since promotion. The fix clamps the window per capability to
 * max(now-30d, its own last ENFORCE-mode promotion timestamp).
 *
 * Per DEC-20260504-A every audit-follow-up ships a test that fails against
 * the un-applied fix and passes against the applied one. There is no
 * Postgres-backed harness for jobs/quality-floor.ts (it runs a hand-built
 * `postgres` tagged-template query directly, not through a mockable ORM
 * call) — per the CLAUDE.md test-harness exemption, coverage here is:
 *   (a) a structural pin on the SQL text itself (fails the instant the GREATEST
 *       clamp regresses to a flat 30-day WHERE, or the dry-run gate is
 *       dropped) — mirrors the pattern in lib/go-review-regressions.test.ts;
 *   (b) a behavioral pin at the foldTrafficRows/evaluateFloor layer, feeding
 *       in exactly the rows the SQL would return before vs. after the clamp,
 *       to prove what the clamp is actually FOR: it is the difference between
 *       the bounce happening and not happening on identical underlying data.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateFloor } from "../lib/quality-floor.js";
import { foldTrafficRows, type FloorTrafficRow } from "./quality-floor.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Source with comments stripped — these assertions are about what the code
 * does, and the fix's own docstring names the bug pattern it replaces. */
const readCode = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("quality-floor evidence window — the SQL clamp itself", () => {
  const src = readCode("quality-floor.ts");

  it("clamps the 30d floor to since-last-enforce-promotion, never widening it", () => {
    expect(src).toMatch(
      /GREATEST\(\s*NOW\(\) - INTERVAL '30 days',\s*COALESCE\(lp\.promoted_at, '-infinity'::timestamptz\)\s*\)/,
    );
  });

  it("only an ENFORCE-mode promotion can move the window — a dry-run promotion grants no grace period", () => {
    expect(src).toContain(`e.details->>'mode' = 'enforce'`);
    expect(src).not.toMatch(/details->>'mode' = 'dry_run'/);
  });

  it("reads the promotion event per capability, and only 'promoted%' events", () => {
    expect(src).toContain("WHERE e.capability_slug = c.slug");
    expect(src).toContain("e.event_type = 'capability_promotion'");
    expect(src).toContain("e.action_taken LIKE 'promoted%'");
  });
});

/**
 * WP9: revenue moved out of the fold. Facts carry no price by design — they
 * answer "did this work", and asking them what a call earned would be the same
 * category error the package exists to undo — so the job reads revenue from the
 * billing table and passes it in. Only consumer is `requiresHuman`, which none
 * of these window tests exercise, so a flat value keeps them about the clamp.
 */
const REVENUE = new Map<string, number>([["cap", 500]]);

describe("quality-floor evidence window — the bounce it must not reproduce", () => {
  // 30d of real customer traffic BEFORE the 2026-08-13T07:34 promotion:
  // 10 completed, 20 failed (upstream — non-caller-attributable) spread over
  // two calendar days so the burst guard doesn't defer it. Completion
  // 10/30 = 33%, matching the real prod incident's <70% figure.
  const prePromotionRows: FloorTrafficRow[] = [
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "completed", error: null, day: "2026-08-01", recent: false, n: 10 },
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "failed", error: "upstream unavailable", day: "2026-08-06", recent: false, n: 10 },
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "failed", error: "upstream unavailable", day: "2026-08-09", recent: false, n: 10 },
  ];
  // The 07:47 tick, 13 minutes after promotion: essentially no new real
  // traffic has landed yet. One clean call, dated "recent" (< 7d old).
  const tinyPostPromotionRows: FloorTrafficRow[] = [
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "completed", error: null, day: "2026-08-13", recent: true, n: 1 },
  ];

  it("WITHOUT the clamp (SQL returns pre- and post-promotion rows together) the tick re-quarantines — this is the bounce", () => {
    const stats = foldTrafficRows([...prePromotionRows, ...tinyPostPromotionRows], REVENUE);
    const [d] = evaluateFloor(stats);
    expect(d.action).toBe("quarantine");
  });

  it("WITH the clamp (SQL returns only rows since the capability's own promotion) the tick has no verdict yet — the grace period", () => {
    // The clamp doesn't need to "know" the capability is healthy — it simply
    // never sees the contaminated pre-promotion rows, so eligibleCalls (1)
    // stays under minCalls (10) and evaluateFloor emits nothing at all: not
    // a quarantine, not a proposal. The ≥10-eligible-calls threshold is the
    // grace period.
    const stats = foldTrafficRows(tinyPostPromotionRows, REVENUE);
    expect(evaluateFloor(stats)).toEqual([]);
  });
});

describe("quality-floor evidence window — genuine new failures still re-quarantine", () => {
  // Days later: 15 NEW eligible calls have landed since promotion (well past
  // minCalls), and they are genuinely bad — 5 completed, 10 failed across two
  // distinct days. The clamp resets the window; it does not grant immunity.
  const genuinelyFailingPostPromotionRows: FloorTrafficRow[] = [
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "completed", error: null, day: "2026-08-15", recent: true, n: 5 },
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "failed", error: "upstream unavailable", day: "2026-08-15", recent: true, n: 5 },
    { slug: "screenshot-url", lifecycle_state: "active", visible: true, x402_enabled: true,
      source: "transaction", success: null, counts: null,
      status: "failed", error: "upstream unavailable", day: "2026-08-16", recent: true, n: 5 },
  ];

  it("re-quarantines on ≥10 genuinely-failing NEW calls, evaluated purely on post-promotion evidence", () => {
    const stats = foldTrafficRows(genuinelyFailingPostPromotionRows, REVENUE);
    const [d] = evaluateFloor(stats);
    expect(d.eligibleCalls).toBe(15);
    expect(d.action).toBe("quarantine");
  });
});
