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

/**
 * WP9 — the SQL the floor actually issues.
 *
 * The first independent review found five blocking defects here and observed
 * that nothing tested this query at all: `foldTrafficRows` was fed hand-built
 * rows, so every assertion was about the fold and none about the thing that
 * decides which rows exist. These assertions read the source with comments
 * STRIPPED, so a claim in a docstring cannot satisfy one.
 */
describe("WP9 — the floor's fact/transaction sources", () => {
  const src = readCode("quality-floor.ts");
  const migration = readCode("../lib/startup-migrations.ts");

  it("asks whether the fact table exists before mentioning it in a query", () => {
    // Postgres resolves relations at parse time, so a query that merely NAMES a
    // missing table fails however it is guarded internally. Block 0100 is
    // defer-not-throw, so the table genuinely may not be there -- and an
    // unguarded probe would throw past the decision loop, leaving the tick with
    // no decisions AND no heartbeat. The heartbeat is the DEC-20260504-C proof
    // that the job ran, so the failure would erase its own evidence, on a floor
    // that is armed in production rather than dry-run.
    expect(src).toContain(`to_regclass('public.capability_invocations') IS NOT NULL AS ready`);
    // And the fact query must be conditional on that answer, not merely the
    // epoch value.
    expect(src).toMatch(/const factRows = factsReady\s*\?/);
    expect(src).toMatch(/const epoch = factsReady\s*\?/);
  });

  it("keeps the two sources disjoint across the epoch", () => {
    // Transactions strictly below, facts at or above. Overlap would double-count
    // a capability's traffic; a gap would silently drop a day of it.
    expect(src).toContain("AND t.created_at < ${epoch}::timestamptz");
    expect(src).toContain("WHERE f.created_at >= GREATEST(s.win_start, ${epoch}::timestamptz)");
  });

  it("applies the promotion clamp to the fact source too", () => {
    // A grace period that held on one source and not the other would
    // reintroduce the contaminated-window bounce the clamp exists to stop.
    const factQuery = src.slice(src.indexOf("const factRows"));
    expect(factQuery).toContain("COALESCE(lp.promoted_at, '-infinity'::timestamptz)");
    expect(factQuery).toContain("GREATEST(s.win_start,");
  });

  it("excludes harness and free-tier traffic from the fact source", () => {
    // The fact branch has no `is_free_tier` column on transactions to lean on,
    // so the equivalent exclusions have to be spelled out or ~98% of platform
    // traffic would be read as customer experience.
    const factQuery = src.slice(src.indexOf("const factRows"));
    expect(factQuery).toContain("AND f.context_kind = 'customer_paid'");
    expect(factQuery).toContain("AND f.is_free_tier = false");
    expect(factQuery).toContain("f.user_id NOT IN (");
  });

  it("keeps internal accounts out of the revenue figure", () => {
    // Regression on a measured defect: the first version of the revenue query
    // dropped the internal-account exclusion, the free-tier filter and the
    // promotion clamp, because revenue moved out of a fold that had already
    // applied them. 202 active capabilities went from zero external revenue to
    // non-zero purely on internal accounts, so `requiresHuman` -- the flag that
    // decides whether a deactivation proposal is a Petter-only call -- stopped
    // discriminating. lib/internal-accounts.ts names revenue explicitly.
    const revenueQuery = src.slice(
      src.indexOf("const revenueRows"),
      src.indexOf("const revenueBySlug"),
    );
    expect(revenueQuery).toContain("SUM(rt.price_cents)");
    // The SENSE of each predicate, not a fragment of it. Two mutations survived
    // the first version of this test: inverting NOT IN to IN left
    // "email LIKE ANY(" untouched, and dropping the clamp from the WHERE clause
    // left the CTE that computes it sitting there unused. A guard that matches
    // a substring present in both the correct and the broken form is not a
    // guard -- the same class of hollow assertion WP8 shipped and this program
    // keeps re-finding.
    expect(revenueQuery).toContain("rt.user_id NOT IN (");
    expect(revenueQuery).toContain("email LIKE ANY(");
    expect(revenueQuery).toContain("COALESCE(rt.is_free_tier, false) = false");
    expect(revenueQuery).toContain("WHERE rt.created_at > s.win_start");
  });

  it("cross-checks fact volume against billed volume, not only marker events", () => {
    // The module's own safety argument calls this the load-bearing defence, on
    // the grounds that a marker event is written to the same database that just
    // refused the fact -- so it is absent exactly when the cause is "the
    // database was unreachable". It was documented and not implemented.
    expect(src).toContain("async function detectFactVolumeShortfall");
    expect(src).toContain("FROM capability_invocations");
    expect(src).toMatch(/volumeShortfall = factsReady/);
    // And it must actually gate the action, not merely be computed.
    expect(src).toContain("holes > 0 || shortfall !== null");
    expect(src).toContain("mode === \"enforce\" && !evidenceIncomplete");
  });

  it("puts the fact-source state on the heartbeat, where a zero-decision tick can be verified", () => {
    // WP9's own post-deploy verification asks whether the floor is reading
    // complete evidence. A zero-decision tick is the expected steady state, so
    // a field that appears only on per-decision events cannot answer it, and a
    // proof query returning nothing is the same as skipping verification.
    const heartbeat = src.slice(src.indexOf(`actionTaken: "tick_complete"`));
    expect(heartbeat).toContain("facts_table_present: factsReady");
    expect(heartbeat).toContain("fact_epoch: epoch.toISOString()");
    expect(heartbeat).toContain("evidence_holes: holedEvidence.size");
    expect(heartbeat).toContain("evidence_shortfalls: volumeShortfall.size");
  });

  it("never drops the append-only trigger it just installed", () => {
    // The first version ran DROP TRIGGER IF EXISTS then CREATE TRIGGER on every
    // boot. Those autocommit separately -- blocks get the DB handle, not a
    // transaction -- so every boot opened a window with no append-only
    // protection on a table whose whole purpose is immutability, and took
    // ACCESS EXCLUSIVE on a table the customer path writes to.
    expect(migration).not.toContain(
      `DROP TRIGGER IF EXISTS "capability_invocations_immutable_trg"`,
    );
    expect(migration).toContain("FROM pg_trigger");
    expect(migration).toContain("tgname = 'capability_invocations_immutable_trg'");
  });

  it("does not pretend to set a lock timeout that cannot take effect", () => {
    // `SET LOCAL` outside a transaction block is discarded, and blocks receive
    // the DB handle rather than a transaction. A bound that does not bind is
    // worse than none: the next reader believes the DDL is protected.
    const block = migration.slice(
      migration.indexOf("runMigration0100_capabilityInvocations"),
    );
    const body = block.slice(0, block.indexOf("export async function", 1) + 1 || undefined);
    expect(body).not.toContain("SET LOCAL lock_timeout");
  });
});
