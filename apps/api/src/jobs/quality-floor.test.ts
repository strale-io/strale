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
import {
  FACT_SHORTFALL_MIN_TRANSACTIONS,
  FACT_SHORTFALL_RATIO,
  foldTrafficRows,
  isFactVolumeShortfall,
  type FloorTrafficRow,
} from "./quality-floor.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Source with comments stripped — these assertions are about what the code
 * does, and the fix's own docstring names the bug pattern it replaces. */
const readCode = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    // Line endings normalised FIRST. Git checks these files out with CRLF on
    // Windows and LF elsewhere, so a multi-line assertion would pass on one
    // machine and fail on the other, and one that fails only in CI is
    // indistinguishable from one that is simply wrong.
    .replace(/\r\n/g, "\n")
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
describe("WP9 — the volume cross-check thresholds", () => {
  // Round 2 found the thresholds untested: setting the ratio to 0 -- which makes
  // the check permanently unable to fire -- passed the entire suite, because the
  // comparison lived in SQL that no test executed. These assert the behaviour,
  // so the numbers cannot be moved to nothing silently.
  it("stays quiet below the minimum transaction count, however few facts there are", () => {
    // Low-volume capabilities are noisy by nature; a delisting must not be
    // suppressed forever because one call in nine went unrecorded.
    expect(isFactVolumeShortfall(0, 9)).toBe(false);
    expect(isFactVolumeShortfall(0, FACT_SHORTFALL_MIN_TRANSACTIONS - 1)).toBe(false);
  });

  it("fires when facts fall below half the billed calls", () => {
    expect(isFactVolumeShortfall(4, 10)).toBe(true);
    expect(isFactVolumeShortfall(0, 100)).toBe(true);
  });

  it("stays quiet when facts merely trail billed calls a little", () => {
    // Facts and transactions do not correspond one-to-one by design, so a tight
    // ratio would fire on every solution step and every rolled-back wallet
    // transaction -- and a check that fires constantly gets ignored.
    expect(isFactVolumeShortfall(5, 10)).toBe(false);
    expect(isFactVolumeShortfall(90, 100)).toBe(false);
  });

  it("never fires when facts exceed billed calls, which is the normal bundle case", () => {
    // A solution step produces a fact with no transaction of its own. That is
    // the whole point of WP9, and it must not read as evidence loss.
    expect(isFactVolumeShortfall(300, 100)).toBe(false);
  });

  it("the shipped thresholds are the ones these cases describe", () => {
    // Pins the constants themselves: the cases above use explicit numbers, so
    // without this a change to the defaults would leave them all passing while
    // production behaved differently.
    expect(FACT_SHORTFALL_MIN_TRANSACTIONS).toBe(10);
    expect(FACT_SHORTFALL_RATIO).toBe(0.5);
  });
});

/**
 * The two projections, verbatim. Held as constants so the assertion is the
 * whole SELECT list rather than a sample of it -- every previous round pinned a
 * subset and the next round found the defect in the columns left out.
 */
const FACT_PROJECTION = `            SELECT s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                   'fact'::text AS source,
                   NULL::text AS status, NULL::text AS error,
                   f.success, f.counts_against_capability AS counts,
                   date_trunc('day', f.created_at)::date::text AS day,
                   (f.created_at > NOW() - INTERVAL '7 days') AS recent,
                   COUNT(*)::int AS n`;

const TXN_PROJECTION = `        SELECT s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
               'transaction'::text AS source,
               t.status, t.error,
               NULL::boolean AS success, NULL::boolean AS counts,
               date_trunc('day', t.created_at)::date::text AS day,
               (t.created_at > NOW() - INTERVAL '7 days') AS recent,
               COUNT(*)::int AS n`;

describe("WP9 — the floor's fact/transaction sources", () => {
  const src = readCode("quality-floor.ts");
  const migration = readCode("../lib/startup-migrations.ts");

  it("asks whether the fact table exists before mentioning it in a query", () => {
    // Postgres resolves relations at parse time, so a query that merely NAMES a
    // missing table fails however it is guarded internally. Block 0101 is
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
    // And what the epoch IS. MIN -> MAX moves it to the newest fact, so the fact
    // branch matches nothing and the transaction branch reclaims the whole
    // window: the floor silently reverts to pre-WP9 behaviour with solution
    // steps invisible again, while the heartbeat reports a plausible fact_epoch
    // and facts_table_present: true.
    expect(src).toContain("SELECT COALESCE(MIN(created_at), NOW()) AS epoch");
  });

  it("actually feeds both sources to the fold", () => {
    // Every pin on the fact query is a slice assertion bounded by
    // `const rows = [`, so dropping `...factRows` leaves all of that SQL in the
    // file and none of it reaching foldTrafficRows. Once the table outlives the
    // window the transaction branch returns nothing either, and the floor sees
    // no traffic on any capability, forever, reporting `evaluated: 0` on a
    // heartbeat indistinguishable from a quiet day.
    //
    // This is the package's entire exit condition, and nothing asserted it.
    expect(src).toContain("const rows = [...transactionRows, ...factRows];");
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
    // Bounded to the fact query. The first version sliced to end-of-file, so it
    // also covered the revenue query -- which carries an identical clamp, so
    // removing the clamp from the FACT source left both substrings intact and
    // the test green. That is precisely the "grace period that held on one
    // source and not the other" this test exists to prevent, and the fourth
    // hollow assertion this program has found.
    const factQuery = src.slice(
      src.indexOf("const factRows"),
      src.indexOf("const rows = ["),
    );
    expect(factQuery.length).toBeGreaterThan(200);
    expect(factQuery).toContain("COALESCE(lp.promoted_at, '-infinity'::timestamptz)");
    expect(factQuery).toContain("GREATEST(s.win_start,");
  });

  it("selects the values the filters exist to deliver", () => {
    // Every predicate in this query was pinned individually; the four VALUES
    // they exist to produce were not, and all four one-token mutations survived.
    //
    // Relabelling 'fact' as 'transaction' is the worst of them: those rows then
    // take the pre-epoch fold branch, where status and error are NULL,
    // classifyTransactionFailure(null) returns "internal", and every healthy
    // call becomes a counted failure. Measured through the fold: a perfectly
    // healthy capability reads 0/60 and is quarantined with a deactivation
    // proposal, every tick, across the whole post-epoch catalog, suite green.
    //
    // Inverting f.success is the mirror image -- healthy traffic vanishes from
    // the fold and broken traffic reads as completed. That is the pin-everything
    // -at-100% shape the writer test exists to prevent, closed where the column
    // is written and left open where it is read back out.
    //
    // Rewriting the JOIN key matches nothing and blinds the floor entirely.
    const factQuery = src.slice(
      src.indexOf("const factRows"),
      src.indexOf("const rows = ["),
    );
    // The WHOLE projection, both branches, verbatim.
    //
    // Pinning columns one at a time is what produced this finding twice. Round
    // 10 pinned four of the fact query's seven projected values; the remaining
    // three -- `day`, `recent` and `n` -- were each a total silent disarm, and
    // all four mutations against them survived the full suite:
    //
    //   date_trunc('day') -> 'year'  collapses every failure into one calendar
    //     bucket, so distinctFailureDays is always 1, the burst guard fires on
    //     every candidate forever, and NOTHING is ever quarantined -- while the
    //     heartbeat still reports evaluated: N, decisions: N.
    //   COUNT(*) -> 1  makes eligibleCalls count distinct GROUP BY buckets
    //     rather than calls, so minCalls: 10 is never reached and every tick
    //     reports decisions: 0.
    //   recent inverted  swaps the trailing 7 days for the 8-to-30-day window,
    //     so a capability that broke this week is deferred indefinitely by last
    //     month's healthy traffic, and one that recovered this week is
    //     quarantined on old failures -- the screenshot-url bounce the
    //     promotion clamp exists to prevent.
    //
    // Every one of those inputs was pinned AT THE FOLD and none at the query
    // that produces them. So the assertion is now the projection itself: there
    // is no longer a column "one over" to be missed, and a deliberate change
    // has to update this literal, which is the point.
    expect(factQuery).toContain(FACT_PROJECTION);
    expect(factQuery).toContain(
      "JOIN capability_invocations f ON f.capability_slug = s.slug",
    );

    const txnQuery = src.slice(
      src.indexOf("const transactionRows"),
      src.indexOf("const factRows"),
    );
    expect(txnQuery.length).toBeGreaterThan(200);
    expect(txnQuery).toContain(TXN_PROJECTION);
  });

  it("excludes harness and free-tier traffic from the fact source", () => {
    // The fact branch has no `is_free_tier` column on transactions to lean on,
    // so the equivalent exclusions have to be spelled out or ~98% of platform
    // traffic would be read as customer experience.
    const factQuery = src.slice(
      src.indexOf("const factRows"),
      src.indexOf("const rows = ["),
    );
    expect(factQuery).toContain("AND f.context_kind = 'customer_paid'");
    expect(factQuery).toContain("AND f.is_free_tier = false");
    // The WHOLE predicate, not the NOT IN fragment. Inverting the leading
    // `IS NULL OR` to `IS NOT NULL AND` leaves that fragment untouched and
    // removes 97.1% of the floor's evidence: 2,522 of 2,597 floor-eligible rows
    // in a 30-day window carry a NULL user_id, because every x402 call does.
    // The tick then evaluates almost nothing, quarantines nothing, and writes a
    // healthy-looking heartbeat -- and the volume cross-check cannot catch it,
    // because its own CTE keeps the NULL branch, so facts still match
    // transactions. Completely silent.
    expect(factQuery).toContain("AND (f.user_id IS NULL OR f.user_id NOT IN (");
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
    expect(revenueQuery).toContain("AND (rt.user_id IS NULL OR rt.user_id NOT IN (");
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
    // Populated FROM the detector. Asserting only that the function exists and
    // that a variable is assigned would pass against a version that computes an
    // always-empty map -- a check that can never fire, which is the shape this
    // finding had in the first place.
    expect(src).toContain("await detectFactVolumeShortfall(");
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
    expect(heartbeat).toContain("facts_table_present: tablePresent");
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
    const block = migration.slice(
      migration.indexOf("export async function runMigration0101_capabilityInvocations"),
      migration.indexOf("export const BLOCKS"),
    );
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toContain(
      `DROP TRIGGER IF EXISTS "capability_invocations_immutable_trg"`,
    );
    // The SENSE, not the presence. Inverting IF NOT EXISTS to IF EXISTS means
    // the trigger is never created on a fresh table -- leaving it fully mutable
    // while to_regclass still reports it present, so the floor would treat a
    // rewritable table as authoritative evidence for a delisting. The first
    // version of this test asserted only that "FROM pg_trigger" appeared
    // somewhere, and that mutation survived it.
    expect(block).toContain("IF NOT EXISTS (");
    // The verification, pinned by its WHOLE assignment. `toContain("await
    // hasImmutableTrigger(tx)")` became hollow the moment the purge gate added
    // a second call site: replacing the verification with `const triggerCount =
    // 1;` left both that substring and `if (triggerCount !== 1)` in the file,
    // and the block then reported "present and verified" for a table with no
    // trigger. Eighth hollow assertion in this program, third one created
    // inside the remediation for the previous one.
    expect(block).toContain(
      "const triggerCount = (await hasImmutableTrigger(tx)) ? 1 : 0;",
    );
    expect(block).toContain("if (triggerCount !== 1)");
    // And it must discard anything written before protection existed rather
    // than letting a later boot retroactively bless it. CREATE TABLE
    // autocommits, so a block failing between the table and the trigger leaves
    // the writer filling an unguarded table -- and the floor keys its epoch on
    // MIN(created_at), so those rows would become authoritative evidence the
    // moment the trigger finally appeared.
    // The purge is gated on BOTH the ledger (a genuine first install) and the
    // trigger being absent. Dropping the trigger for maintenance and rebooting
    // must not destroy live facts, which the trigger-only gate would have done.
    expect(block).toContain("if (firstInstall && !(await hasImmutableTrigger(tx)))");
    expect(block).toContain('DELETE FROM "capability_invocations"');
    // And bounded. An unbounded boot-time DELETE on a table taking ~6k rows a
    // day is a bulk operation; DEC-20260504-B says those get a plan and an
    // operator, not a boot path. Beyond the ceiling the block refuses, which
    // defers it, leaves the floor on billing rows, and destroys nothing.
    expect(block).toContain("UNPROTECTED_PURGE_CEILING");
    expect(block).toContain("UNPROTECTED-BACKLOG");
  });

  it("the trigger refuses what it is installed to refuse", () => {
    // Everything about this trigger was asserted except what it DOES. The stub
    // harness in startup-migrations.test.ts queues opaque results and never
    // evaluates SQL, so the one statement whose semantics are this table's
    // entire safety argument was invisible to it -- and `factsProtected`, the
    // floor's whole reason for trusting facts, is satisfied by a trigger whose
    // body refuses nothing.
    //
    // Three mutations survived: refusing INSERT instead of UPDATE, dropping
    // UPDATE from the trigger definition, and inverting the 35-day comparison
    // so fresh evidence inside the floor's window becomes deletable while the
    // nightly purge raises on every run.
    expect(migration).toContain("IF TG_OP = 'UPDATE' THEN");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON");
    expect(migration).toContain(
      "IF TG_OP = 'DELETE' AND OLD.created_at > now() - INTERVAL '35 days' THEN",
    );
  });

  it("refuses to treat an unprotected facts table as evidence", () => {
    // A table without its append-only trigger is worse than no table: it still
    // reads as present, so the floor would decide delistings from rows anything
    // could have rewritten. The consumer checks rather than trusting the
    // producer, because a deferred migration can leave exactly that state.
    // The SENSE. `toContain("EXISTS (")` is satisfied by `NOT EXISTS (`, and
    // that mutation survived: inverted, `factsProtected` is true exactly when
    // the trigger is ABSENT, so a healthy production would never read facts at
    // all (WP9 silently delivering nothing) while an unprotected table would be
    // trusted. Sixth hollow assertion in this program, and the second in a row
    // to appear inside the remediation for the previous one.
    expect(src).toContain("          EXISTS (");
    expect(src).toContain("WHERE tgname = 'capability_invocations_immutable_trg'");
    expect(src).toContain("AND tgrelid = to_regclass('public.capability_invocations')");
    expect(src).toContain("const factsReady = tablePresent && factsProtected;");
    const heartbeat = src.slice(src.indexOf(`actionTaken: "tick_complete"`));
    expect(heartbeat).toContain("facts_table_protected: factsProtected");
  });

  it("thresholds the volume cross-check in code, where a test can reach it", () => {
    // The comparison used to live in the SQL, so setting the ratio to 0 -- which
    // makes the check permanently unable to fire -- passed every test. The
    // behaviour of the threshold is now asserted directly, below.
    expect(src).toContain("export function isFactVolumeShortfall");
    expect(src).toContain(".filter((r) => isFactVolumeShortfall(r.facts, r.txns))");
    expect(src).toContain("WHERE txn.n > 0`;");
    // The SELECT list and the join -- what round 10 pinned for the floor's two
    // queries and not for this one. Transposing the aliases makes the shortfall
    // fire on every capability with bundle traffic, suppressing every quarantine
    // platform-wide while looking like a working safety mechanism, and makes the
    // total-loss case it exists for evaluate to false. Turning the LEFT JOIN
    // into a JOIN drops zero-fact capabilities out entirely, which IS that case.
    expect(src).toContain("SELECT txn.slug, COALESCE(fct.n, 0) AS facts, txn.n AS txns");
    expect(src).toContain("FROM txn LEFT JOIN fct ON fct.slug = txn.slug");
    // And the two counts feeding it. Making the fact CTE permanently empty
    // survived mutation: every capability with >=10 billed calls would then
    // look like total evidence loss, every quarantine platform-wide would be
    // suppressed, and the armed safety mechanism would be silently disarmed
    // with no test failing.
    const fn = src.slice(
      src.indexOf("async function detectFactVolumeShortfall"),
      src.indexOf("export function isEnforceMode"),
    );
    expect(fn.length).toBeGreaterThan(400);
    expect(fn).toContain("FROM capability_invocations");
    expect(fn).toContain("AND context_kind = 'customer_paid'");
    expect(fn).toContain("AND is_free_tier = false");
    expect(fn).toContain("JOIN transactions t ON t.capability_id = c.id");
    expect(fn).toContain("t.status IN ('completed', 'failed')");
    // Both CTEs must measure the same population, or the ratio is meaningless.
    // The transaction side excluded internal accounts and the fact side did not,
    // which inflated facts and biased the check toward SILENCE -- the unsafe
    // direction, since silence means the floor acts on possibly-holed evidence.
    expect((fn.match(/email LIKE ANY\(/g) ?? []).length).toBe(2);
    // Counting occurrences survives inverting the predicate -- that mutation
    // got through. Assert the sense on BOTH sides.
    expect(fn).toContain("AND (user_id IS NULL OR user_id NOT IN (");
    expect(fn).toContain("AND (t.user_id IS NULL OR t.user_id NOT IN (");
  });

  it("bounds the cross-check to the decision window, not the whole fact table", () => {
    // Bounding on the epoch alone let the comparison window grow to the 180-day
    // retention, so a total loss confined to the recent 30 days scored 150/180
    // and never fired. It worked the day it shipped and weakened daily after.
    expect(src).toContain("Math.max(epoch.getTime(), Date.now() - 30 * 24 * 60 * 60 * 1000)");
    expect(src).toContain("AND t.created_at >= ${windowStart}::timestamptz");
    expect(src).toContain("WHERE created_at >= ${windowStart}::timestamptz");
  });

  it("does not pretend to set a lock timeout that cannot take effect", () => {
    // `SET LOCAL` outside a transaction block is discarded, and blocks receive
    // the DB handle rather than a transaction. A bound that does not bind is
    // worse than none: the next reader believes the DDL is protected.
    const block = migration.slice(
      migration.indexOf("runMigration0101_capabilityInvocations"),
    );
    const body = block.slice(0, block.indexOf("export async function", 1) + 1 || undefined);
    expect(body).not.toContain("SET LOCAL lock_timeout");
  });
});
